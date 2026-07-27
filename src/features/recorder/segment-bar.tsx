// The drag-to-trash callbacks imperatively mutate refs + Reanimated shared values from
// gesture event handlers (not during render) — the controller pattern the React-Compiler
// immutability/refs rules flag. Disabled for this file, as in use-preview/playhead-cursor.
/* eslint-disable react-hooks/immutability */
import { Image } from 'expo-image';
import { Icon } from '@/components/icon';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollViewOffset,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Sortable from 'react-native-sortables';

import { Accent, Spacing } from '@/constants/theme';
import type { Segment } from '@/db/schema';
import { useThumbnail } from '@/hooks/use-thumbnail';
import { formatDurationPadded } from '@/utils/format';
import { effMs } from '@/utils/segment-window';
import { PlayheadCursor, type Cursor } from './playhead-cursor';
import {
  POP_LANE,
  RECORD_BAR_GAP,
  RECORD_BUTTON_SIZE,
  SCRUB_INSET,
  SCRUB_LANE,
  THUMB_HEIGHT,
  THUMB_WIDTH,
  TRACK_GAP,
} from './track-metrics';

// Sits centered on the record button's spot (which is hidden during a drag), a little
// smaller than it. Size is independent of RECORD_BUTTON_SIZE; the wrapper offset below keeps
// it centered on the record button regardless.
const TRASH_SIZE = 56;
// Nudge the trash below the record button's exact center so it clears the preview modal.
const TRASH_DROP_OFFSET = 18;
// Badge pill diameter — it doubles as the drag handle's visible affordance, so it's sized
// generously. Half of it rides above the thumb's top edge; POP_LANE (the vertical breathing
// room inside the scroll frame) must be at least BADGE_SIZE / 2.
const BADGE_SIZE = 18;

type Props = {
  segments: Segment[];
  onReorder: (ids: string[]) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  /** Fired true when a drag begins, false when it ends — lets the recorder hide its record
   *  button so the floating trash above the bar has clear space. */
  onDragActiveChange?: (active: boolean) => void;
  onNext?: () => void;
  cursor?: Cursor;
};

export function SegmentBar(props: Props) {
  // Gate BEFORE the hooks mount: useScrollViewOffset warns on every empty-draft render
  // while its ref has no ScrollView attached, so the hooks live in Bar below.
  if (props.segments.length === 0) return null;
  return <Bar {...props} />;
}

