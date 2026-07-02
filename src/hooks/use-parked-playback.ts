// Mutates the expo-video player handle (an imperative API by design) — the same controller
// pattern use-preview.ts disables the React-Compiler immutability rule for.
/* eslint-disable react-hooks/immutability */
import { useEvent, useEventListener } from 'expo';
import type { VideoPlayer } from 'expo-video';

/**
 * Hardened play/pause for a single-source, play-once player.
 *
 * expo-video seeks are asynchronous (AVPlayer.seek), and after a natural play-through the
 * player rests parked at the END of the media. Restarting from there with `replay()` (or any
 * seek immediately followed by `play()`) races: play resumes at the pre-seek position for a
 * beat — an audible blip of the clip's end — and the end-of-item pause can land after the
 * seek completes, killing the restarted playback.
 *
 * The fix is structural: the moment a play-through ends, park the playhead back at the start.
 * That seek happens while the player is paused (silent) and is long settled before the next
 * play tap, so `togglePlay` never needs `replay()` or duration-epsilon checks.
 */
export function useParkedPlayback(player: VideoPlayer) {
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  useEventListener(player, 'playToEnd', () => {
    player.currentTime = 0;
  });

  const togglePlay = () => {
    if (player.playing) player.pause();
    else player.play();
  };

  /** Absolute seek — race-free alternative to `seekBy(target - currentTime)`, which re-reads
   * the live position natively and drifts when a previous seek is still in flight. */
  const seekTo = (seconds: number) => {
    player.currentTime = seconds;
  };

  return { isPlaying, togglePlay, seekTo };
}
