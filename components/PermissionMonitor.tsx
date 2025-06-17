import { useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { usePermissions } from "expo-media-library";
import React, { useEffect, useState } from "react";
import {
  Alert,
  AppState,
  AppStateStatus,
  Linking,
  StyleSheet,
  TouchableOpacity,
} from "react-native";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors } from "@/constants/Colors";

export function PermissionMonitor() {
  const [showMonitor, setShowMonitor] = useState(false);
  const [cameraPermissions, requestCameraPermissions] = useCameraPermissions();
  const [microphonePermissions, requestMicrophonePermissions] =
    useMicrophonePermissions();
  const [mediaLibraryPermissions, requestMediaLibraryPermissions] =
    usePermissions();

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );
    checkPermissions();
    return () => subscription.remove();
  }, []);

  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    if (nextAppState === "active") {
      await checkPermissions();
    }
  };

  async function checkPermissions() {
    const [cameraStatus, microphoneStatus, mediaLibraryStatus] =
      await Promise.all([
        requestCameraPermissions(),
        requestMicrophonePermissions(),
        requestMediaLibraryPermissions(),
      ]);

    const hasAllPermissions =
      cameraStatus.granted &&
      microphoneStatus.granted &&
      mediaLibraryStatus.granted;

    setShowMonitor(!hasAllPermissions);
  }

  async function handleUpdatePermissions() {
    const [cameraStatus, microphoneStatus, mediaLibraryStatus] =
      await Promise.all([
        requestCameraPermissions(),
        requestMicrophonePermissions(),
        requestMediaLibraryPermissions(),
      ]);

    const allGranted =
      cameraStatus.granted &&
      microphoneStatus.granted &&
      mediaLibraryStatus.granted;

    if (allGranted) {
      setShowMonitor(false);
    } else {
      Alert.alert(
        "Permissions Required",
        "Please enable all required permissions in your device settings to continue using the app.",
        [
          {
            text: "Open Settings",
            onPress: () => {
              Linking.openSettings();
            },
          },
          {
            text: "Cancel",
            style: "cancel",
          },
        ]
      );
    }
  }

  if (!showMonitor) return null;

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.content}>
        <ThemedView style={styles.header}>
          <ThemedText type="title" style={styles.title}>
            Permissions Required
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            Some permissions have been revoked. Please grant all required
            permissions to continue using the app.
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.permissionContainer}>
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

        <ThemedView style={styles.permissionContainer}>
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

        <ThemedView style={styles.permissionContainer}>
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

        <TouchableOpacity
          style={[styles.button, { backgroundColor: Colors.light.appPrimary }]}
          onPress={handleUpdatePermissions}
        >
          <ThemedText
            style={[styles.buttonText, { color: Colors.light.background }]}
            type="defaultSemiBold"
          >
            Update Permissions
          </ThemedText>
        </TouchableOpacity>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  content: {
    backgroundColor: Colors.light.background,
    borderRadius: 16,
    padding: 24,
    margin: 24,
    maxWidth: 500,
    width: "100%",
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    marginBottom: 8,
  },
  subtitle: {
    opacity: 0.8,
  },
  permissionContainer: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
  },
  permissionStatus: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: "600",
  },
  button: {
    marginTop: 24,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 18,
    fontWeight: "600",
  },
});
