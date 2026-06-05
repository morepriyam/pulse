import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { VideoThumbnail } from 'expo-video';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';

import { Accent, Spacing } from '@/constants/theme';
import type { Segment } from '@/db/schema';
import { absolutize } from '@/utils/file-store';
import { generateThumbnail } from '@/utils/video';

const THUMB_HEIGHT = 64;

type Props = {
  segments: Segment[];
  onReorder: (ids: string[]) => void;
  onDelete: (id: string) => void;
  onNext?: () => void;
};

export function SegmentBar({ segments, onReorder, onDelete, onNext }: Props) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  if (segments.length === 0) return null;

  return (
    <View style={styles.bar}>
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.content}>
        <Sortable.Grid
          rows={1}
          rowHeight={THUMB_HEIGHT}
          columnGap={Spacing.two}
          data={segments}
          keyExtractor={(s) => s.id}
          scrollableRef={scrollRef}
          autoScrollDirection="horizontal"
          onDragEnd={({ data }) => onReorder(data.map((s) => s.id))}
          renderItem={({ item }) => (
            <SegmentThumb segment={item} onDelete={() => onDelete(item.id)} />
          )}
        />
      </Animated.ScrollView>

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

function SegmentThumb({ segment, onDelete }: { segment: Segment; onDelete: () => void }) {
  const [thumbnail, setThumbnail] = useState<VideoThumbnail>();

  useEffect(() => {
    let active = true;
    void generateThumbnail(absolutize(segment.originalFilename)).then((t) => {
      if (active) setThumbnail(t);
    });
    return () => {
      active = false;
    };
  }, [segment.originalFilename]);

  return (
    <View style={styles.thumb}>
      {thumbnail ? (
        <Image source={thumbnail} style={styles.thumbImage} contentFit="cover" />
      ) : (
        <SymbolView name="video.fill" size={18} tintColor="rgba(255,255,255,0.8)" />
      )}
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
  scroll: { flex: 1 },
  content: { alignItems: 'center', paddingRight: Spacing.two },
  thumb: {
    width: 48,
    height: THUMB_HEIGHT,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
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
