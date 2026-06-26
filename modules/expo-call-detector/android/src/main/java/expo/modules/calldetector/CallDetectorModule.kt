package expo.modules.calldetector

import androidx.core.os.bundleOf
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Android stub: call detection is not implemented here yet (the equivalent is TelephonyManager /
// TelephonyCallback, which needs the READ_PHONE_STATE permission). It reports "no call" so the
// recorder behaves exactly as before on Android — the mic just isn't auto-dropped during a call
// yet. iOS (CallKit) is the implemented platform; wire this up when Android needs the behaviour.
class CallDetectorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CallDetector")

    Events("onCallStateChange")

    Function("isCallActive") { false }

    // No-op on Android (no UIBackgroundTask equivalent; background capture is a separate concern).
    // Return a sentinel id; endBackgroundTask ignores it.
    Function("beginBackgroundTask") { -1 }
    Function("endBackgroundTask") { _: Int -> }

    OnStartObserving {
      sendEvent("onCallStateChange", bundleOf("isActive" to false))
    }
  }
}