function Bar({
  segments,
  onReorder,
  onDelete,
  onSelect,
  onEdit,
  onDragActiveChange,
  onNext,
  cursor,
}: Props) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  // Owned here (not in PlayheadCursor) so the offset is already tracked when the cursor
  // mounts on a bar the user scrolled before opening the preview.
  const scrollOffset = useScrollViewOffset(scrollRef);

  // Live viewport + scroll-content widths, fed to the playhead's edge-band follow math.
  const viewportW = useSharedValue(0);
  const contentW = useSharedValue(0);
  // True during a reorder drag — tells the playhead to pause its follow so the two scrollers
  // (this and Sortable's autoScroll) don't fight when reordering while previewing.
  const dragScroll = useSharedValue(false);

  // React-side mirror of the drag state, used to hide the → (Next) button while reordering so
  // the flex:1 viewport reclaims its slot (button + gap) for more room. Item slot positions are
  // index-based (i * STEP), independent of viewport width, so widening mid-drag is reorder-safe.
  const [dragActive, setDragActive] = useState(false);

  // Preserve the user's place when a clip is removed: a length DECREASE captures the current
  // offset (the effect runs before the shrunken content re-lays out and snaps the scroll), and
  // onContentSizeChange restores it clamped to the new content width. A length increase (new
  // recording) deliberately does nothing — the bar never yanks away from where the user was.
  const prevCount = useRef(segments.length);
  const restoreOffset = useRef<number | null>(null);
  useEffect(() => {
    if (segments.length < prevCount.current) restoreOffset.current = scrollOffset.value;
    prevCount.current = segments.length;
  }, [segments.length, scrollOffset]);

  // Drag-to-trash. The trash floats above the bar, shown only while dragging; dropping a clip
  // on it deletes that clip — otherwise the drag just reorders. Hit-testing is done from the
  // drag's touch position (onDragMove) against the trash's measured window rect.
  const trashRef = useRef<View>(null);
  const trashRect = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const draggedKey = useRef<string | null>(null);
  const overTrash = useRef(false);
  const vis = useSharedValue(0); // 0→1 trash fade-in during a drag
  const over = useSharedValue(0); // highlight when a dragged clip hovers the trash

  const measureTrash = () =>
    trashRef.current?.measureInWindow((x, y, w, h) => {
      trashRect.current = { x, y, w, h };
    });

  const trashStyle = useAnimatedStyle(() => ({
    opacity: vis.value,
    transform: [{ scale: 0.85 + 0.15 * vis.value + 0.12 * over.value }],
    backgroundColor: interpolateColor(over.value, [0, 1], ['rgba(0,0,0,0.6)', Accent]),
    borderColor: interpolateColor(over.value, [0, 1], ['rgba(255,255,255,0.4)', '#fff']),
  }));

  return (
    // Teleports the dragged thumbnail to a portal outlet rendered OUTSIDE the horizontal
    // ScrollView, which otherwise clips anything dragged out of its vertical bounds (the clip
    // went invisible the moment it left the bar on the way to the trash). The outlet is layout-
    // neutral and the active item positions itself in window coords, so the clip stays visible
    // as it's dragged up to the trash. Enabled by default.
    <Sortable.PortalProvider>
      <View style={styles.bar}>
        {/* Trash drop target — above the bar, fades in during a drag. pointerEvents="none" so it
            never intercepts touches; it's purely a drop zone hit-tested from the drag position. */}
        <View style={styles.trashWrap} pointerEvents="none">
          <Animated.View ref={trashRef} onLayout={measureTrash} style={[styles.trash, trashStyle]}>
            <Icon name="trash.fill" size={22} tintColor="#fff" />
          </Animated.View>
        </View>

        <View
          style={[styles.viewport, cursor && styles.viewportScrub]}
          onLayout={(e) => {
            viewportW.value = e.nativeEvent.layout.width;
          }}>
          <Animated.ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.content}
            onContentSizeChange={(w) => {
              contentW.value = w;
              // Restore the pre-delete offset now the remaining thumbs have laid out.
              if (restoreOffset.current != null) {
                const target = Math.min(restoreOffset.current, Math.max(0, w - viewportW.value));
                restoreOffset.current = null;
                scrollRef.current?.scrollTo({ x: target, animated: false });
              }
            }}>
            <Sortable.Grid
              rows={1}
              rowHeight={THUMB_HEIGHT}
              columnGap={TRACK_GAP}
              data={segments}
              keyExtractor={(s) => s.id}
              scrollableRef={scrollRef}
              autoScrollDirection="horizontal"
              // 'swap' keeps the row still during a drag — only the hovered thumb trades
              // places with the dragged one. The default 'insert' reflowed every neighbor
              // to open a gap, which made long bars feel like they scattered on pickup.
              // Note the semantics: dropping 1 on 5 exchanges them (2–4 stay put).
              strategy="swap"
              // Reorder only from the numbered-pill handle — frees a plain hold on the thumb
              // to mean "edit" without colliding with the grid's long-press-to-drag.
              customHandle
              onDragStart={({ key }) => {
                draggedKey.current = key;
                overTrash.current = false;
                over.value = 0;
                vis.value = withTiming(1, { duration: 150 });
                dragScroll.value = true; // pause playhead-follow so it can't fight the grid autoscroll
                setDragActive(true); // hide → so the viewport gets its space
                measureTrash();
                onDragActiveChange?.(true);
              }}
              onDragMove={({ touchData }) => {
                const r = trashRect.current;
                const inside =
                  !!r &&
                  touchData.absoluteX >= r.x &&
                  touchData.absoluteX <= r.x + r.w &&
                  touchData.absoluteY >= r.y &&
                  touchData.absoluteY <= r.y + r.h;
                if (inside !== overTrash.current) {
                  overTrash.current = inside;
                  over.value = withTiming(inside ? 1 : 0, { duration: 120 });
                }
              }}
              onDragEnd={({ data }) => {
                vis.value = withTiming(0, { duration: 150 });
                over.value = withTiming(0, { duration: 120 });
                // Dropped on the trash → delete that clip; otherwise persist the new order.
                if (overTrash.current && draggedKey.current) onDelete(draggedKey.current);
                else onReorder(data.map((s) => s.id));
                overTrash.current = false;
                draggedKey.current = null;
                dragScroll.value = false;
                setDragActive(false); // restore → now the drag is done
                onDragActiveChange?.(false);
              }}
              renderItem={({ item }) => (
                <SegmentThumb
                  segment={item}
                  active={cursor?.activeId === item.id}
                  onSelect={() => onSelect(item.id)}
                  onEdit={() => onEdit(item.id)}
                />
              )}
            />
          </Animated.ScrollView>

          {cursor && (
            <PlayheadCursor
              cursor={cursor}
              segments={segments}
              scrollRef={scrollRef}
              scrollOffset={scrollOffset}
              viewportW={viewportW}
              contentW={contentW}
              suspendAutoScroll={dragScroll}
            />
          )}
        </View>

        {/* Hidden while reordering — its slot (button + gap) is handed to the flex:1 viewport for
          more room; restored on drag end. */}
        {onNext && !dragActive && (
          <Pressable
            onPress={onNext}
            accessibilityRole="button"
            accessibilityLabel="Next"
            style={({ pressed }) => [styles.next, { opacity: pressed ? 0.85 : 1 }]}>
            <Icon name="arrow.right" size={22} weight="semibold" tintColor="#fff" />
          </Pressable>
        )}
      </View>
    </Sortable.PortalProvider>
  );
}

