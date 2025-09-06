import { useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { usePermissions } from "expo-media-library";
import React, { useCallback, useEffect, useState } from "react";
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
import { useColorScheme } from "@/hooks/useColorScheme";

export function PermissionMonitor() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  const [showMonitor, setShowMonitor] = useState(false);
  const [cameraPermissions, requestCameraPermissions] = useCameraPermissions();
  const [microphonePermissions, requestMicrophonePermissions] =
    useMicrophonePermissions();
  const [mediaLibraryPermissions, requestMediaLibraryPermissions] =
    usePermissions();

  const checkPermissions = useCallback(async () => {
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
  }, [requestCameraPermissions, requestMicrophonePermissions, requestMediaLibraryPermissions]);

  const handleAppStateChange = useCallback(async (nextAppState: AppStateStatus) => {
    if (nextAppState === "active") {
      await checkPermissions();
    }
  }, [checkPermissions]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );
    checkPermissions();
    return () => subscription.remove();
  }, [checkPermissions, handleAppStateChange]);

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
    <ThemedView
      style={[styles.container, { backgroundColor: "rgba(0, 0, 0, 0.5)" }]}
    >
      <ThemedView
        style={[
          styles.content,
          {
            backgroundColor: colors.background,
            shadowColor: "#FFFFFF",
            shadowOffset: {
              width: 1,
              height: 1,
            },
            shadowOpacity: 0.3,
            shadowRadius: 10,
            elevation: 8,
          },
        ]}
      >
        <ThemedView style={styles.header}>
          <ThemedText type="title" style={styles.title}>
            Permissions Required
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            Some permissions have been revoked. Please grant all required
            permissions to continue using the app.
          </ThemedText>
        </ThemedView>

        <ThemedView
          style={[
            styles.permissionContainer,
            {
              backgroundColor:
                colorScheme === "dark"
                  ? "rgba(255, 255, 255, 0.1)"
                  : "rgba(0, 0, 0, 0.05)",
            },
          ]}
        >
          <ThemedText type="subtitle">Camera Access</ThemedText>
          <ThemedText>Required for recording videos</ThemedText>
          <ThemedText
            style={[
              styles.permissionStatus,
              {
                color: cameraPermissions?.granted
                  ? colors.success
                  : colors.error,
              },
            ]}
          >
            {cameraPermissions?.granted ? "✓ Granted" : "× Not Granted"}
          </ThemedText>
        </ThemedView>

        <ThemedView
          style={[
            styles.permissionContainer,
            {
              backgroundColor:
                colorScheme === "dark"
                  ? "rgba(255, 255, 255, 0.1)"
                  : "rgba(0, 0, 0, 0.05)",
            },
          ]}
        >
          <ThemedText type="subtitle">Microphone Access</ThemedText>
          <ThemedText>Required for recording audio</ThemedText>
          <ThemedText
            style={[
              styles.permissionStatus,
              {
                color: microphonePermissions?.granted
                  ? colors.success
                  : colors.error,
              },
            ]}
          >
            {microphonePermissions?.granted ? "✓ Granted" : "× Not Granted"}
          </ThemedText>
        </ThemedView>

        <ThemedView
          style={[
            styles.permissionContainer,
            {
              backgroundColor:
                colorScheme === "dark"
                  ? "rgba(255, 255, 255, 0.1)"
                  : "rgba(0, 0, 0, 0.05)",
            },
          ]}
        >
          <ThemedText type="subtitle">Media Library Access</ThemedText>
          <ThemedText>Required for saving videos</ThemedText>
          <ThemedText
            style={[
              styles.permissionStatus,
              {
                color: mediaLibraryPermissions?.granted
                  ? colors.success
                  : colors.error,
              },
            ]}
          >
            {mediaLibraryPermissions?.granted ? "✓ Granted" : "× Not Granted"}
          </ThemedText>
        </ThemedView>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.appPrimary }]}
          onPress={handleUpdatePermissions}
        >
          <ThemedText
            style={[styles.buttonText, { color: "#FFFFFF" }]}
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
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  content: {
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 20,
    maxWidth: 500,
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
