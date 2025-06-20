/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = "#0a7ea4";
const tintColorDark = "#fff";

export const Colors = {
  light: {
    text: "#11181C",
    background: "#fff",
    tint: tintColorLight,
    icon: "#687076",
    tabIconDefault: "#687076",
    tabIconSelected: tintColorLight,
    tabBarButtonColor: "#0C0C0C",
    tabBarButtonColorBg: "#EDEDED",
    appPrimary: "#F01E21",
    success: "#4CAF50",
    error: "#F44336",
  },
  dark: {
    text: "#ECEDEE",
    background: "#000",
    tint: tintColorDark,
    icon: "#9BA1A6",
    tabBarButtonColor: "#FFFFFF",
    tabBarButtonColorBg: "#2E2E2E",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: tintColorDark,
    appPrimary: "#F01E21",
    success: "#4CAF50",
    error: "#F44336",
  },
};
