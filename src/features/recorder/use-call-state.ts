import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import CallDetector from '../../../modules/expo-call-detector/src/CallDetectorModule';

/**
 * Tracks whether a phone / VoIP call is active and whether the app is foregrounded — both gate the
 * recorder's mic. iOS gives telephony top priority for the microphone, so capturing with the mic
 * live during a call throws the AVFoundation -11800 / '!pri' error that freezes the capture session.
 *
 * Two signals, ONE AppState listener so they always update in the same render:
 *  - callActive: live from CallKit's CXCallObserver (our local expo-call-detector module). The
 *    native delegate does NOT fire while the app is suspended, so a call that *starts* while the
 *    app is backgrounded is invisible until resume — we therefore re-poll the live state on
 *    foreground (isCallActive() reads CXCallObserver.calls directly).
 *  - appActive: false while backgrounded. VisionCamera has no lifecycle handling of its own, so
 *    iOS auto-resumes the capture session on foreground with the mic still attached — straight into
 *    a call that began in the background. The recorder stops the session while backgrounded (via
 *    `isActive`) and only restarts it once foreground, by which point callActive has been re-polled,
 *    so the mic is never resumed into an in-progress call.
 */
export function useCallState() {
  const [callActive, setCallActive] = useState(() => CallDetector.isCallActive());
  const [appActive, setAppActive] = useState(() => AppState.currentState === 'active');

  useEffect(() => {
    const callSub = CallDetector.addListener('onCallStateChange', ({ isActive }) =>
      setCallActive(isActive),
    );
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // Re-poll on resume: a call that began while the app was suspended delivered no event.
        // Set both together so the render that restarts the camera already knows about the call.
        setCallActive(CallDetector.isCallActive());
        setAppActive(true);
      } else if (state === 'background') {
        setAppActive(false);
      }
      // 'inactive' is left untouched — it fires for transient overlays (Control Center, the call
      // banner) where we don't want to tear the session down.
    });
    return () => {
      callSub.remove();
      appSub.remove();
    };
  }, []);

  return { callActive, appActive };
}
