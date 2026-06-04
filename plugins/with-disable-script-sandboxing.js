const { withXcodeProject } = require('@expo/config-plugins');

/**
 * Disables Xcode "User Script Sandboxing" so Expo's bundle phase can write
 * its dev-server `ip.txt` on device builds. Survives prebuild (CNG-safe).
 */
module.exports = function withDisableScriptSandboxing(config) {
  return withXcodeProject(config, (cfg) => {
    const configurations = cfg.modResults.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configurations)) {
      const settings = configurations[key]?.buildSettings;
      if (settings) settings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
    }
    return cfg;
  });
};
