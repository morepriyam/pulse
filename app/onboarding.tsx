import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, TouchableOpacity } from "react-native";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors } from "@/constants/Colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { Image } from "expo-image";
import { usePermissions } from "expo-media-library";
import { router } from "expo-router";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const OnboardingStep = {
  FEATURES: 1,
  PERMISSIONS: 2,
} as const;

export default function OnboardingScreen() {
  const [currentStep, setCurrentStep] = useState<
    (typeof OnboardingStep)[keyof typeof OnboardingStep]
  >(OnboardingStep.FEATURES);
  const scale = useSharedValue(1);
  const [cameraPermissions, requestCameraPermissions] = useCameraPermissions();
  const [microphonePermissions, requestMicrophonePermissions] =
    useMicrophonePermissions();
  const [mediaLibraryPermissions, requestMediaLibraryPermissions] =
    usePermissions();

  async function handleContinue() {
    const allPermissionsGranted = await requestAllPermissions();
    if (allPermissionsGranted) {
      router.replace("/(tabs)");
    } else {
      Alert.alert("All permissions are required");
    }
  }

  async function requestAllPermissions() {
    const cameraStatus = await requestCameraPermissions();
    if (!cameraStatus.granted) {
      Alert.alert("Error", "Camera Permission Denied");
      return false;
    }
    const microphoneStatus = await requestMicrophonePermissions();
    if (!microphoneStatus.granted) {
      Alert.alert("Error", "Microphone Permission Denied");
      return false;
    }
    const mediaLibraryStatus = await requestMediaLibraryPermissions();
    if (!mediaLibraryStatus.granted) {
      Alert.alert("Error", "Media Library Permission Denied");
      return false;
    }
    await AsyncStorage.setItem("onboardingComplete", "true");
    return true;
  }
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

  const renderFeaturesStep = () => (
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
          Access camera controls, focus, and effects to create polished content.
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Seamless Sharing</ThemedText>
        <ThemedText>
          Share your videos securely with adaptive playback for all devices.
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.poweredByContainer}>
        <ThemedText style={styles.poweredByText}>Powered by</ThemedText>
        <ThemedText style={[styles.mieText, { color: Colors.light.success }]}>
          MIE
        </ThemedText>
      </ThemedView>
      <TouchableOpacity
        style={[
          styles.nextButton,
          { backgroundColor: Colors.light.appPrimary },
        ]}
        onPress={() => setCurrentStep(OnboardingStep.PERMISSIONS)}
      >
        <Ionicons
          name="arrow-forward"
          size={24}
          color={Colors.light.background}
        />
      </TouchableOpacity>
    </ThemedView>
  );

  const renderPermissionsStep = () => (
    <ThemedView style={styles.contentContainer}>
      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Camera Access</ThemedText>
        <ThemedText>Required for recording videos</ThemedText>
        <ThemedText
          style={[
            styles.permissionStatus,
            {
              color: cameraPermissions?.granted
                ? Colors.light.success
                : Colors.light.error,
            },
          ]}
        >
          {cameraPermissions?.granted ? "✓ Granted" : "× Not Granted"}
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Microphone Access</ThemedText>
        <ThemedText>Required for recording audio</ThemedText>
        <ThemedText
          style={[
            styles.permissionStatus,
            {
              color: microphonePermissions?.granted
                ? Colors.light.success
                : Colors.light.error,
            },
          ]}
        >
          {microphonePermissions?.granted ? "✓ Granted" : "× Not Granted"}
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Media Library Access</ThemedText>
        <ThemedText>Required for saving videos</ThemedText>
        <ThemedText
          style={[
            styles.permissionStatus,
            {
              color: mediaLibraryPermissions?.granted
                ? Colors.light.success
                : Colors.light.error,
            },
          ]}
        >
          {mediaLibraryPermissions?.granted ? "✓ Granted" : "× Not Granted"}
        </ThemedText>
      </ThemedView>
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
        onPress={handleContinue}
      >
        <ThemedText
          style={[styles.buttonText, { color: Colors.light.background }]}
          type="defaultSemiBold"
        >
          Get Started
        </ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );

  return (
    <ThemedView style={styles.view}>
      {renderLogo()}
      {currentStep === OnboardingStep.FEATURES
        ? renderFeaturesStep()
        : renderPermissionsStep()}
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
    justifyContent: "space-between",
    paddingBottom: 20,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 24,
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 16,
  },
  nextButton: {
    marginHorizontal: 24,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignSelf: "stretch",
    marginTop: "auto",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  getStartedButton: {
    marginHorizontal: 24,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignSelf: "stretch",
    marginTop: "auto",
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
  permissionStatus: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: "600",
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
    marginTop: "auto",
    marginBottom: 16,
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
});
