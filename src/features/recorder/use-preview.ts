// expo-video's player is an imperative handle that is designed to be mutated (`player.play()`,
// `player.currentTime = …`). That intrinsic mutation is what the React-Compiler immutability rule
// flags, so it's disabled for this file — the player controller.
/* eslint-disable react-hooks/immutability */
import { useEvent, useEventListener } from 'expo';
import { useVideoPlayer } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Segment } from '@/db/schema';
import { absolutize } from '@/utils/file-store';
import { clamp } from '@/utils/math';
import {
  effFile,
  effMs,
  indexAtGlobalMs,
  inMs,
  outMs,
  segmentOffsets,
} from '@/utils/segment-window';

/** Tolerance for "playhead reached the clip's out-point" (ms). */
const END_EPSILON_MS = 60;

/**
 * In-recorder preview state: drives one `expo-video` player across a draft's segments
 * (sequential playback of each clip's effective file — edited if present, else original),
 * tracks the active clip, the source playhead, and a draft-global playhead for the bar cursor.
 *
 * `anchorId` is the tapped segment that opened the preview — `null` means preview closed;
 * the hook stays mounted with a stopped, unloaded player.
 */
export function usePreview(segments: Segment[], anchorId: string | null) {
  const player = useVideoPlayer(null);

  // SDK 56: timeUpdateEventInterval defaults to 0, which means `timeUpdate` NEVER fires.
  // Both auto-advance and the playhead depend on it.
  useEffect(() => {
    player.timeUpdateEventInterval = 0.25;
  }, [player]);

  const [selectedId, setSelectedId] = useState<string | null>(anchorId);
  const [positionMs, setPositionMs] = useState(0);

  // A new session (anchor change) derives a fresh selection. Done as a render-phase
  // adjustment — not an effect — so the new session's very first render is already
  // correct, and re-opening on the SAME anchor can't resurrect the old session's
  // selection (anchor transitions always pass through null when the preview closes).
  const [prevAnchorId, setPrevAnchorId] = useState(anchorId);
  if (prevAnchorId !== anchorId) {
    setPrevAnchorId(anchorId);
    setSelectedId(anchorId);
  }

  // One-shot per clip-end so the advance can't double-fire before the swap starts.
  const advancingRef = useRef(false);
  // True from replaceAsync initiation until readyToPlay/error: in that window the time
  // observer still reports the OUTGOING clip's position, so timeUpdate must be ignored
  // (acting on it cascades the auto-advance through every clip shorter than that stale
  // position). Cleared only by statusChange or session close.
  const swapInFlightRef = useRef(false);
  // Whether the next readyToPlay should start playback (set when auto-advancing).
  const wantPlayRef = useRef(false);
  // The file the player has been given (set at load *initiation* so decisions made while a
  // load is still in flight compare against the incoming file, not the outgoing one).
  const loadedFileRef = useRef<string | null>(null);
  // A source offset the next load/seek should land on instead of the clip's in-point —
  // kept fresh during bar scrubs, consumed once by the load effect.
  const pendingSeekRef = useRef<number | null>(null);

  // Opening a preview (anchor goes null → a tapped segment) auto-plays from that clip.
  // Arm the same intent the auto-advance uses; the load effect's begin()/statusChange
  // consumes it once the clip is ready. Declared before the load effect so it runs first
  // on the opening commit. Tapping another thumb mid-preview (selectSegment) still lands
  // paused — it clears this and doesn't change the anchor.
  useEffect(() => {
    if (anchorId != null) wantPlayRef.current = true;
  }, [anchorId]);

  // The active clip is the selection, falling back to the first clip when the selection
  // is gone (e.g. its row was deleted). Playback and the cursor act on this row.
  const activeIndex = (() => {
    if (anchorId == null || segments.length === 0) return -1;
    const i = segments.findIndex((s) => s.id === selectedId);
    return i >= 0 ? i : 0;
  })();
  const active = activeIndex >= 0 ? segments[activeIndex] : null;
  const activeId = active?.id ?? null;
  // The active clip's effective file — changes when it's edited (a new `editedFilename`).
  // The load effect keys on this so an edit to the CURRENT clip reloads it in place
  // (e.g. returning from the RNVT editor while still in the preview).
  const activeFile = active ? effFile(active) : null;

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  // Draft-global timeline math (single definition in utils/segment-window).
  const { offsets, totalMs } = useMemo(() => {
    const offs = segmentOffsets(segments);
    const last = segments.length - 1;
    return { offsets: offs, totalMs: last < 0 ? 0 : offs[last] + effMs(segments[last]) };
  }, [segments]);
  const globalMs = active
    ? offsets[activeIndex] + clamp(positionMs - inMs(active), 0, effMs(active))
    : 0;

  // Load the active clip into the player whenever the row changes, landing on the pending
  // scrub offset (bar drag across a boundary) or the clip's in-point.
  useEffect(() => {
    if (!active) {
      // Session closed — stop and unload so audio can't keep playing over the camera,
      // and drop any carry-over intent.
      player.pause();
      void player.replaceAsync(null);
      loadedFileRef.current = null;
      wantPlayRef.current = false;
      pendingSeekRef.current = null;
      advancingRef.current = false;
      swapInFlightRef.current = false;
      return;
    }
    let cancelled = false;

    const begin = () => {
      if (cancelled) return;
      advancingRef.current = false;
      // Clamp the pending scrub offset to this clip's window — it can be slightly stale
      // (e.g. the active row changed under it via a delete fallback).
      const startMs = clamp(pendingSeekRef.current ?? inMs(active), inMs(active), outMs(active));
      pendingSeekRef.current = null;
      player.currentTime = startMs / 1000;
      setPositionMs(startMs);
      // Resume only if the item is already playable — a freshly replaced source isn't,
      // and play() on a loading item is dropped; statusChange picks that case up.
      if (wantPlayRef.current && player.status === 'readyToPlay') {
        wantPlayRef.current = false;
        player.play();
      }
    };

    if (loadedFileRef.current === effFile(active)) {
      begin();
    } else {
      loadedFileRef.current = effFile(active);
      swapInFlightRef.current = true;
      void player.replaceAsync(absolutize(effFile(active))).then(begin);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, activeFile]);

  useEventListener(player, 'statusChange', ({ status }: { status: string }) => {
    if (status === 'error') {
      // Failed load (missing/corrupt file) — disarm everything so the session can't wedge
      // with the guards stuck armed.
      swapInFlightRef.current = false;
      advancingRef.current = false;
      wantPlayRef.current = false;
      return;
    }
    if (status !== 'readyToPlay') return;
    swapInFlightRef.current = false;
    advancingRef.current = false;
    if (wantPlayRef.current) {
      wantPlayRef.current = false;
      player.play();
    }
  });

  // Advance past the active clip: next playable clip, or pause at the draft's end.
  const advance = () => {
    if (!active) return;
    advancingRef.current = true;
    const next = segments.slice(activeIndex + 1).find((s) => effMs(s) > 0);
    if (next) {
      wantPlayRef.current = true;
      pendingSeekRef.current = null;
      setSelectedId(next.id);
    } else {
      player.pause();
      player.currentTime = inMs(active) / 1000;
      setPositionMs(inMs(active));
    }
  };

  // Track the playhead and auto-advance when the trim window's out-point is reached.
  useEventListener(player, 'timeUpdate', ({ currentTime }: { currentTime: number }) => {
    if (!active || swapInFlightRef.current || advancingRef.current) return;
    const ms = Math.round(currentTime * 1000);
    setPositionMs(ms);
    if (!player.playing || ms < outMs(active) - END_EPSILON_MS) return;
    advance();
  });

  // Backstop for natural (untrimmed) clip ends: the 250ms ticks can miss the pre-end
  // epsilon window entirely; playToEnd always fires when the item runs out.
  useEventListener(player, 'playToEnd', () => {
    if (!active || swapInFlightRef.current || advancingRef.current) return;
    advance();
  });

  /** Make a clip the active one (thumb tap while previewing); lands paused at its in-point. */
  const selectSegment = useCallback(
    (id: string) => {
      wantPlayRef.current = false;
      pendingSeekRef.current = null;
      // Pausing also silences the outgoing clip's event stream during the swap.
      player.pause();
      if (id === activeId && active) {
        // Same clip — the load effect won't re-run; seek in place.
        advancingRef.current = false;
        player.currentTime = inMs(active) / 1000;
        setPositionMs(inMs(active));
        return;
      }
      setSelectedId(id);
    },
    [player, activeId, active],
  );

  /** Pause playback without changing the selection (e.g. while the RNVT editor is open). */
  const pause = useCallback(() => {
    wantPlayRef.current = false;
    player.pause();
  }, [player]);

  const togglePlay = useCallback(() => {
    if (player.playing) {
      player.pause();
      return;
    }
    if (active) {
      // Read the live position imperatively — keeping positionMs out of the deps keeps
      // this callback's identity stable across the 4Hz playhead updates.
      const ms = Math.round(player.currentTime * 1000);
      if (ms >= outMs(active) - END_EPSILON_MS) player.currentTime = inMs(active) / 1000;
    }
    advancingRef.current = false;
    player.play();
  }, [player, active]);

  /** Seek to a draft-global offset (bar-cursor scrub); swaps the loaded clip when crossed. */
  const seekToGlobalMs = useCallback(
    (g: number) => {
      if (totalMs <= 0) return;
      if (player.playing) player.pause();
      // Scrubbing always lands paused — even when it interrupts an in-flight auto-advance.
      wantPlayRef.current = false;
      const clamped = clamp(g, 0, totalMs - 1);
      const i = indexAtGlobalMs(segments, offsets, clamped);
      if (i < 0) return;
      const seg = segments[i];
      const sourceMs = inMs(seg) + (clamped - offsets[i]);
      // Keep the pending offset fresh: if a load is in flight, drag frames would otherwise
      // be dropped — begin() lands on the latest one instead.
      pendingSeekRef.current = sourceMs;
      if (loadedFileRef.current === effFile(seg)) {
        player.currentTime = sourceMs / 1000;
        setPositionMs(sourceMs);
        if (seg.id !== selectedId) setSelectedId(seg.id);
      } else {
        setSelectedId(seg.id);
        setPositionMs(sourceMs);
      }
    },
    [player, segments, offsets, totalMs, selectedId],
  );

  return {
    player,
    active,
    activeId,
    isPlaying,
    positionMs,
    globalMs,
    totalMs,
    togglePlay,
    pause,
    selectSegment,
    seekToGlobalMs,
  };
}
