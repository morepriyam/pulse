import { PermissionsAndroid, Platform } from 'react-native';
import BackgroundService, { type BackgroundTaskOptions } from 'react-native-background-actions';

let active = false;
/** Resolves the current service task body, letting the service wind down — set per `begin()`. */
let releaseIdle: (() => void) | null = null;

const OPTIONS: BackgroundTaskOptions = {
  taskName: 'PulseUploads',
  taskTitle: 'Uploading to your server',
  taskDesc: 'Keeping your uploads going in the background.',
  taskIcon: { name: 'ic_launcher', type: 'mipmap' },
  linkingURI: 'pulsecam://',
  // Android 14+ requires the runtime foregroundServiceType passed to startForeground() to match the
  // type declared on the service in the manifest (see plugins/with-upload-foreground-service.js).
  foregroundServiceType: ['dataSync'],
};

/**
 * The foreground-service task body. It exists only to hold the app process alive (and show the
 * required notification) while the manager's drain loop runs in the normal JS context — so a
 * backgrounded Android upload isn't frozen/killed under Doze. It parks on a promise that `end()`
 * resolves (no polling), so the service winds down the moment the queue drains.
 */
function idleUntilStopped(): Promise<void> {
  if (!active) return Promise.resolve();
  return new Promise<void>((resolve) => {
    releaseIdle = resolve;
  });
}

async function ensureNotificationPermission(): Promise<void> {
  if (Platform.OS !== 'android' || (Platform.Version as number) < 33) return;
  try {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  } catch {
    // Denied → the service still runs, the ongoing notification just won't be visible.
  }
}

/**
 * Keeps the JS runtime alive while uploads drain. ANDROID ONLY: wraps the drain in a `dataSync`
 * foreground service (react-native-background-actions) so the OS doesn't freeze/kill the process
 * when backgrounded — the whole multi-artifact pipeline keeps advancing, not just the in-flight
 * request. iOS is intentionally excluded: there the native URLSession background session carries the
 * in-flight transfer and `expo-background-task` handles after-kill resume, and a background-actions
 * service on iOS would lean on background modes Apple rejects for a non-audio app.
 *
 * Play Store note: the service is started only while an upload is actually running and stopped the
 * moment the queue drains — never on launch — which is exactly what a `dataSync` foreground service
 * must do to pass review. Every call is best-effort: if the native module isn't in the build (dev
 * before a rebuild), it no-ops and uploads simply run foreground-only.
 */
export const keepAlive = {
  async begin(): Promise<void> {
    if (Platform.OS !== 'android' || active) return;
    active = true;
    await ensureNotificationPermission();
    try {
      await BackgroundService.start(idleUntilStopped, OPTIONS);
    } catch {
      active = false;
    }
  },
  async end(): Promise<void> {
    if (!active) return;
    active = false;
    releaseIdle?.();
    releaseIdle = null;
    try {
      await BackgroundService.stop();
    } catch {
      // Already stopped / native module absent.
    }
  },
  async note(desc: string): Promise<void> {
    if (!active) return;
    try {
      await BackgroundService.updateNotification({ taskDesc: desc });
    } catch {
      // Best-effort progress text.
    }
  },
};
