import React from "react";
import { StyleSheet, TouchableOpacity } from "react-native";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Image } from "expo-image";
import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

export default function OnboardingScreen() {
  const scale = useSharedValue(1);
  const buttonColor = useThemeColor({}, "appPrimary");
  const backgroundColor = useThemeColor({}, "background");

  useEffect(() => {
    scale.value = withRepeat(withTiming(1.1, { duration: 1000 }), -1, true);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <ThemedView style={styles.view}>
      <Animated.View style={animatedStyle}>
        <Image
          source={require("@/assets/images/pulse-logo.png")}
          style={styles.pulseLogo}
        />
      </Animated.View>
      <ThemedView style={styles.contentContainer}>
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
            Scroll through shorts with adaptive playback. Like, comment, and
            share securely.
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
          style={[styles.getStartedButton, { backgroundColor: buttonColor }]}
          onPress={() => console.log("Get Started pressed")}
        >
          <ThemedText
            style={[styles.buttonText, { color: backgroundColor }]}
            type="defaultSemiBold"
          >
            Get Started
          </ThemedText>
        </TouchableOpacity>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  view: {
    display: "flex",
    flex: 1,
  },
  pulseLogo: {
    height: 180,
    width: 320,
    resizeMode: "contain",
    alignSelf: "center",
    marginTop: "15%",
    marginBottom: "5%",
  },
  contentContainer: {
    flex: 1,
    justifyContent: "space-between",
    paddingBottom: 20,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 24,
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 16,
  },
  getStartedButton: {
    marginHorizontal: 24,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignSelf: "stretch",
    marginTop: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
});
