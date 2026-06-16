import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Icon } from '@/components/icon';
import { useCallback, useRef, useState } from 'react';
import {
  type FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { markOnboardingComplete } from '@/db/settings';
import { ONBOARDING_STEPS } from '@/features/onboarding/steps';
import { useTheme } from '@/hooks/use-theme';

/** A single page indicator that grows/brightens as its page scrolls into view. */
function Dot({
  index,
  scrollX,
  width,
  color,
}: {
  index: number;
  scrollX: SharedValue<number>;
  width: number;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const input = [(index - 1) * width, index * width, (index + 1) * width];
    return {
      width: interpolate(scrollX.value, input, [8, 22, 8], Extrapolation.CLAMP),
      opacity: interpolate(scrollX.value, input, [0.35, 1, 0.35], Extrapolation.CLAMP),
    };
  });
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

export function OnboardingScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollX = useSharedValue(0);
  const listRef = useRef<FlatList<(typeof ONBOARDING_STEPS)[number]>>(null);
  const [index, setIndex] = useState(0);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  const isLast = index === ONBOARDING_STEPS.length - 1;

  // Both "Skip" and the final CTA mark onboarding done so it never reappears.
  // Skipping returns to home; finishing drops the user straight into the recorder.
  const finish = useCallback((toRecorder: boolean) => {
    markOnboardingComplete().catch(() => {});
    if (toRecorder) router.replace('/recorder');
    else router.back();
  }, []);

  const next = () => {
    if (isLast) finish(true);
    else listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable onPress={() => finish(false)} hitSlop={12} accessibilityRole="button">
          <ThemedText type="smallBold" themeColor="textSecondary">
            Skip
          </ThemedText>
        </Pressable>
      </View>

      <Animated.FlatList
        ref={listRef}
        data={ONBOARDING_STEPS}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(e) =>
          setIndex(Math.round(e.nativeEvent.contentOffset.x / width))
        }
        renderItem={({ item }) => (
          <ScrollView
            style={{ width }}
            contentContainerStyle={styles.page}
            showsVerticalScrollIndicator={false}>
            {item.image ? (
              <Image source={item.image} style={styles.logo} contentFit="contain" />
            ) : (
              <View style={[styles.iconCard, { backgroundColor: theme.backgroundElement }]}>
                <Icon name={item.symbol ?? 'sparkles'} size={56} tintColor={theme.accent} />
              </View>
            )}
            <ThemedText style={styles.title}>{item.title}</ThemedText>
            <View style={styles.bullets}>
              {item.bullets.map((bullet, i) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={styles.bulletLead}>
                    {bullet.record ? (
                      <View style={[styles.recordRing, { borderColor: theme.accent }]}>
                        <View style={[styles.recordDot, { backgroundColor: theme.accent }]} />
                      </View>
                    ) : bullet.icon ? (
                      <Icon name={bullet.icon} size={19} tintColor={theme.accent} />
                    ) : (
                      <View style={[styles.bulletDot, { backgroundColor: theme.accent }]} />
                    )}
                  </View>
                  <ThemedText style={styles.bulletText}>{bullet.text}</ThemedText>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.four }]}>
        <View style={styles.dots}>
          {ONBOARDING_STEPS.map((step, i) => (
            <Dot key={step.key} index={i} scrollX={scrollX} width={width} color={theme.accent} />
          ))}
        </View>
        <Pressable
          onPress={next}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
          ]}>
          <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
            {isLast ? 'Start recording' : 'Next'}
          </ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.four,
  },
  page: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.four,
    gap: Spacing.four,
  },
  logo: {
    width: 132,
    height: 132,
  },
  iconCard: {
    width: 116,
    height: 116,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  bullets: {
    width: '100%',
    gap: Spacing.three,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  // Fixed lead column, sized to the first text line (lineHeight 24) and centering whatever
  // glyph it holds — so icon, dot, and record bullets all align to the first line of text.
  bulletLead: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  // Mini record button: a red disc inside a red ring, matching the recorder's shutter.
  recordRing: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
  },
  bulletText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 10,
  },
  dot: { height: 8, borderRadius: 4 },
  cta: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
