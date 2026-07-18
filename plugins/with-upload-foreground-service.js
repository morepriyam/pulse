const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

// The fully-qualified name react-native-background-actions' service resolves to (its own manifest
// declares it as `.RNBackgroundActionsTask` under package `com.asterinet.react.bgactions`).
const RNBA_SERVICE = 'com.asterinet.react.bgactions.RNBackgroundActionsTask';

/**
 * Makes the background upload manager's foreground service Android-14-compliant.
 *
 * react-native-background-actions ships a foreground `<service>` but declares neither the `dataSync`
 * service type nor the API-34 `FOREGROUND_SERVICE_DATA_SYNC` permission, and the app needs
 * `POST_NOTIFICATIONS` (API 33+) for the required ongoing notification. This plugin adds those
 * permissions and stamps `android:foregroundServiceType="dataSync"` onto the library's service, so
 * starting it while a user's videos upload doesn't throw on Android 14+. The manager only runs the
 * service during an active upload and stops it on drain, which is what a `dataSync` service must do
 * to pass Play review. CNG-safe; survives prebuild. iOS needs nothing here — background uploads
 * there use the native URLSession session (expo-file-system) plus expo-background-task.
 */
module.exports = function withUploadForegroundService(config) {
  config = AndroidConfig.Permissions.withPermissions(config, [
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
    'android.permission.POST_NOTIFICATIONS',
  ]);

  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.service = app.service ?? [];
    let service = app.service.find((s) => s.$?.['android:name'] === RNBA_SERVICE);
    if (!service) {
      service = { $: { 'android:name': RNBA_SERVICE } };
      app.service.push(service);
    }
    service.$['android:foregroundServiceType'] = 'dataSync';
    return cfg;
  });
};
