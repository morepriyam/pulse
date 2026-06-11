const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('@expo/config-plugins');

// react-native-video-trim (FFmpegKit) writes output files and shares them via a
// FileProvider on Android. The library ships no Expo config plugin, so we inject the
// required FileProvider + res/xml/file_paths.xml here (CNG-safe; survives prebuild).
// iOS needs nothing native (the pod links FFmpegKit `min` automatically); its photo-
// library usage string lives in app.json `ios.infoPlist`.

const AUTHORITY_SUFFIX = '.provider';

const FILE_PATHS_XML = `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
  <files-path name="internal_files" path="." />
  <cache-path name="cache_files" path="." />
  <external-path name="external_files" path="." />
</paths>
`;

function addFileProvider(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.provider = app.provider ?? [];

    const authority = '${applicationId}' + AUTHORITY_SUFFIX;
    const already = app.provider.some((p) => p.$?.['android:authorities'] === authority);
    if (already) return cfg;

    app.provider.push({
      $: {
        'android:name': 'androidx.core.content.FileProvider',
        'android:authorities': authority,
        'android:exported': 'false',
        'android:grantUriPermissions': 'true',
      },
      'meta-data': [
        {
          $: {
            'android:name': 'android.support.FILE_PROVIDER_PATHS',
            'android:resource': '@xml/file_paths',
          },
        },
      ],
    });
    return cfg;
  });
}

function addFilePathsResource(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const xmlDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, 'file_paths.xml'), FILE_PATHS_XML);
      return cfg;
    },
  ]);
}

module.exports = function withVideoTrim(config) {
  config = addFileProvider(config);
  config = addFilePathsResource(config);
  return config;
};
