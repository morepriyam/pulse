import { StyleSheet, TouchableOpacity } from "react-native";

import { HelloWave } from "@/components/HelloWave";
import ParallaxScrollView from "@/components/ParallaxScrollView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

export default function OnboardingScreen() {
  const scale = useSharedValue(1);
  const tintColor = useThemeColor({}, "appPrimary");
  const backgroundColor = useThemeColor({}, "background");

  useEffect(() => {
    scale.value = withRepeat(withTiming(1.1, { duration: 1000 }), -1, true);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: "#FFFFFF", dark: "#0F0F0F" }}
      headerImage={
        <Animated.Image
          source={require("@/assets/images/pulse-logo.png")}
          style={[styles.pulseLogo, animatedStyle]}
        />
      }
    >
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">Welcome to Pulse!</ThemedText>
        <HelloWave />
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Create Short Videos</ThemedText>
        <ThemedText>
          Hold to record 60-second shorts with flip camera and segmented
          recording.
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Watch & Share</ThemedText>
        <ThemedText>
          Scroll through shorts with adaptive playback. Like, comment, and share
          securely.
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Cloud Integration</ThemedText>
        <ThemedText>
          Videos are processed with HLS for optimal playback on all devices.
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Get Started</ThemedText>
        <ThemedText>
          Grant camera and mic permissions to start recording.
        </ThemedText>
      </ThemedView>

      <TouchableOpacity
        style={[styles.getStartedButton, { backgroundColor: tintColor }]}
        onPress={() => console.log("Get Started pressed")}
      >
        <ThemedText
          style={[styles.buttonText, { color: backgroundColor }]}
          type="defaultSemiBold"
        >
          Get Started
        </ThemedText>
      </TouchableOpacity>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepContainer: {
    gap: 3,
    marginBottom: 8,
  },
  pulseLogo: {
    height: 200,
    width: 400,
    bottom: -30,
    left: -80,
    position: "absolute",
  },
  getStartedButton: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 24,
    marginBottom: 16,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "bold",
  },
});
