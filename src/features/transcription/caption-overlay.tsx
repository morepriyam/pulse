import { StyleSheet, Text, View } from 'react-native';

import { Accent } from '@/constants/theme';
import type { TranscriptLine, TranscriptWord } from './whisper';

const COLOR_SPOKEN = 'rgba(255,255,255,1)';
const COLOR_FUTURE = 'rgba(255,255,255,0.45)';
const COLOR_BG = 'rgba(0,0,0,0.6)';

type Props = {
  /** Effective caption lines (centiseconds), sorted by start. */
  lines: TranscriptLine[];
  /** Current playback position in milliseconds, in the same time base as `lines`. */
  positionMs: number;
  /** Caption text size; pass a smaller value when the host video view is compact. */
  fontSize?: number;
};

/** Binary-search the line whose [t0,t1] (centiseconds) contains `posCs`; -1 if none. */
function findActiveLine(lines: TranscriptLine[], posCs: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const l = lines[mid];
    if (posCs < l.t0) hi = mid - 1;
    else if (posCs > l.t1) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/**
 * Word-level (karaoke) caption overlay: the active line is picked by binary search; within it,
 * words already spoken render solid, upcoming words dim, and the current word is in the accent
 * color. Lines without `words` fall back to a static line. Plain nested <Text> spans — wrapping
 * and centering come from the text layout engine (this used to be a hand-measured Skia canvas).
 *
 * Time sync is the caller's job: feed `positionMs` from expo-video's `timeUpdate` event.
 */
export function CaptionOverlay({ lines, positionMs, fontSize = 17 }: Props) {
  const posCs = positionMs / 10;
  const lineIdx = findActiveLine(lines, posCs);
  const line = lineIdx >= 0 ? lines[lineIdx] : undefined;
  if (!line) return null;

  // The words to render: real word timing when present, else the whole line as one "word".
  const words: TranscriptWord[] = line.words?.length
    ? line.words
    : [{ text: line.text, t0: line.t0, t1: line.t1 }];

  // Active word index within the line: the word covering the playhead, else the last one already
  // started (so the highlight rests on the most recent word during short gaps).
  let active = -1;
  for (let i = 0; i < words.length; i++) {
    if (posCs >= words[i].t0) active = i;
    if (posCs >= words[i].t0 && posCs <= words[i].t1) break;
  }

  const pad = fontSize * 0.5; // background padding around the text block
  const edge = fontSize * 0.7; // min gap from the host view's edges

  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap, { padding: edge }]} pointerEvents="none">
      <View
        style={{
          backgroundColor: COLOR_BG,
          borderRadius: pad * 0.8,
          paddingHorizontal: pad,
          paddingVertical: pad / 2,
        }}>
        <Text style={[styles.text, { fontSize, lineHeight: fontSize * 1.3 }]}>
          {words.map((w, i) => (
            <Text
              key={`${lineIdx}:${i}`}
              style={{
                color: i === active ? Accent : i < active ? COLOR_SPOKEN : COLOR_FUTURE,
              }}>
              {(i > 0 ? ' ' : '') + w.text}
            </Text>
          ))}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  text: {
    textAlign: 'center',
    fontWeight: '700',
    color: '#fff',
  },
});
