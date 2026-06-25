import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { useCameraPermission, useMicrophonePermission } from 'react-native-vision-camera';

export function useRecorderPermissions() {
  const cam = useCameraPermission();
  const mic = useMicrophonePermission();
  const askedOnce = useRef(false);

  // VisionCamera reads permission status synchronously, so the gate is always "ready".
  const ready = true;
  const granted = cam.hasPermission && mic.hasPermission;
  // Blocked = previously denied (or restricted) and can no longer be asked in-app — the user
  // must grant it from system Settings. `canRequestPermission` is true only while undetermined.
  const blocked =
    (!cam.hasPermission && !cam.canRequestPermission) ||
    (!mic.hasPermission && !mic.canRequestPermission);

  // Ask for camera + mic the moment the recorder opens, once.
  useEffect(() => {
    if (askedOnce.current || granted) return;
    askedOnce.current = true;
    void (async () => {
      if (cam.canRequestPermission) await cam.requestPermission();
      if (mic.canRequestPermission) await mic.requestPermission();
    })();
  }, [cam, mic, granted]);

  function request() {
    if (blocked) {
      void Linking.openSettings();
    } else {
      void cam.requestPermission();
      void mic.requestPermission();
    }
  }

  return { ready, granted, blocked, request };
}
