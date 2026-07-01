import { Roboto_700Bold } from '@expo-google-fonts/roboto';
import { Canvas, RoundedRect, Text as SkiaText, useFont } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Accent } from '@/constants/theme';
import type { TranscriptLine, TranscriptWord } from './whisper';

const FONT_SIZE = 20;
const LINE_HEIGHT = FONT_SIZE * 1.3;
const PAD = 10; // background padding around the text block
const EDGE = 14; // min gap from the canvas edges

const COLOR_SPOKEN = 'rgba(255,255,255,1)';
const COLOR_FUTURE = 'rgba(255,255,255,0.45)';
const COLOR_BG = 'rgba(0,0,0,0.6)';

type Props = {
  /** Effective caption lines (centiseconds), sorted by start. */
  lines: TranscriptLine[];
  /** Current playback position in milliseconds, in the same time base as `lines`. */
  positionMs: number;
};

type Placed = { word: TranscriptWord; x: number; y: number };
type MeasuredWord = { word: TranscriptWord; w: number };
type Row = { items: MeasuredWord[]; width: number };
type BackgroundRect = { x: number; y: number; w: number; h: number };
type Layout = { placed: Placed[]; bg: BackgroundRect | null };

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
 * Word-level (karaoke) caption overlay drawn with Skia. The active line is picked by binary
 * search; within it, words already spoken render solid, upcoming words dim, and the current word
 * is in the accent color. Lines without `words` fall back to a static line.
 *
 * Time sync is the caller's job: feed `positionMs` from expo-video's `timeUpdate` event.
 */
export function CaptionOverlay({ lines, positionMs }: Props) {
  const font = useFont(Roboto_700Bold, FONT_SIZE);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const posCs = positionMs / 10;
  const lineIdx = useMemo(() => findActiveLine(lines, posCs), [lines, posCs]);
  const line = lineIdx >= 0 ? lines[lineIdx] : undefined;

  // The words to render: real word timing when present, else the whole line as one "word".
  const words: TranscriptWord[] = useMemo(() => {
    if (!line) return [];
    return line.words?.length ? line.words : [{ text: line.text, t0: line.t0, t1: line.t1 }];
  }, [line]);

  // Active word index within the line: the word covering the playhead, else the last one already
  // started (so the highlight rests on the most recent word during short gaps).
  const activeWord = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < words.length; i++) {
      if (posCs >= words[i].t0) idx = i;
      if (posCs >= words[i].t0 && posCs <= words[i].t1) return i;
    }
    return idx;
  }, [words, posCs]);

  // Lay the words out into <=2 centered rows that fit the canvas width.
  const layout = useMemo((): Layout => {
    if (!font || size.width === 0 || words.length === 0) {
      return { placed: [], bg: null };
    }
    const spaceW = Math.max(4, font.measureText('A A').width - font.measureText('AA').width);
    const maxW = size.width - 2 * EDGE;

    // Greedy wrap into rows.
    const rows: Row[] = [{ items: [], width: 0 }];
    for (const word of words) {
      const w = font.measureText(word.text).width;
      const row = rows[rows.length - 1];
      const add = (row.items.length ? spaceW : 0) + w;
      if (row.items.length && row.width + add > maxW) {
        rows.push({ items: [{ word, w }], width: w });
      } else {
        row.items.push({ word, w });
        row.width += add;
      }
    }

    const totalH = rows.length * LINE_HEIGHT;
    const blockTop = Math.max(EDGE, size.height - EDGE - totalH);

    const placed: Placed[] = [];
    let maxRowW = 0;
    rows.forEach((row, ri) => {
      let x = (size.width - row.width) / 2;
      const baseline = blockTop + ri * LINE_HEIGHT + FONT_SIZE;
      maxRowW = Math.max(maxRowW, row.width);
      for (const item of row.items) {
        placed.push({ word: item.word, x, y: baseline });
        x += item.w + spaceW;
      }
    });

    const bg: BackgroundRect = {
      x: (size.width - maxRowW) / 2 - PAD,
      y: blockTop - PAD / 2,
      w: maxRowW + 2 * PAD,
      h: totalH + PAD,
    };
    return { placed, bg };
  }, [font, size.width, size.height, words]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
  };

  // On the new architecture (Fabric) Skia's <Canvas> doesn't support onLayout, so measure on a
  // wrapping <View> and let the Canvas fill it.
  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        {line && layout.bg && (
          <RoundedRect
            x={layout.bg.x}
            y={layout.bg.y}
            width={layout.bg.w}
            height={layout.bg.h}
            r={8}
            color={COLOR_BG}
          />
        )}
        {font &&
          layout.placed.map((p, i) => {
            const spoken = i <= activeWord;
            const isActive = i === activeWord;
            return (
              <SkiaText
                key={`${lineIdx}:${i}`}
                font={font}
                text={p.word.text}
                x={p.x}
                y={p.y}
                color={isActive ? Accent : spoken ? COLOR_SPOKEN : COLOR_FUTURE}
              />
            );
          })}
      </Canvas>
    </View>
  );
}
