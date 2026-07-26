import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MigrationGate } from '@/db/migrate';
import { ToastProvider } from '@/features/toast/toast-provider';
import { UploadDeepLinkProvider } from '@/features/upload/upload-deep-link-provider';
import { ThemeProvider as AppThemeProvider, useThemeMode } from '@/hooks/use-theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* AppThemeProvider live-queries the settings table, so it must mount inside
            MigrationGate — on a fresh install the table doesn't exist until migrations run.
            The gate's own loading/error UI follows the OS scheme (see use-theme.tsx). */}
        <MigrationGate>
          <AppThemeProvider>
            <ThemedNavigation />
          </AppThemeProvider>
        </MigrationGate>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Navigation tree, themed from the RESOLVED scheme (manual override, else OS) so the router
 * theme and status bar can't drift from the app's own colors when the user flips the switch. */
function ThemedNavigation() {
  const isDark = useThemeMode() === 'dark';

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <ToastProvider>
        <UploadDeepLinkProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="recorder" options={{ presentation: 'fullScreenModal' }} />
            <Stack.Screen name="export" options={{ presentation: 'fullScreenModal' }} />
            <Stack.Screen
              name="onboarding"
              options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
            />
          </Stack>
        </UploadDeepLinkProvider>
      </ToastProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
