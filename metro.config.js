const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Let Metro resolve Drizzle's generated .sql migration files.
config.resolver.sourceExts.push('sql');

module.exports = config;
