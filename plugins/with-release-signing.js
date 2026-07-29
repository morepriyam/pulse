const { withAppBuildGradle } = require('@expo/config-plugins');

// The android/ directory is generated (CNG), so the release signing config must be
// injected at prebuild time. Credentials are read from Gradle properties supplied via
// ~/.gradle/gradle.properties (PULSE_UPLOAD_STORE_FILE, PULSE_UPLOAD_KEY_ALIAS,
// PULSE_UPLOAD_STORE_PASSWORD, PULSE_UPLOAD_KEY_PASSWORD) so no secret ever enters the
// repo. When the properties are absent (dev machines, CI without secrets), release
// builds fall back to the debug keystore exactly as the template does.

const SIGNING_CONFIG = `        release {
            if (findProperty('PULSE_UPLOAD_STORE_FILE')) {
                storeFile file(PULSE_UPLOAD_STORE_FILE)
                storePassword PULSE_UPLOAD_STORE_PASSWORD
                keyAlias PULSE_UPLOAD_KEY_ALIAS
                keyPassword PULSE_UPLOAD_KEY_PASSWORD
            }
        }
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents;

    if (!gradle.includes('PULSE_UPLOAD_STORE_FILE')) {
      // Add a release entry inside signingConfigs { ... }
      gradle = gradle.replace(/signingConfigs\s*\{\n/, (match) => match + SIGNING_CONFIG);

      // Point the release build type at it when credentials are available.
      gradle = gradle.replace(
        /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
        "$1signingConfig findProperty('PULSE_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug"
      );
    }

    mod.modResults.contents = gradle;
    return mod;
  });
};
