import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MigrationGate } from '@/db/migrate';
import { TranscriptionProvider } from '@/features/transcription/transcription-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RootLayout() {
  const isDark = useColorScheme() === 'dark';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
          <MigrationGate>
            <TranscriptionProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="recorder" options={{ presentation: 'fullScreenModal' }} />
                <Stack.Screen name="export" options={{ presentation: 'fullScreenModal' }} />
                <Stack.Screen
                  name="onboarding"
                  options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
                />
              </Stack>
            </TranscriptionProvider>
          </MigrationGate>
          <StatusBar style="auto" />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
