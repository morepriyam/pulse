// Jest setup file for mocking modules
// Global test setup

// Console warning suppression for tests
const originalWarn = console.warn;
beforeEach(() => {
  console.warn = jest.fn();
});

afterEach(() => {
  console.warn = originalWarn;
});