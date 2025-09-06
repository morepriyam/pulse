/* eslint-env jest */

// Mock React Native for Jest testing
const mockRNVideoConcat = {
  concatenate: jest.fn(),
};

module.exports = {
  Platform: {
    OS: 'ios',
    select: jest.fn((platforms) => platforms.ios || platforms.default),
  },
  NativeModules: {
    RNVideoConcat: mockRNVideoConcat,
  },
};