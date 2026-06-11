const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Let Metro resolve Drizzle's generated .sql migration files.
config.resolver.sourceExts.push('sql');

// react-native-video-trim is linked from a local git submodule (modules/react-native-video-trim)
// for fast native iteration. That submodule has its OWN node_modules (react/react-native devDeps
// + build/test tooling) — block it so Metro resolves a single copy of every package from the
// project root and the submodule's tooling files aren't crawled into the app bundle.
const submoduleModules = path.resolve(__dirname, 'modules/react-native-video-trim/node_modules');
config.resolver.blockList = [
  new RegExp(`^${submoduleModules.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/.*`),
];
// The linked package's peer deps (react, react-native) resolve from the project's node_modules.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

module.exports = config;
