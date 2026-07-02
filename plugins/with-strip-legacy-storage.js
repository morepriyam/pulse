const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

/**
 * Removes `android:requestLegacyExternalStorage="true"` from the manifest.
 * expo-media-library's config plugin adds it unconditionally as a 2019-era
 * scoped-storage escape hatch, but the attribute only has effect on
 * Android 10 (API 29) and is ignored from API 30 on. Everything this app
 * does with media goes through MediaStore/SAF (expo-media-library,
 * expo-image-picker), which work under scoped storage — no direct
 * external-path file access anywhere — so the opt-out is dead weight that
 * trips app-store security scans. Manifest mods execute in REVERSE plugin
 * order, so this must be listed BEFORE expo-media-library in app.json for
 * the delete to run after the add (verified via `expo config --type
 * introspect`). Survives prebuild (CNG-safe).
 */
module.exports = function withStripLegacyStorage(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    delete app.$['android:requestLegacyExternalStorage'];
    return cfg;
  });
};
