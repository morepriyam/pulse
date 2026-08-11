import { background, type ModifierConfig } from '@expo/ui/jetpack-compose/modifiers';

/** Android: pin the M3 ModalBottomSheet's surface to the app theme via a background modifier. */
export function sheetBackgroundModifiers(color: string): ModifierConfig[] {
  return [background(color)];
}