function SegmentThumb({
  segment,
  active,
  onSelect,
  onEdit,
}: {
  segment: Segment;
  active: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  // Persisted jpeg cover; falls back to the EFFECTIVE clip (edited ?? original) for legacy rows.
  const thumbnail = useThumbnail(
    segment.thumbnail,
    segment.editedFilename ?? segment.originalFilename,
  );

  // Effective (post-trim) clip length, the same number the playhead and export use. A failed
  // native read stores 0ms (the clip is skipped on playback) — show nothing rather than 00:00.
  const durationMs = effMs(segment);

  return (
    // The clip under the playhead is marked by its border turning accent — no scale-up, so
    // the row stays visually still while the playhead moves across it.
    <View style={[styles.thumb, active && styles.thumbActive]}>
      {/* tap = preview · hold = open editor (onLongPress) · drag the numbered pill = reorder
          (drop on the trash to delete). Sortable.Touchable cooperates with the grid so a tap
          can't fire after a drag. */}
      <Sortable.Touchable
        onTap={onSelect}
        onLongPress={onEdit}
        accessibilityLabel="Preview clip (hold to edit)"
        style={styles.thumbTouch}>
        {thumbnail ? (
          <Image source={thumbnail} style={styles.thumbImage} contentFit="cover" />
        ) : (
          <Icon name="video.fill" size={18} tintColor="rgba(255,255,255,0.8)" />
        )}
      </Sortable.Touchable>

      {/* Clip length, bottom-center. pointerEvents none so it never steals taps from the thumb. */}
      {durationMs > 0 && (
        <View style={styles.durationWrap} pointerEvents="none">
          <View style={styles.duration}>
            <Text style={styles.durationText} numberOfLines={1}>
              {formatDurationPadded(durationMs)}
            </Text>
          </View>
        </View>
      )}

      {/* Drag handle — the only reorder/drag activator (drag onto the trash to delete).
          The visible affordance IS the clip's label: a pill straddling the thumb's top edge
          (half out, half in), centered. The label is initialized to the clip's creation number
          when it's recorded and never renumbered on reorder (deletes leave gaps), so "move 7
          between 3 and 12" stays meaningful however the draft is shuffled. The handle's
          touch area is the full-width top strip, not just the pill. */}
      <Sortable.Handle style={styles.handle}>
        <View style={styles.badge}>
          <Text style={styles.badgeText} numberOfLines={1}>
            {segment.label || '≡'}
          </Text>
        </View>
      </Sortable.Handle>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  trashWrap: {
    position: 'absolute',
    // Vertically: align the trash's CENTER with the record button's center. The record
    // button sits RECORD_BAR_GAP above the bar and is RECORD_BUTTON_SIZE tall, so its center
    // is (RECORD_BAR_GAP + RECORD_BUTTON_SIZE/2) up; offset this wrapper by a further
    // TRASH_SIZE/2 so the (smaller) circle's center lands there too. Horizontally: span the
    // bar (left/right 0) and center the circle with alignItems — robust against the bar's
    // padding (a plain left:'50%' lands ~one padding off because % is measured from the edge).
    top: -(RECORD_BAR_GAP + RECORD_BUTTON_SIZE / 2 + TRASH_SIZE / 2) + TRASH_DROP_OFFSET,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  trash: {
    width: TRASH_SIZE,
    height: TRASH_SIZE,
    borderRadius: TRASH_SIZE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewport: { flex: 1, overflow: 'hidden' },
  // Lane below the thumbs the playhead knob hangs into — only needed while previewing (when a
  // cursor is present). In record mode it would just add dead space below the bar and push the
  // thumbs above the export button's centerline, so it's applied conditionally.
  viewportScrub: { paddingBottom: SCRUB_LANE },
  content: {
    alignItems: 'center',
    paddingLeft: SCRUB_INSET,
    paddingRight: Spacing.two,
    // Symmetric top/bottom room inside the scroll frame so the badge pill's protruding half
    // isn't clipped by the ScrollView. Symmetric → thumbs stay vertically centered, keeping
    // the export-button alignment.
    paddingVertical: POP_LANE,
  },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    backgroundColor: 'rgba(255,255,255,0.12)',
    // Border space is reserved (transparent) at all times so going active only changes the
    // color — adding the border on activation would otherwise shift the inner box (and the
    // absolutely-positioned grab handle) inward by 2px.
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbTouch: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbActive: {
    borderColor: Accent,
  },
  thumbImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Full-width wrapper so the badge centers horizontally regardless of its text width.
  durationWrap: {
    position: 'absolute',
    bottom: 3,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  duration: {
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  durationText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  // The drag handle: the pill is just the visible anchor — the actual grab area is this
  // full-width strip reaching ~25pt into the thumb, comfortably bigger than the pill for
  // less precise fingers. (No hitSlop prop on Sortable.Handle, and the pill half above the
  // thumb's bounds is not hit-testable in RN, so the generosity has to live INSIDE the
  // thumb.) The strip below the pill is invisible touch area; taps/holds on the thumb's
  // lower two-thirds still reach the preview/edit touchable underneath.
  handle: {
    position: 'absolute',
    top: -BADGE_SIZE / 2,
    left: 0,
    right: 0,
    height: BADGE_SIZE / 2 + 25,
    alignItems: 'center',
  },
  badge: {
    height: BADGE_SIZE,
    minWidth: BADGE_SIZE,
    paddingHorizontal: 5,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    // Soft shadow keeps the pill legible over bright thumbnails (as the old grabber had).
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  next: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
