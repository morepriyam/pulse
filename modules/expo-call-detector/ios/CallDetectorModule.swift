import CallKit
import ExpoModulesCore
import UIKit

// CXCallObserver requires an NSObject delegate, which an Expo `Module` is not — so this thin
// object holds the observer's delegate role and forwards every call-state change back to the
// module through a closure.
final class CallObserverDelegate: NSObject, CXCallObserverDelegate {
  var onChange: (() -> Void)?

  func callObserver(_ callObserver: CXCallObserver, callChanged call: CXCall) {
    onChange?()
  }
}

public class CallDetectorModule: Module {
  private let delegate = CallObserverDelegate()
  // Created eagerly in OnCreate (NOT lazily): isCallActive() is a synchronous Function that runs on
  // the JS thread, while OnStartObserving runs on the module thread — a lazy first-touch from both
  // is an unsynchronized race that could construct two observers. CXCallObserver holds its delegate
  // weakly, so the module owns both.
  private var callObserver: CXCallObserver?

  // A call (ringing, dialing, or connected) holds the mic until it has ended. Telephony outranks
  // the app for the microphone, so any non-ended call means we must not capture audio.
  private var isCallActive: Bool {
    callObserver?.calls.contains { !$0.hasEnded } ?? false
  }

  // Background tasks we've begun but not yet ended, guarded by a lock. iOS may fire a task's
  // expiration handler before JS calls endBackgroundTask, so we track which ids are still live and
  // end each exactly once — calling UIApplication.endBackgroundTask twice on the same id is an
  // unbalanced end that iOS warns about.
  private var activeTasks = Set<Int>()
  private let tasksLock = NSLock()

  private func endTask(_ rawId: Int) {
    tasksLock.lock()
    let wasActive = activeTasks.remove(rawId) != nil
    tasksLock.unlock()
    guard wasActive else { return }
    let taskId = UIBackgroundTaskIdentifier(rawValue: rawId)
    guard taskId != .invalid else { return }
    UIApplication.shared.endBackgroundTask(taskId)
  }

  public func definition() -> ModuleDefinition {
    Name("CallDetector")

    Events("onCallStateChange")

    OnCreate {
      let observer = CXCallObserver()
      observer.setDelegate(self.delegate, queue: nil) // nil => deliver on the main queue
      self.callObserver = observer
    }

    // Synchronous snapshot for the very first render, before any event has been delivered.
    Function("isCallActive") { () -> Bool in
      self.isCallActive
    }

    // Background-execution helpers so the recorder can finish writing a clip to disk after the app
    // is backgrounded mid-recording — iOS otherwise suspends within ~5s and can truncate a large
    // file copy. JS holds a task across the finalize+persist and ends it when done. Both are safe
    // to call from any thread; the expiration handler ends the task if iOS runs out of patience.
    Function("beginBackgroundTask") { () -> Int in
      var taskId: UIBackgroundTaskIdentifier = .invalid
      taskId = UIApplication.shared.beginBackgroundTask(withName: "PulseFinalizeRecording") {
        self.endTask(taskId.rawValue)
      }
      let rawId = taskId.rawValue
      self.tasksLock.lock()
      self.activeTasks.insert(rawId)
      self.tasksLock.unlock()
      return rawId
    }

    Function("endBackgroundTask") { (rawId: Int) in
      self.endTask(rawId)
    }

    OnStartObserving {
      self.delegate.onChange = { [weak self] in
        guard let self else { return }
        self.sendEvent("onCallStateChange", ["isActive": self.isCallActive])
      }
      // Emit the current state immediately — CXCallObserver only pushes future *changes*, so a call
      // already in progress when the listener attaches would otherwise be missed.
      self.sendEvent("onCallStateChange", ["isActive": self.isCallActive])
    }

    OnStopObserving {
      self.delegate.onChange = nil
    }
  }
}
