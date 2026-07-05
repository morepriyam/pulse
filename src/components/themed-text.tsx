import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import type { ThemeColor } from '@/constants/theme';
import { Fonts, SystemColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Typography follows the iOS / iPadOS 27 type scale (Apple Design Resources).
 * Sizes and line heights are taken from the kit's Dynamic Type + Text Leading
 * collections at the "Large (Default)" content size. Weights follow Apple's
 * defaults (Regular, with Headline/Large Title emphasized).
 *
 * Prefer the iOS-named variants (`body`, `headline`, `title1`, …) for new code.
 * The legacy names (`default`, `title`, `subtitle`, `small`, `smallBold`) are
 * kept as aliases mapped to their nearest iOS style so existing call sites work.
 */
export type ThemedTextProps = TextProps & {
  type?:
    | 'largeTitle'
    | 'title1'
    | 'title2'
    | 'title3'
    | 'headline'
    | 'body'
    | 'callout'
    | 'subheadline'
    | 'footnote'
    | 'caption1'
    | 'caption2'
    // legacy aliases
    | 'default'
    | 'title'
    | 'subtitle'
    | 'small'
    | 'smallBold'
    | 'link'
    | 'linkPrimary'
    | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return <Text style={[{ color: theme[themeColor ?? 'text'] }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  // iOS 27 type scale — size / lineHeight / weight
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: 700 },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: 400 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: 400 },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: 400 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: 600 },
  body: { fontSize: 17, lineHeight: 22, fontWeight: 400 },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: 400 },
  subheadline: { fontSize: 15, lineHeight: 20, fontWeight: 400 },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: 400 },
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: 400 },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: 400 },

  // Legacy aliases mapped to the nearest iOS style
  default: { fontSize: 17, lineHeight: 22, fontWeight: 400 }, // → Body
  title: { fontSize: 34, lineHeight: 41, fontWeight: 700 }, // → Large Title
  subtitle: { fontSize: 28, lineHeight: 34, fontWeight: 600 }, // → Title 1 (emphasized)
  small: { fontSize: 15, lineHeight: 20, fontWeight: 400 }, // → Subheadline
  smallBold: { fontSize: 15, lineHeight: 20, fontWeight: 600 }, // → Subheadline (emphasized)
  link: { fontSize: 15, lineHeight: 20, fontWeight: 400 }, // → Subheadline
  linkPrimary: { fontSize: 15, lineHeight: 20, fontWeight: 400, color: SystemColors.blue.light }, // iOS system blue
  code: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: Platform.select({ android: 700 }) ?? 400,
  },
});
