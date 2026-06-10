const { withXcodeProject } = require('@expo/config-plugins');

/**
 * Disables Xcode "User Script Sandboxing" on Debug builds only, so Expo's bundle
 * phase can write its dev-server `ip.txt` on device builds. Release keeps the
 * sandbox (nothing in a release bundle phase needs the write). Survives prebuild
 * (CNG-safe).
 */
module.exports = function withDisableScriptSandboxing(config) {
  return withXcodeProject(config, (cfg) => {
    const configurations = cfg.modResults.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configurations)) {
      const entry = configurations[key];
      const name = String(entry?.name ?? '').replace(/"/g, '');
      if (entry?.buildSettings && name === 'Debug') {
        entry.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
      }
    }
    return cfg;
  });
};
