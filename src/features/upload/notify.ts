import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

const CHANNEL_ID = 'uploads';

let permissionRequested = false;

/**
 * Request notification permission once, in a foreground moment (called from `enqueue`, right after
 * the user taps Upload — the natural time to ask on iOS). Also creates the Android channel the
 * completion/failure banners post to. Best-effort: no-ops if the native module isn't in the build
 * yet (a dev client before `expo prebuild`), so uploads simply run without banners.
 */
async function ensurePermission(): Promise<void> {
  if (permissionRequested) return;
  permissionRequested = true;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Uploads',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') await Notifications.requestPermissionsAsync();
  } catch {
    // expo-notifications absent / permission flow failed — the pipeline runs unaffected.
  }
}

/**
 * Present an immediate local notification — but only while the app isn't foregrounded. In the
 * foreground the in-app UI already communicates the result (the export-screen prompt and the
 * home-card badge), so an OS banner would just double up. This fills the real gap: a background /
 * off-screen upload that finishes or fails would otherwise be completely silent.
 *
 * On Android the `{ channelId }` trigger presents immediately on our channel; on iOS `null` does the
 * same. Best-effort throughout — a missing permission or module must never break an upload.
 */
async function present(title: string, body: string): Promise<void> {
  if (AppState.currentState === 'active') return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
    });
  } catch {
    // Best-effort — never let a notification failure surface into the upload pipeline.
  }
}

export const uploadNotify = {
  ensurePermission,
  complete: () => present('Upload complete', 'Your pulse is on your server.'),
  failed: () => present('Upload failed', 'An upload didn’t finish — open Pulse to retry.'),
};
