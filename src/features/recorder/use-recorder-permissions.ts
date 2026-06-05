import { useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';

export function useRecorderPermissions() {
  const [cam, requestCam] = useCameraPermissions();
  const [mic, requestMic] = useMicrophonePermissions();
  const askedOnce = useRef(false);

  const ready = !!cam && !!mic;
  const granted = !!cam?.granted && !!mic?.granted;
  const blocked = !cam?.canAskAgain || !mic?.canAskAgain;

  // Ask for camera + mic the moment the recorder opens, once.
  useEffect(() => {
    if (askedOnce.current || !cam || !mic || granted) return;
    askedOnce.current = true;
    void (async () => {
      if (!cam.granted && cam.canAskAgain) await requestCam();
      if (!mic.granted && mic.canAskAgain) await requestMic();
    })();
  }, [cam, mic, granted, requestCam, requestMic]);

  function request() {
    if (blocked) {
      void Linking.openSettings();
    } else {
      void requestCam();
      void requestMic();
    }
  }

  return { ready, granted, blocked, request };
}
