// Type-only import — erased at compile time, so no platform code is bundled from it.
import type { ModifierConfig } from '@expo/ui/swift-ui/modifiers';

/**
 * Theme-pinned background modifiers for the native bottom sheet.
 *
 * Platform-split (.ios.ts / .android.ts) because the real implementations import
 * platform-specific @expo/ui subpackages (`swift-ui/modifiers` / `jetpack-compose/modifiers`),
 * and per the Expo UI docs those must never be bundled into the other platform's JS. This
 * base file is the resolution fallback for platforms with neither (tests, web): no modifiers.
 */
export function sheetBackgroundModifiers(_color: string): ModifierConfig[] {
  return [];
}
