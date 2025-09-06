import { ThemedText } from "@/components/ThemedText";
import * as Haptics from "expo-haptics";
import { Slot, router, usePathname } from "expo-router";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const tabs = ["shorts", "drafts"]; // "post"

export default function CameraLayout() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const active = pathname.split("/").pop();

  return (
    <View style={{ flex: 1, backgroundColor: "#111" }}>
      {/* Curved content container */}
      <View style={styles.curvedContainer}>
        <Slot />
      </View>

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
  curvedContainer: {
    flex: 1,
    backgroundColor: "#000",
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 15,
    overflow: "hidden",
  },
  nav: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 8,
    backgroundColor: "#000",
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
