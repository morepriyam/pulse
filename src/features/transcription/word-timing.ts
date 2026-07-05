/** Minimal shape needed to locate the active word — a `{ t0, t1 }` timing pair in centiseconds. */
type Timed = { t0: number; t1: number };

/**
 * Index of the active (karaoke-highlighted) word for a playhead at `posCs` centiseconds: the word
 * covering the playhead, else the last word already started — so the highlight rests on the most
 * recent word during short gaps between words. Returns `-1` when no word has started yet.
 *
 * Shared by `CaptionOverlay` (video) and `KaraokeText` (subtitle editor) so the highlight rule
 * stays identical in both places.
 */
export function activeWordIndex(words: readonly Timed[], posCs: number): number {
  let active = -1;
  for (let i = 0; i < words.length; i++) {
    if (posCs >= words[i].t0) active = i;
    if (posCs >= words[i].t0 && posCs <= words[i].t1) break;
  }
  return active;
}
