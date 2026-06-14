// Lightweight unit-test runner for the project's PURE logic (timeline math, transcription
// decisions, model catalog) — no React/React Native rendering. Files are transformed with the
// project's Babel config, and the `@/` path alias is mapped to `src/`.
module.exports = {
  testEnvironment: 'node',
  transform: { '^.+\\.[jt]sx?$': 'babel-jest' },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testMatch: ['<rootDir>/src/**/*.test.ts'],
};
