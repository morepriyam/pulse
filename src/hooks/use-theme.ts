import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { Colors } from '@/constants/theme';
import { setThemePreference, themePreferenceQuery } from '@/db/settings';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * The effective light/dark mode: the user's manual override (persisted via the home screen's
 * appearance switch) when one is set, else the OS color scheme. `useColorScheme()` can return
 * `null`/`undefined` (scheme not yet known) as well as the literal `"unspecified"` (Android's
 * Appearance API when the OS reports no preference) — none of those are keys in `Colors`, so all
 * three fall back to light.
 */
function useResolvedScheme(): 'light' | 'dark' {
  const scheme = useColorScheme();
  const osScheme = scheme === 'light' || scheme === 'dark' ? scheme : 'light';

  const { data } = useLiveQuery(themePreferenceQuery, []);
  const pref = data[0]?.value;
  return pref === 'light' || pref === 'dark' ? pref : osScheme;
}

export function useTheme() {
  return Colors[useResolvedScheme()];
}

/** The dark/light mode switch shown on the home screen header. */
export function useThemeToggle() {
  const mode = useResolvedScheme();
  const toggle = () => void setThemePreference(mode === 'dark' ? 'light' : 'dark');
  return { mode, toggle };
}
