import type { ImageSourcePropType } from 'react-native';
import type { SymbolViewProps } from 'expo-symbols';

/** A feature line. `icon` is the SAME SF Symbol the app uses for that action, so the
 *  tour teaches the real glyph; omit it for conceptual lines (falls back to a dot). */
export type Bullet = {
  icon?: SymbolViewProps['name'];
  /** Render the red record-button glyph (takes precedence over `icon`) for the shutter line. */
  record?: boolean;
  text: string;
};

/** A single onboarding page: a hero (logo image or SF Symbol) plus a bulleted feature list. */
export type OnboardingStep = {
  key: string;
  /** SF Symbol hero (via expo-symbols). Ignored when `image` is set. */
  symbol?: SymbolViewProps['name'];
  /** Image hero (e.g. the Pulse logo) — takes precedence over `symbol`. */
  image?: ImageSourcePropType;
  title: string;
  bullets: readonly Bullet[];
};

/**
 * The first-run tour. Three swipes that name every working feature next to the actual
 * in-app icon that triggers it, so a new user learns the glyphs as they learn the app.
 */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    key: 'welcome',
    image: require('../../../assets/images/pulse-logo-master-2048.png'),
    title: 'Welcome to Pulse',
    bullets: [
      { text: 'Everything runs on your device — your recordings are never uploaded.' },
      { text: 'No account, no sign-in — get started in seconds.' },
      { text: 'Swipe through to learn what every button does.' },
    ],
  },
  {
    key: 'record',
    symbol: 'video.fill',
    title: 'Record & arrange',
    bullets: [
      {
        record: true,
        text: 'Hold the shutter to record a clip; lift to pause, hold again to add the next one.',
      },
      {
        icon: 'play.fill',
        text: 'Tap a clip in the segment bar to open its preview — it starts playing right away.',
      },
      {
        icon: 'scissors',
        text: 'Press and hold a clip to open its editor and trim the start and end.',
      },
      {
        icon: 'line.3.horizontal',
        text: 'Drag a clip by its grab strip to reorder your timeline.',
      },
      { icon: 'trash', text: 'Drag a clip onto the trash to delete it from the segment bar.' },
      {
        icon: 'arrow.triangle.2.circlepath.camera',
        text: 'Flip cameras, switch lenses, pinch to zoom, fire the torch, set stabilization, or mute audio.',
      },
    ],
  },
  {
    key: 'finish',
    symbol: 'captions.bubble.fill',
    title: 'Caption, polish & share',
    bullets: [
      {
        icon: 'sparkles',
        text: 'Every clip is captioned automatically — tap Model to choose a transcription model, from Base to multilingual Large Turbo.',
      },
      {
        icon: 'captions.bubble',
        text: 'Open the caption editor to split, merge, edit, or delete individual cues.',
      },
      {
        icon: 'arrow.uturn.backward',
        text: 'Nudge any cue ±100 ms with the playhead, or reset it back to auto.',
      },
      { icon: 'arrow.right', text: 'Export merges all your clips into one seamless video.' },
      {
        icon: 'square.and.arrow.up',
        text: 'Share via the system sheet, or save to Photos or Files.',
      },
      {
        icon: 'square.and.arrow.down',
        text: 'Rename, delete, and reopen drafts at home, or move them between devices as .pulse files.',
      },
    ],
  },
];
