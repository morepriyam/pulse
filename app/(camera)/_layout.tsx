import { ThemedText } from "@/components/ThemedText";
import * as Haptics from "expo-haptics";
import { Slot, router, usePathname } from "expo-router";
import { useEffect } from "react";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const tabs = ["video", "shorts", "photo", "post"];

export default function CameraLayout() {
  const insets =
    typeof useSafeAreaInsets === "function"
      ? useSafeAreaInsets()
      : { bottom: 0 };
  const pathname = usePathname();
  const active = pathname.split("/").pop();

  // Redirect /camera to /camera/shorts
  useEffect(() => {
    if (pathname === "/camera" || pathname === "/(camera)") {
      router.replace("/(camera)/shorts");
    }
  }, [pathname]);

  return (
    <View style={{ flex: 1, backgroundColor: "#111" }}>
      {/* Actual screen content */}
      <Slot />

      {/* Bottom Navigation */}
      <View style={[styles.nav, { paddingBottom: insets.bottom || 0 }]}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => {
              if (Platform.OS === "ios") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              router.replace(`/(camera)/${tab}` as any);
            }}
            style={[styles.button, active === tab && styles.activeButton]}
          >
            <ThemedText
              type="defaultSemiBold"
              lightColor={active === tab ? "#ffffff" : "#8E8E93"}
              darkColor={active === tab ? "#ffffff" : "#8E8E93"}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 8,
    backgroundColor: "#000",
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  button: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  activeButton: {
    backgroundColor: "#333",
  },
});
