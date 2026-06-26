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
  // Created on first use; CXCallObserver holds its delegate weakly, so the module owns both.
  private lazy var callObserver: CXCallObserver = {
    let observer = CXCallObserver()
    observer.setDelegate(self.delegate, queue: nil) // nil => deliver on the main queue
    return observer
  }()

  // A call (ringing, dialing, or connected) holds the mic until it has ended. Telephony outranks
  // the app for the microphone, so any non-ended call means we must not capture audio.
  private var isCallActive: Bool {
    callObserver.calls.contains { !$0.hasEnded }
  }

  public func definition() -> ModuleDefinition {
    Name("CallDetector")

    Events("onCallStateChange")

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
        UIApplication.shared.endBackgroundTask(taskId)
        taskId = .invalid
      }
      return taskId.rawValue
    }

    Function("endBackgroundTask") { (rawId: Int) in
      let taskId = UIBackgroundTaskIdentifier(rawValue: rawId)
      guard taskId != .invalid else { return }
      UIApplication.shared.endBackgroundTask(taskId)
    }

    OnStartObserving {
      self.delegate.onChange = { [weak self] in
        guard let self else { return }
        self.sendEvent("onCallStateChange", ["isActive": self.isCallActive])
      }
      // Touch the lazy observer so it's created and its delegate attached, then emit the current
      // state immediately — CXCallObserver only pushes future *changes*, so a call already in
      // progress when the listener attaches would otherwise be missed.
      _ = self.callObserver
      self.sendEvent("onCallStateChange", ["isActive": self.isCallActive])
    }

    OnStopObserving {
      self.delegate.onChange = nil
    }
  }
}
