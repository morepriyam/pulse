import { Platform } from 'react-native';

/**
 * iOS / iPadOS 27 system red — record button, primary actions, highlights.
 * Base (light) value; the theme `accent` token below is mode-aware.
 */
export const Accent = '#FF383C';

/**
 * iOS / iPadOS 27 system color ramp (Apple Design Resources, Beta).
 * Exact values pulled from the official UI Kit variable collection.
 * Use these for any new design work that should feel native on iOS 27.
 */
export const SystemColors = {
  // System accent colors — light / dark
  red: { light: '#FF383C', dark: '#FF4245' },
  orange: { light: '#FF8D28', dark: '#FF9230' },
  yellow: { light: '#FFCC00', dark: '#FFD600' },
  green: { light: '#34C759', dark: '#30D158' },
  mint: { light: '#00C8B3', dark: '#00DAC3' },
  teal: { light: '#00C3D0', dark: '#00D2E0' },
  cyan: { light: '#00C0E8', dark: '#3CD3FE' },
  blue: { light: '#0088FF', dark: '#0091FF' },
  indigo: { light: '#6155F5', dark: '#6D7CFF' },
  purple: { light: '#CB30E0', dark: '#DB34F2' },
  pink: { light: '#FF2D55', dark: '#FF375F' },
  brown: { light: '#AC7F5E', dark: '#B78A66' },
  // System grays 1–6 — light / dark
  gray: { light: '#8E8E93', dark: '#8E8E93' },
  gray2: { light: '#AEAEB2', dark: '#636366' },
  gray3: { light: '#C7C7CC', dark: '#48484A' },
  gray4: { light: '#D1D1D6', dark: '#3A3A3C' },
  gray5: { light: '#E5E5EA', dark: '#2C2C2E' },
  gray6: { light: '#F2F2F7', dark: '#1C1C1E' },
} as const;

/**
 * Semantic theme tokens mapped to iOS / iPadOS 27 system colors.
 * The comment after each value names the Apple semantic role it mirrors.
 */
export const Colors = {
  light: {
    text: '#000000', // Label / Primary
    background: '#ffffff', // Background / Primary (systemBackground)
    backgroundElement: '#F2F2F7', // Background / Secondary (secondarySystemBackground)
    backgroundSelected: '#E5E5EA', // System Gray 5
    textSecondary: 'rgba(60,60,67,0.6)', // Label / Secondary
    border: '#C6C6C8', // Separator / Opaque (opaqueSeparator)
    accent: SystemColors.red.light, // #FF383C
    warning: SystemColors.orange.light, // #FF8D28 — soft/at-risk states
    onAccent: '#ffffff',
  },
  dark: {
    text: '#ffffff', // Label / Primary
    background: '#000000', // Background / Primary (systemBackground)
    backgroundElement: '#1C1C1E', // Background / Secondary (secondarySystemBackground)
    backgroundSelected: '#2C2C2E', // System Gray 5
    textSecondary: 'rgba(235,235,245,0.7)', // Label / Secondary
    border: '#38383A', // Separator / Opaque (opaqueSeparator)
    accent: SystemColors.red.dark, // #FF4245
    warning: SystemColors.orange.dark, // #FF9230 — soft/at-risk states
    onAccent: '#ffffff',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;
