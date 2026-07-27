import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { createContext, useContext, type ReactNode } from 'react';

import { Colors } from '@/constants/theme';
import { setThemePreference, themePreferenceQuery } from '@/db/settings';
import { useColorScheme } from '@/hooks/use-color-scheme';

type ResolvedScheme = 'light' | 'dark';

const ResolvedSchemeContext = createContext<ResolvedScheme | null>(null);

/**
 * Resolves the effective light/dark mode once — the user's manual override (persisted via the
 * home screen's appearance switch) when one is set, else the OS color scheme — and exposes it
 * via context. `useColorScheme()` can return `null`/`undefined` (scheme not yet known) as well
 * as the literal `"unspecified"` (Android's Appearance API when the OS reports no preference) —
 * none of those are keys in `Colors`, so all three fall back to light.
 *
 * Mount once near the app root, INSIDE `MigrationGate`: the provider live-queries the
 * `settings` table, which doesn't exist until schema migrations have run on a fresh install.
 * `useTheme()`/`useThemeToggle()` are called from very frequently-rendered leaf components
 * (`ThemedText`, `ThemedView`, cue rows, …), so resolving the scheme here — a single
 * `useLiveQuery` subscription — avoids each of those instances opening its own Drizzle
 * live-query subscription.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const osScheme = useOsScheme();

  const { data } = useLiveQuery(themePreferenceQuery, []);
  const pref = data[0]?.value;
  const resolved: ResolvedScheme = pref === 'light' || pref === 'dark' ? pref : osScheme;

  return <ResolvedSchemeContext.Provider value={resolved}>{children}</ResolvedSchemeContext.Provider>;
}

function useOsScheme(): ResolvedScheme {
  const scheme = useColorScheme();
  return scheme === 'light' || scheme === 'dark' ? scheme : 'light';
}

/**
 * Outside the provider — i.e. `MigrationGate`'s pre-migration loading/error UI, where the
 * `settings` table may not exist yet so the stored preference is unreadable — themed
 * components deliberately follow the OS scheme instead.
 */
function useResolvedScheme(): ResolvedScheme {
  const fromContext = useContext(ResolvedSchemeContext);
  const osScheme = useOsScheme();
  return fromContext ?? osScheme;
}

/** The resolved light/dark mode (manual override, else OS scheme). Drives the navigation
 * theme and status bar in the root layout, so they can't drift from the app's own colors. */
export function useThemeMode(): ResolvedScheme {
  return useResolvedScheme();
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
