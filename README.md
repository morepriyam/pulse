<div align="center">

# Pulse

##### Secure institutional knowledge sharing through short-form video content.

[![React Native](https://img.shields.io/badge/React%20Native-0.79.4-blue.svg?style=for-the-badge&logo=react)](https://reactnative.dev)
[![Expo](https://img.shields.io/badge/Expo-53.0.12-white.svg?style=for-the-badge&logo=expo&logoColor=black)](https://expo.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue.svg?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-Video%20Processing-green.svg?style=for-the-badge&logo=ffmpeg)](https://ffmpeg.org)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Stream-orange.svg?style=for-the-badge&logo=cloudflare)](https://www.cloudflare.com/products/stream/)

<img alt="Pulse Logo" height="280" src="./assets/images/pulse-logo.png" />
</div>

## ⇁ TOC

- [The Problems](#-The-Problems)
- [The Solutions](#-The-Solutions)
- [Features](#-Features)
- [Installation](#-Installation)
- [Getting Started](#-Getting-Started)

- [Configuration](#-Configuration)
- [Development](#-Development)
- [Contributing](#-Contributing)

## ⇁ The Problems

1. **Cross-Platform Camera Compatibility**: Building camera functionality that works consistently across iOS and Android presents significant challenges. Previous attempts with Meteor and Cordova revealed iOS compatibility issues with camera preview plugins, forcing platform-specific workarounds and limiting functionality.

2. **Complex Institutional Knowledge Sharing**: MIE requires a secure, internal platform for sharing institutional knowledge through short-form videos, similar to YouTube Shorts but tailored for sensitive institutional content and charter documentation.

3. **Fragmented Development Approaches**: Multiple technology stacks (Meteor, Tauri, React Native) were explored, each with trade-offs. Meteor faced cross-platform camera limitations, while Tauri required complex native integrations for optimal camera performance.

4. **Segmented Recording Complexity**: Implementing hold-to-record functionality with seamless segment management, real-time progress tracking, and automatic time limit enforcement proved technically challenging across different platforms and frameworks.

5. **Permission Management**: Camera, microphone, and media library permissions needed granular handling with smooth onboarding experiences, especially critical for iOS where permission denial could break core functionality.

## ⇁ The Solutions

1. **React Native Excellence**: After extensive evaluation of Meteor, Tauri, and React Native approaches, React Native with Expo proved optimal for cross-platform camera functionality, providing native performance with consistent APIs across iOS and Android.

2. **Segmented Recording Architecture**: Built a sophisticated state management system that tracks recording segments in arrays, calculates remaining time dynamically, and provides real-time visual feedback through progress bars and time selectors.

3. **Dual Recording Modes**: Implemented both tap-to-record and hold-to-record modes with smooth animations, preventing duplicate recordings and ensuring consistent user experience across different interaction patterns.

4. **Smart Progress Management**: Created intelligent time tracking that passes remaining duration to recording methods, automatically stops when limits are reached, and provides visual segment indicators for intuitive content creation.

5. **Comprehensive Permission Flow**: Developed robust permission management with clear onboarding screens, graceful error handling, and user-friendly guidance for camera, microphone, and storage access across platforms.

## ⇁ Features

- 🎥 **Segmented Recording** - Record multiple clips that combine seamlessly
- ⏱️ **Time Selection** - Choose from 15s, 30s, 1m, or 3m recording durations
- 📊 **Progress Visualization** - Real-time progress bar with segment indicators
- 📱 **Dual Recording Modes** - Both tap and hold recording with smooth transitions
- 🎯 **Auto-Stop** - Automatic recording termination when time limit is reached
- 🎨 **Modern UI** - Clean, intuitive interface with smooth animations
- 📱 **Cross-Platform** - Works on both iOS and Android devices

## ⇁ Installation

### Prerequisites

- Node.js 18+
- Expo CLI
- iOS Simulator (for iOS development) or Android Studio (for Android development)

### Clone and Install

```bash
git clone https://github.com/yourusername/pulse.git
cd pulse
npm install
```

### Development Setup

```bash
# Start the development server
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android

# Run on web
npm run web
```

## ⇁ Getting Started

### Permissions

The app requires the following permissions:

- **Camera Access**: To record videos
- **Microphone Access**: To record audio
- **Storage Access**: To save recorded videos

## ⇁ Configuration

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

## ⇁ Development

### Project Structure

```
pulse/
├── app/                    # App router screens
│   ├── (camera)/          # Camera functionality
│   ├── (tabs)/            # Main navigation
│   └── onboarding.tsx     # First-time setup
├── components/            # Reusable UI components
│   ├── RecordButton.tsx   # Recording functionality
│   ├── RecordingProgressBar.tsx
│   ├── TimeSelectorButton.tsx
│   └── ui/                # Base UI components
├── assets/                # Images and fonts
├── hooks/                 # Custom React hooks
├── constants/             # App configuration
├── android/               # Android build
├── ios/                   # iOS build
└── package.json           # Dependencies
```

### Running Tests

```bash
# Run linting
npm run lint

# Type checking
npx tsc --noEmit
```

### Building for Production

```bash
# Create production build
expo build:android
expo build:ios
```

## ⇁ Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** and ensure they follow our coding standards
4. **Test thoroughly** on both iOS and Android
5. **Commit your changes**: `git commit -m 'feat: add amazing feature'`
6. **Push to your branch**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Development Guidelines

- Use TypeScript for all new code
- Follow the existing component structure and naming conventions
- Ensure your code works on both iOS and Android
- Add appropriate error handling and loading states
- Test recording functionality thoroughly before submitting

### Code Style

- Use meaningful component and function names
- Keep components focused and single-purpose
- Add proper TypeScript interfaces for all props
- Follow React Native and Expo best practices

---

<div align="center">
Made with ❤️ for content creators everywhere
</div>
