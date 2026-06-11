import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedRef, useScrollViewOffset } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';

import { Accent, Spacing } from '@/constants/theme';
import type { Segment } from '@/db/schema';
import { useThumbnail } from '@/hooks/use-thumbnail';
import { PlayheadCursor, type Cursor } from './playhead-cursor';
import { SCRUB_LANE, THUMB_HEIGHT, THUMB_WIDTH, TRACK_GAP } from './track-metrics';

type Props = {
  segments: Segment[];
  onReorder: (ids: string[]) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
  onNext?: () => void;
  cursor?: Cursor;
};

export function SegmentBar(props: Props) {
  // Gate BEFORE the hooks mount: useScrollViewOffset warns on every empty-draft render
  // while its ref has no ScrollView attached, so the hooks live in Bar below.
  if (props.segments.length === 0) return null;
  return <Bar {...props} />;
}

function Bar({ segments, onReorder, onDelete, onSelect, onNext, cursor }: Props) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  // Owned here (not in PlayheadCursor) so the offset is already tracked when the cursor
  // mounts on a bar the user scrolled before opening the preview.
  const scrollOffset = useScrollViewOffset(scrollRef);

  return (
    <View style={styles.bar}>
      {/* The scrub lane is reserved in BOTH modes so the bar never changes height (and
          therefore never shifts) when a preview opens. */}
      <View style={styles.viewport}>
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.content}>
          <Sortable.Grid
            rows={1}
            rowHeight={THUMB_HEIGHT}
            columnGap={TRACK_GAP}
            data={segments}
            keyExtractor={(s) => s.id}
            scrollableRef={scrollRef}
            autoScrollDirection="horizontal"
            onDragEnd={({ data }) => onReorder(data.map((s) => s.id))}
            renderItem={({ item }) => (
              <SegmentThumb
                segment={item}
                active={cursor?.activeId === item.id}
                onSelect={() => onSelect(item.id)}
                onDelete={() => onDelete(item.id)}
              />
            )}
          />
        </Animated.ScrollView>

        {cursor && (
          <PlayheadCursor cursor={cursor} segments={segments} scrollOffset={scrollOffset} />
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
  onDelete,
}: {
  segment: Segment;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const thumbnail = useThumbnail(segment.originalFilename);

  return (
    <View style={[styles.thumb, active && styles.thumbActive]}>
      {/* Sortable.Touchable cooperates with the grid's long-press drag (a plain Pressable
          can fire its onPress after a completed drag, popping the preview unexpectedly). */}
      <Sortable.Touchable
        onTap={onSelect}
        accessibilityLabel="Preview clip"
        style={styles.thumbTouch}>
        {thumbnail ? (
          <Image source={thumbnail} style={styles.thumbImage} contentFit="cover" />
        ) : (
          <SymbolView name="video.fill" size={18} tintColor="rgba(255,255,255,0.8)" />
        )}
      </Sortable.Touchable>

      {/* Sibling overlay (not a child of the Touchable) so a tap here deletes WITHOUT also
          firing the Touchable's onTap that opens the preview. */}
      <Pressable
        onPress={onDelete}
        hitSlop={6}
        style={styles.thumbDelete}
        accessibilityLabel="Delete clip">
        <SymbolView name="xmark" size={11} weight="bold" tintColor="#fff" />
      </Pressable>
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
  viewport: { flex: 1, overflow: 'hidden', paddingBottom: SCRUB_LANE },
  content: { alignItems: 'center', paddingRight: Spacing.two },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  thumbTouch: {
    flex: 1,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbActive: {
    borderWidth: 2,
    borderColor: Accent,
  },
  thumbImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: Spacing.two,
  },
  thumbDelete: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
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
