// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      globals: {
        jest: 'readonly',
      },
    },
  },
]);
