import { Redirect, useLocalSearchParams } from "expo-router";

export default function Index() {
  const { mode } = useLocalSearchParams();

  // Handle upload mode at root level
  if (mode === "upload") {
    return <Redirect href="/upload" />;
  }

  // Default to tabs
  return <Redirect href="/(tabs)" />;
}
