// Lightweight unit-test runner for the project's PURE logic (timeline math, transcription
// decisions, model catalog) — no React/React Native rendering. Files are transformed with the
// project's Babel config, and the `@/` path alias is mapped to `src/`.
module.exports = {
  testEnvironment: 'node',
  transform: { '^.+\\.[jt]sx?$': 'babel-jest' },
  // subsrt-ts ships ESM-only — it must be transformed, not ignored, for srt.ts's tests.
  transformIgnorePatterns: ['node_modules/(?!subsrt-ts/)'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  // Independent git submodules with their own package.json — exclude them from
  // haste-map scanning so jest doesn't see a naming collision with this app's own
  // package.json (both happen to be named "pulse").
  modulePathIgnorePatterns: ['<rootDir>/pulse-mieweb', '<rootDir>/pulsevault-mieweb'],
  watchPathIgnorePatterns: ['<rootDir>/pulse-mieweb', '<rootDir>/pulsevault-mieweb'],
};
