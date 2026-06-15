import type { SymbolViewProps } from 'expo-symbols';
import type { ImageSourcePropType } from 'react-native';

/** A single onboarding page: a hero (logo image or SF Symbol) plus a bulleted feature list. */
export type OnboardingStep = {
  key: string;
  /** SF Symbol hero (via expo-symbols). Ignored when `image` is set. */
  symbol?: SymbolViewProps['name'];
  /** Image hero (e.g. the Pulse logo) — takes precedence over `symbol`. */
  image?: ImageSourcePropType;
  title: string;
  /** Feature bullets — each says what it does and, where useful, how it works. */
  bullets: readonly string[];
};

/**
 * The first-run tour. Three swipes that, together, name every working feature
 * and the gesture or step that triggers it, so a new user knows the whole app.
 */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    key: 'welcome',
    image: require('../../../assets/images/pulse-logo-master-2048.png'),
    title: 'Welcome to Pulse',
    bullets: [
      'Capture short videos as a series of clips, all kept together as one draft.',
      'Whisper AI writes the captions for you, on-device — nothing is ever uploaded.',
      'Works fully offline: no account, no sign-in, no cloud.',
      'Swipe to see what you can do today.',
    ],
  },
  {
    key: 'record',
    symbol: 'video.fill',
    title: 'Record & arrange',
    bullets: [
      'Hold the shutter to record a clip; lift to pause, hold again to add the next one.',
      'Tap a clip in the segment bar to open its preview.',
      'Press and hold a clip to trim its start and end.',
      'Drag a clip left or right to reorder your timeline.',
      'Drag a clip onto the trash to delete it from the segment bar.',
      'Flip cameras, switch lenses, pinch to zoom, fire the torch, pick a stabilization mode, or mute audio.',
    ],
  },
  {
    key: 'finish',
    symbol: 'text.bubble.fill',
    title: 'Caption, polish & share',
    bullets: [
      'Every clip is captioned automatically — tap “AI” to pick a model (Tiny → Large Turbo) and language.',
      'Open the caption editor to split, merge, edit, or delete individual cues.',
      'Nudge any cue ±100 ms while the playhead follows along, or reset it back to auto.',
      'Export stitches your clips into one video with the captions burned in.',
      'Share via the system sheet — Messages, AirDrop, anywhere — or save to Photos or Files.',
      'Rename, delete, and reopen drafts at home, or move them between devices as .pulse files.',
    ],
  },
];
