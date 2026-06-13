// The drag-to-trash callbacks imperatively mutate refs + Reanimated shared values from
// gesture event handlers (not during render) — the controller pattern the React-Compiler
// immutability/refs rules flag. Disabled for this file, as in use-preview/playhead-cursor.
/* eslint-disable react-hooks/immutability */
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollViewOffset,
  useSharedValue,
  withSpring,
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
  ACTIVE_SCALE,
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

  // Scroll the newest clip into view when one is added (record mode only — while previewing the
  // playhead owns scrolling). A length increase is unique to add; reorder/delete never grow it.
  // The actual scroll happens in onContentSizeChange so the new thumb has laid out first.
  const prevCount = useRef(segments.length);
  const stickToEnd = useRef(false);
  useEffect(() => {
    if (segments.length > prevCount.current && !cursor) stickToEnd.current = true;
    prevCount.current = segments.length;
  }, [segments.length, cursor]);

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
    <View style={styles.bar}>
      {/* Trash drop target — above the bar, fades in during a drag. pointerEvents="none" so it
          never intercepts touches; it's purely a drop zone hit-tested from the drag position. */}
      <View style={styles.trashWrap} pointerEvents="none">
        <Animated.View ref={trashRef} onLayout={measureTrash} style={[styles.trash, trashStyle]}>
          <SymbolView name="trash.fill" size={22} tintColor="#fff" />
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
            // Honor a pending scroll-to-newest now that the added thumb has been measured.
            if (stickToEnd.current) {
              stickToEnd.current = false;
              scrollRef.current?.scrollToEnd({ animated: true });
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
            // Reorder only from the drag handle (≣) — frees a plain hold on the thumb to
            // mean "edit" without colliding with the grid's long-press-to-drag.
            customHandle
            onDragStart={({ key }) => {
              draggedKey.current = key;
              overTrash.current = false;
              over.value = 0;
              vis.value = withTiming(1, { duration: 150 });
              dragScroll.value = true; // pause playhead-follow so it can't fight the grid autoscroll
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

      {onNext && (
        <Pressable
          onPress={onNext}
          accessibilityRole="button"
          accessibilityLabel="Next"
          style={({ pressed }) => [styles.next, { opacity: pressed ? 0.85 : 1 }]}>
          <SymbolView name="arrow.right" size={22} weight="semibold" tintColor="#fff" />
        </Pressable>
      )}
    </View>
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
  // Cover the EFFECTIVE clip — the edited file once trimmed, else the pristine original.
  const thumbnail = useThumbnail(segment.editedFilename ?? segment.originalFilename);

  // Effective (post-trim) clip length, the same number the playhead and export use. A failed
  // native read stores 0ms (the clip is skipped on playback) — show nothing rather than 00:00.
  const durationMs = effMs(segment);

  // The clip under the playhead pops up as a whole (border included). Springs on activation so
  // it reads as a lift rather than a jump; grows into POP_LANE so it isn't clipped.
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withSpring(active ? ACTIVE_SCALE : 1, { damping: 18, stiffness: 400, mass: 0.5 });
  }, [active, scale]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[styles.thumb, active && styles.thumbActive, popStyle]}>
      {/* tap = preview · hold = open editor (onLongPress) · drag the ≣ handle = reorder (drop
          on the trash to delete). Sortable.Touchable cooperates with the grid so a tap can't
          fire after a drag. */}
      <Sortable.Touchable
        onTap={onSelect}
        onLongPress={onEdit}
        accessibilityLabel="Preview clip (hold to edit)"
        style={styles.thumbTouch}>
        {thumbnail ? (
          <Image source={thumbnail} style={styles.thumbImage} contentFit="cover" />
        ) : (
          <SymbolView name="video.fill" size={18} tintColor="rgba(255,255,255,0.8)" />
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
          A full-width grab strip along the top: large enough to hold reliably on a 48pt-wide
          thumb, styled like a sheet grabber so it reads as "drag me". */}
      <Sortable.Handle style={[styles.handle]}>
        <View style={styles.handleGrabber} />
      </Sortable.Handle>
    </Animated.View>
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
    // Symmetric top/bottom room inside the scroll frame so the active thumb's pop isn't clipped
    // by the ScrollView. Symmetric → thumbs stay vertically centered, keeping export-button align.
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
  handle: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleGrabber: {
    width: 22,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.9)',
    // Soft shadow keeps the bare grabber legible over bright thumbnails.
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
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
