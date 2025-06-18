import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useEffect } from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors } from "@/constants/Colors";

export default function OnboardingScreen() {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(withTiming(1.1, { duration: 1000 }), -1, true);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const renderLogo = () => (
    <Animated.View style={animatedStyle}>
      <Image
        source={require("@/assets/images/pulse-logo.png")}
        style={styles.pulseLogo}
        contentFit="contain"
      />
    </Animated.View>
  );

  async function handleGetStarted() {
    await AsyncStorage.setItem("onboardingComplete", "true");
    router.replace("/(tabs)");
  }

  return (
    <ThemedView style={styles.view}>
      {renderLogo()}
      <ThemedView style={styles.contentContainer}>
        <ThemedView style={styles.welcomeContainer}>
          <ThemedText type="title" style={styles.welcomeText}>
            Welcome to Pulse
          </ThemedText>
          <ThemedText style={styles.welcomeSubtext}>
            Create and share short videos with ease
          </ThemedText>
        </ThemedView>
        <ThemedView style={styles.stepContainer}>
          <ThemedText type="subtitle">Smart Recording</ThemedText>
          <ThemedText>
            Hold to record 60s - 3min shorts with segmented recording and camera
            controls.
          </ThemedText>
        </ThemedView>
        <ThemedView style={styles.stepContainer}>
          <ThemedText type="subtitle">Professional Tools</ThemedText>
          <ThemedText>
            Access camera controls, focus, and effects to create polished
            content.
          </ThemedText>
        </ThemedView>
        <ThemedView style={styles.stepContainer}>
          <ThemedText type="subtitle">Seamless Sharing</ThemedText>
          <ThemedText>
            Share your videos securely with adaptive playback for all devices.
          </ThemedText>
        </ThemedView>
      </ThemedView>
      <ThemedView style={styles.bottomContainer}>
        <ThemedView style={styles.poweredByContainer}>
          <ThemedText style={styles.poweredByText}>Powered by</ThemedText>
          <ThemedText style={[styles.mieText, { color: Colors.light.success }]}>
            MIE
          </ThemedText>
        </ThemedView>
        <TouchableOpacity
          style={[
            styles.getStartedButton,
            { backgroundColor: Colors.light.appPrimary },
          ]}
          onPress={handleGetStarted}
        >
          <ThemedText
            style={[styles.buttonText, { color: Colors.light.background }]}
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
    alignSelf: "center",
    marginTop: "15%",
    marginBottom: "5%",
  },
  contentContainer: {
    flex: 1,
    paddingBottom: 20,
    marginTop: 20,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
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
    marginTop: 8,
    marginBottom: 20,
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
  welcomeContainer: {
    alignItems: "center",
    marginBottom: 24,
    paddingHorizontal: 24,
  },
  welcomeText: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 8,
  },
  welcomeSubtext: {
    fontSize: 18,
    opacity: 0.8,
  },
  poweredByContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  poweredByText: {
    fontSize: 14,
    opacity: 0.7,
  },
  mieText: {
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 4,
  },
  bottomContainer: {
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
});
