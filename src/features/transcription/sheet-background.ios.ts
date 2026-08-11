import { presentationBackground, type ModifierConfig } from '@expo/ui/swift-ui/modifiers';

/** iOS: pin the SwiftUI sheet's surface to the app theme via presentationBackground. */
export function sheetBackgroundModifiers(color: string): ModifierConfig[] {
  return [presentationBackground(color)];
}
