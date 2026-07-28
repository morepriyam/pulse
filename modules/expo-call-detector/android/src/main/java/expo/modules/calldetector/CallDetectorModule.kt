package expo.modules.calldetector

import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.annotation.RequiresApi
import androidx.core.os.bundleOf
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executor

/**
 * Isolates the API 31+ [AudioManager.OnModeChangedListener] type so [CallDetectorModule] never
 * references it directly — the interface (and the lambda class implementing it) only gets loaded
 * on devices where it exists.
 */
@RequiresApi(Build.VERSION_CODES.S)
private class ModeChangeObserver(onChange: () -> Unit) {
  private val listener = AudioManager.OnModeChangedListener { onChange() }

  fun register(audioManager: AudioManager, executor: Executor) =
    audioManager.addOnModeChangedListener(executor, listener)

  fun unregister(audioManager: AudioManager) =
    audioManager.removeOnModeChangedListener(listener)
}

/**
 * Android counterpart of the iOS CallKit-based detector, built on `AudioManager.getMode()` —
 * telephony/VoIP flips the global audio mode to RINGTONE / IN_CALL / IN_COMMUNICATION, which
 * mirrors CXCallObserver's "ringing, dialing, or connected" semantics without needing the
 * READ_PHONE_STATE permission (and unlike TelephonyCallback it also covers VoIP apps).
 *
 * Change delivery: API 31+ uses `addOnModeChangedListener`; older releases have no
 * permission-free callback, so we poll while observed (the JS side also re-polls
 * `isCallActive()` on every foreground, so a poll tick only has to catch mid-session changes).
 *
 * Caveat (verify on device): IN_COMMUNICATION is a shared signal — if any in-app component ever
 * sets the audio mode for echo cancellation, it would read as a "call". Nothing in the current
 * stack (VisionCamera/expo-audio recording) is known to do so.
 */
class CallDetectorModule : Module() {
  private val audioManager: AudioManager?
    get() = appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  private val mainHandler = Handler(Looper.getMainLooper())
  private var modeObserver: ModeChangeObserver? = null
  private var pollTick: Runnable? = null
  private var lastReported: Boolean? = null

  private fun isCallActive(): Boolean =
    when (audioManager?.mode ?: AudioManager.MODE_NORMAL) {
      AudioManager.MODE_RINGTONE,
      AudioManager.MODE_IN_CALL,
      AudioManager.MODE_IN_COMMUNICATION,
      -> true
      else -> false
    }

  private fun emitIfChanged(force: Boolean = false) {
    val active = isCallActive()
    if (force || active != lastReported) {
      lastReported = active
      sendEvent("onCallStateChange", bundleOf("isActive" to active))
    }
  }

  override fun definition() = ModuleDefinition {
    Name("CallDetector")

    Events("onCallStateChange")

    Function("isCallActive") { isCallActive() }

    // iOS-only background-execution helpers (UIBackgroundTask). Android's equivalents are handled
    // elsewhere by design: the upload pipeline runs a dataSync foreground service, and the
    // recorder stops the capture session on background. Sentinel contract per the JS declaration.
    Function("beginBackgroundTask") { -1 }
    Function("endBackgroundTask") { _: Int -> }

    OnStartObserving {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        appContext.reactContext?.mainExecutor?.let { executor ->
          audioManager?.let { am ->
            val observer = ModeChangeObserver { mainHandler.post { emitIfChanged() } }
            observer.register(am, executor)
            modeObserver = observer
          }
        }
      } else {
        val tick = object : Runnable {
          override fun run() {
            emitIfChanged()
            mainHandler.postDelayed(this, POLL_INTERVAL_MS)
          }
        }
        pollTick = tick
        mainHandler.postDelayed(tick, POLL_INTERVAL_MS)
      }
      // Emit the current state immediately (matching iOS) — a call already in progress when the
      // listener attaches would otherwise be missed until the next change.
      mainHandler.post { emitIfChanged(force = true) }
    }

    OnStopObserving {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        modeObserver?.let { observer -> audioManager?.let(observer::unregister) }
      }
      modeObserver = null
      pollTick?.let(mainHandler::removeCallbacks)
      pollTick = null
      lastReported = null
    }
  }

  private companion object {
    const val POLL_INTERVAL_MS = 1500L
  }
}
