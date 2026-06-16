import type { SymbolViewProps } from 'expo-symbols';
import { Icon } from '@/components/icon';
import { Modal, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** On-screen rect of the control the menu points at (from `measureInWindow`). */
export type Anchor = { x: number; y: number; width: number; height: number };

export type MenuAction = {
  key: string;
  label: string;
  icon: SymbolViewProps['name'];
  /** Renders the row in the accent (red) tint for irreversible actions. */
  destructive?: boolean;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  /** The control the menu anchors to; its right edge aligns to the anchor's right edge. */
  anchor: Anchor | null;
  actions: MenuAction[];
  onClose: () => void;
};

const MENU_WIDTH = 220;
const GAP = Spacing.one;
/** Approximate row height — used only to decide whether the menu opens up or down. */
const EST_ROW_HEIGHT = 48;

/**
 * A popover menu anchored to a control (e.g. a ⋯ button) rather than a bottom sheet. Pops
 * below the anchor, or above it when there isn't room. Generic by design: callers pass a
 * list of {@link MenuAction}s, so new options are added by extending that array.
 */
export function ActionMenu({ visible, anchor, actions, onClose }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();

  if (!anchor) return null;

  const estHeight = actions.length * EST_ROW_HEIGHT + Spacing.two;
  const openUp = anchor.y + anchor.height + GAP + estHeight > screenH - insets.bottom;
  const top = openUp
    ? Math.max(insets.top, anchor.y - GAP - estHeight)
    : anchor.y + anchor.height + GAP;
  // Pin the menu's right edge to the anchor's right edge, kept on-screen.
  const right = Math.max(insets.right + Spacing.two, screenW - (anchor.x + anchor.width));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss">
        {/* Swallow taps on the menu itself so they don't reach the backdrop. */}
        <Pressable onPress={() => {}} style={[styles.menu, { top, right, width: MENU_WIDTH }]}>
          <ThemedView style={[styles.card, { borderColor: theme.border }]}>
            {actions.map((action, i) => {
              const tint = action.destructive ? theme.accent : theme.text;
              return (
                <Pressable
                  key={action.key}
                  onPress={action.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  style={({ pressed }) => [
                    styles.row,
                    i > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: theme.border,
                    },
                    pressed && { backgroundColor: theme.backgroundSelected },
                  ]}>
                  <ThemedText style={[styles.rowLabel, { color: tint }]}>{action.label}</ThemedText>
                  <Icon name={action.icon} size={18} tintColor={tint} />
                </Pressable>
              );
            })}
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
  },
  card: {
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
});
