# Pulse

> Secure institutional knowledge sharing through short-form video content

[![React Native](https://img.shields.io/badge/React%20Native-0.79.4-blue.svg?style=for-the-badge&logo=react)](https://reactnative.dev)
[![Expo](https://img.shields.io/badge/Expo-53.0.12-white.svg?style=for-the-badge&logo=expo&logoColor=black)](https://expo.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue.svg?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![AVFoundation](https://img.shields.io/badge/AVFoundation-Hardware%20Accelerated-green.svg?style=for-the-badge&logo=apple)](https://developer.apple.com/av-foundation/)
[![Media3](https://img.shields.io/badge/Media3-Android%20Video-orange.svg?style=for-the-badge&logo=android)](https://developer.android.com/guide/topics/media/media3)

<img alt="Pulse Logo" height="200" src="./assets/images/pulse-logo.png" />

A React Native app for creating and sharing short-form video content with segmented recording, native video processing, and secure institutional knowledge sharing capabilities.

## Features

- **Segmented Recording** - Record multiple clips that combine seamlessly
- **Time Selection** - Choose from 15s, 30s, 1m, or 3m recording durations
- **Native Video Processing** - Hardware-accelerated video concatenation with AVFoundation
- **Deep Linking** - Custom `pulsecam://` URL scheme for direct app access
- **Cross-Platform** - React Native with Expo for iOS and Android
- **Real-Time Progress** - Live progress tracking and auto-save functionality

## Installation

```bash
git clone https://github.com/yourusername/pulse.git
cd pulse
npm install
```

## Setup

### Prerequisites

- Node.js 18+
- Expo CLI
- Xcode (for iOS development)
- Android Studio (for Android development)

### Development Setup

```bash
# Install dependencies
npm install

# Start Expo development server
npx expo start

# For iOS development
npx expo prebuild
cd ios
pod install
open pulse.xcworkspace
# Build and run in Xcode

# For Android development
npx expo run:android
```

**Required Permissions:**

- Camera Access
- Microphone Access
- Storage Access

## Configuration

### Recording Settings

```typescript
const defaultSettings = {
  maxIndividualDuration: 60, // Maximum duration for a single recording segment
  holdDelay: 500, // Delay before hold recording starts (ms)
  progressUpdateInterval: 100, // Progress update frequency (ms)
};
```

### Time Options

```typescript
const timeOptions = [
  { label: "15s", value: 15 },
  { label: "30s", value: 30 },
  { label: "1m", value: 60 },
  { label: "3m", value: 180 },
];
```

### Video Concatenation

```typescript
interface RecordingSegment {
  id: string;
  duration: number;
  uri: string;
  inMs?: number; // Optional start trim point
  outMs?: number; // Optional end trim point
}

// Usage
const outputUri = await VideoConcatModule.export(segments);
```

## Development

### Project Structure

```
pulse/
├── app/                    # App router screens
├── components/            # Reusable UI components
├── modules/               # Native modules
│   └── video-concat/      # Video concatenation module
├── hooks/                 # Custom React hooks
├── constants/             # App configuration
└── package.json           # Dependencies
```

### Building

```bash
# Run linting
npm run lint

# Type checking
npx tsc --noEmit

# Build for production
eas build --platform ios --profile production
eas build --platform android --profile production
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and test on both iOS and Android
4. Commit your changes: `git commit -m 'feat: add amazing feature'`
5. Push to your branch: `git push origin feature/amazing-feature`
6. Open a Pull Request

## Acknowledgments

Special thanks to [**Medical Informatics Engineering, Inc.**](https://github.com/mieweb) and [**Doug Horner**](https://github.com/horner) for supporting this project. Doug's passion for short-form content and knowledge sharing directly inspired the development of secure institutional video capabilities that make complex information accessible and engaging.

**Core Developer:** [Priyam](https://github.com/morepriyam)

## License

[MIT](LICENSE)

---

<div align="center">
Made with ❤️ for content creators everywhere
</div>
