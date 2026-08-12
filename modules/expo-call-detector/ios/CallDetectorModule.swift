import AVFAudio
import ExpoModulesCore
import UIKit

// Call detection WITHOUT CallKit: the MIIT requires CallKit to be inactive in apps on the China
// App Store, and App Review flags the framework linkage itself (Guideline 5, see issue #146) — so
// nothing here may import it. Instead we observe AVAudioSession interruptions, which Apple
// documents as the mechanism that fires for incoming phone calls ("System alerts, such as
// receiving an incoming phone call, interrupt the active audio session"). `.began` latches
// "something that outranks us holds the audio session" and `.ended` clears it. Interruptions are
// not strictly call-only (Siri and alarms also fire) — but for "stop capturing audio, we lost the
// mic" that is the more correct trigger anyway, and it matches the Android detector's semantics
// (AudioManager.getMode() is likewise not call-exclusive).
//
// Ring-time behavior (verified on-device): with the ringer AUDIBLE, the ringtone itself interrupts
// our session, so the latch fires while the call is still ringing — pre-answer, matching the old
// CXCallObserver timing in the common case. With the silent switch on there is no ringtone, so
// nothing fires until the call is actually answered (the system takes the audio session then).
//
// Known gaps, all covered by the '!pri' recovery path in recorder.tsx (an AVAudioSession
// activation attempted during a call fails with ErrorCode.insufficientPriority —
// '!pri' / 561017449 — which onCameraError matches and recovers from by rebuilding video-only):
//  - A call already in progress when the recorder opens is invisible to the latch: none of our
//    audio was active to be interrupted, so isCallActive() reads false and the mic attach fails
//    reactively instead. If that call then ends while the app stays foreground the whole time
//    (verified: hanging up from the Dynamic Island does NOT background the app), no event exists
//    to clear the gate — the next background/foreground cycle recovers it via the force-clear.
//  - A `.began` has NO guaranteed matching `.ended` (the user answers and the app suspends, or we
//    deactivate our own session mid-interruption). A stale latch would wedge the recorder
//    video-only forever, so didBecomeActive force-clears it on every foreground; if a call is
//    genuinely still active the next mic attach re-gates through the same '!pri' path.
//  - Any call that never interrupts our session — VoIP or otherwise (verified on-device with
//    WhatsApp Audio) — is invisible: the latch is app-agnostic and only sees audio-session
//    interruptions. CXCallObserver would have reported these, but no CallKit-free event source
//    exists. Acceptable: with no actual audio-session conflict, recording keeps working through
//    the call, so there is nothing to protect against (tracked as a known limitation, #146).
public class CallDetectorModule: Module {
  // The interruption latch. Written on the main queue by the notification handlers, read
  // synchronously from the JS thread by isCallActive() — hence the lock. `observing` (JS listener
  // attached) lives under the same lock: it's flipped from the module thread by
  // OnStart/OnStopObserving while handlers race it on main.
  private var interruptionActive = false
  private var observing = false
  private let stateLock = NSLock()
  private var notificationTokens: [NSObjectProtocol] = []

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

  private func emitCallState(_ active: Bool) {
    if Thread.isMainThread {
      sendEvent("onCallStateChange", ["isActive": active])
    } else {
      DispatchQueue.main.async { [weak self] in
        self?.sendEvent("onCallStateChange", ["isActive": active])
      }
    }
  }

  // Updates the latch; emits onCallStateChange on a real change (or always, when `force`) if JS is
  // subscribed. `force` exists for the foreground clear: JS treats ANY event as authoritative and
  // uses it to drop its '!pri' mic-blocked override (see use-call-state.ts), so the clear must emit
  // even when the latch was already false — e.g. a call the latch never saw that has since ended.
  private func setInterruptionActive(_ active: Bool, force: Bool = false) {
    stateLock.lock()
    let changed = interruptionActive != active
    interruptionActive = active
    let shouldEmit = (changed || force) && observing
    stateLock.unlock()
    if shouldEmit {
      emitCallState(active)
    }
  }

  private func handleInterruption(_ notification: Notification) {
    guard let userInfo = notification.userInfo,
          let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }
    // A suspended-app interruption would latch a phantom call on resume — two generations of the
    // same signal, both filtered defensively even though neither is delivered at our 16.4 floor:
    //  - iOS 14.5–15.x: reason .appWasSuspended (raw value 1); the SDK marks it "not present from
    //    iOS 16 onwards" (checked by raw value so we don't touch the deprecated symbol).
    //  - iOS 10.3–14.5: the older wasSuspended boolean key issue #146 names explicitly, superseded
    //    by the reason key above but still checked here for belt-and-suspenders / older SDKs.
    if let reason = userInfo[AVAudioSessionInterruptionReasonKey] as? UInt, reason == 1 { return }
    if let wasSuspended = userInfo[AVAudioSessionInterruptionWasSuspendedKey] as? Bool, wasSuspended {
      return
    }
    switch type {
    case .began:
      setInterruptionActive(true)
    case .ended:
      setInterruptionActive(false)
    @unknown default:
      break
    }
  }

  public func definition() -> ModuleDefinition {
    Name("CallDetector")

    Events("onCallStateChange")

    OnCreate {
      // Registered eagerly (not in OnStartObserving) so the latch is already tracking when JS takes
      // its synchronous isCallActive() snapshot on first render, before any listener attaches.
      let center = NotificationCenter.default
      self.notificationTokens.append(center.addObserver(
        forName: AVAudioSession.interruptionNotification,
        object: AVAudioSession.sharedInstance(),
        queue: .main
      ) { [weak self] notification in
        self?.handleInterruption(notification)
      })
      self.notificationTokens.append(center.addObserver(
        forName: UIApplication.didBecomeActiveNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        // Force-clear on every foreground (see the header comment): a missed `.ended` must not
        // leave the recorder wedged video-only, and JS needs the event even when the latch was
        // already false so its '!pri' override clears too.
        self?.setInterruptionActive(false, force: true)
      })
    }

    OnDestroy {
      self.notificationTokens.forEach(NotificationCenter.default.removeObserver)
      self.notificationTokens.removeAll()
    }

    // Synchronous snapshot for the very first render, before any event has been delivered. A call
    // already in progress at cold open reads false here BY DESIGN — the '!pri' fallback above is
    // the recovery path for that case.
    Function("isCallActive") { () -> Bool in
      self.stateLock.lock()
      defer { self.stateLock.unlock() }
      return self.interruptionActive
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
      self.stateLock.lock()
      self.observing = true
      let active = self.interruptionActive
      self.stateLock.unlock()
      // Emit the current state immediately — interruptions only push future *changes*, so a latch
      // set before the listener attached would otherwise be missed.
      self.emitCallState(active)
    }

    OnStopObserving {
      self.stateLock.lock()
      self.observing = false
      self.stateLock.unlock()
    }
  }
}
