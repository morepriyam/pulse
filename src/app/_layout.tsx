import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MigrationGate } from '@/db/migrate';
import { ToastProvider } from '@/features/toast/toast-provider';
import { UploadDeepLinkProvider } from '@/features/upload/upload-deep-link-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RootLayout() {
  const isDark = useColorScheme() === 'dark';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
          <MigrationGate>
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
          </MigrationGate>
          <StatusBar style="auto" />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
