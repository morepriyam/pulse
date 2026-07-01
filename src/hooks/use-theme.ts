import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  const scheme = useColorScheme();
  // `useColorScheme()` can return `null`/`undefined` (scheme not yet known) as well as the
  // literal `"unspecified"` (Android's Appearance API when the OS reports no preference) —
  // none of those are keys in `Colors`, so all three fall back to light.
  const theme = scheme === 'light' || scheme === 'dark' ? scheme : 'light';

  return Colors[theme];
}
