import { setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';
import { useCallback, useRef } from 'react';

/**
 * Audio focus for recording: while the recorder is on screen with the mic live, claim
 * exclusive audio focus so other apps (Spotify / YouTube / podcasts) PAUSE instead of mixing
 * into the capture; hand it back on leave so they resume.
 *
 * SDK 56's unified `interruptionMode: 'doNotMix'` is meant to request focus on both platforms
 * (the deprecated per-platform `interruptionModeAndroid` is gone, so the old
 * https://github.com/expo/expo/issues/34025 "both keys crash Android" trap can't be hit here).
 * Two behaviours the original Pulse found broken in an older expo-audio still need on-device
 * confirmation — if either fails we fall back to a tiny native module (`requestAudioFocus` /
 * `abandonAudioFocus`), see docs/pulse-feature-gaps.md §A2:
 *   - Android: `setIsAudioActiveAsync` was a no-op (never called `AudioManager.requestAudioFocus`).
 *   - iOS: resume needs `setActive(false, .notifyOthersOnDeactivation)`.
 *
 * Engage on screen focus / release on blur (NOT per segment) so the AVAudioSession isn't
 * toggled mid-draft — that toggling is what caused the original's "mic dies on segment 2" bug.
 * Callers gate `acquire` on `!muted` (a muted clip has no audio track, so seizing the user's
 * playback would be pointless). Both calls are idempotent and never throw — an audio-session
 * failure must not break recording.
 */
export function useAudioFocus() {
  const heldRef = useRef(false);

  const acquire = useCallback(async () => {
    if (heldRef.current) return;
    heldRef.current = true;
    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
      });
      await setIsAudioActiveAsync(true);
    } catch {
      // session unavailable — recording continues, audio just mixes
    }
  }, []);

  const release = useCallback(async () => {
    if (!heldRef.current) return;
    heldRef.current = false;
    try {
      await setIsAudioActiveAsync(false);
      await setAudioModeAsync({
        allowsRecording: false,
        interruptionMode: 'mixWithOthers',
      });
    } catch {
      // best-effort restore — other apps resume on their own once focus lapses
    }
  }, []);

  return { acquire, release };
}
