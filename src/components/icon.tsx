import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import {
  ArrowDownToLine,
  ArrowRight,
  Camera,
  Captions,
  Check,
  ChevronUp,
  Circle,
  CircleCheck,
  CircleSlash,
  CircleX,
  Download,
  Ellipsis,
  Film,
  Folder,
  GripHorizontal,
  type LucideIcon,
  Merge,
  Mic,
  MicOff,
  Minus,
  Orbit,
  Pencil,
  Play,
  Plus,
  RotateCw,
  Scissors,
  Share,
  Sparkles,
  SwitchCamera,
  Trash2,
  TriangleAlert,
  Undo2,
  Upload,
  Video,
  WandSparkles,
  X,
  Zap,
  ZapOff,
} from 'lucide-react-native';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';

export type IconName = SymbolViewProps['name'];
type SymbolWeight = SymbolViewProps['weight'];

/**
 * SF Symbol → Lucide glyph. SF Symbols (expo-symbols) are Apple-only, so on Android we
 * render the closest Lucide equivalent. Keep this in sync with every `name` passed to <Icon>.
 */
const ANDROID_GLYPHS: Partial<Record<string, LucideIcon>> = {
  'arrow.clockwise': RotateCw,
  'arrow.down.to.line': ArrowDownToLine,
  'arrow.right': ArrowRight,
  'arrow.triangle.merge': Merge,
  'arrow.triangle.2.circlepath.camera': SwitchCamera,
  'arrow.uturn.backward': Undo2,
  'bolt.fill': Zap,
  'bolt.slash.fill': ZapOff,
  'camera.fill': Camera,
  'captions.bubble': Captions,
  'captions.bubble.fill': Captions,
  checkmark: Check,
  'checkmark.circle.fill': CircleCheck,
  'chevron.up': ChevronUp,
  'circle.slash': CircleSlash,
  ellipsis: Ellipsis,
  'exclamationmark.triangle.fill': TriangleAlert,
  film: Film,
  folder: Folder,
  gyroscope: Orbit,
  'line.3.horizontal': GripHorizontal,
  'mic.fill': Mic,
  'mic.slash.fill': MicOff,
  minus: Minus,
  pencil: Pencil,
  'play.fill': Play,
  plus: Plus,
  scissors: Scissors,
  sparkles: Sparkles,
  'square.and.arrow.down': Download,
  'square.and.arrow.up': Share,
  trash: Trash2,
  'trash.fill': Trash2,
  'icloud.and.arrow.up': Upload,
  'video.badge.plus': Video,
  'video.fill': Video,
  'wand.and.stars': WandSparkles,
  xmark: X,
  'xmark.circle.fill': CircleX,
};

// SF Symbol weights don't map 1:1 to stroke width; approximate so heavier glyphs read bolder.
function strokeWidthFor(weight?: SymbolWeight): number {
  switch (weight) {
    case 'bold':
    case 'heavy':
    case 'black':
    case 'semibold':
      return 2.5;
    case 'medium':
      return 2.25;
    case 'light':
    case 'thin':
    case 'ultraLight':
      return 1.5;
    default:
      return 2;
  }
}

type IconProps = {
  name: IconName;
  size?: number;
  weight?: SymbolWeight;
  tintColor?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Cross-platform icon. Renders a native SF Symbol on iOS and the mapped Lucide glyph on
 * Android (where SF Symbols don't exist). Drop-in for the props we used on <Icon>.
 */
export function Icon({ name, size = 24, weight, tintColor, style }: IconProps) {
  if (Platform.OS === 'ios') {
    return (
      <SymbolView name={name} size={size} weight={weight} tintColor={tintColor} style={style} />
    );
  }

  // `name` can also be the { ios, android, web } per-platform form, which isn't a valid map key.
  const Glyph = ANDROID_GLYPHS[name as string];
  if (!Glyph) {
    if (__DEV__) {
      console.warn(
        `[Icon] No Android mapping for SF Symbol "${String(name)}" — add it to ANDROID_GLYPHS.`,
      );
    }
    return (
      <Circle
        size={size}
        color={tintColor ?? '#888'}
        strokeWidth={strokeWidthFor(weight)}
        style={style}
      />
    );
  }
  return (
    <Glyph
      size={size}
      color={tintColor ?? '#000'}
      strokeWidth={strokeWidthFor(weight)}
      style={style}
    />
  );
}
