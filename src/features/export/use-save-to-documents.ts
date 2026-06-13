import { useState } from 'react';
import { Alert } from 'react-native';
import { saveToDocuments } from 'react-native-video-trim';

export type SaveStatus = 'idle' | 'saving' | 'saved';

/**
 * Saves an exported video to a user-chosen location via the system document picker
 * (RNVT `saveToDocuments`). No photo-library permission needed. A cancelled picker resolves
 * unsuccessfully and quietly returns to idle.
 */
export function useSaveToDocuments() {
  const [status, setStatus] = useState<SaveStatus>('idle');

  async function save(fileUri: string) {
    if (status !== 'idle') return;
    setStatus('saving');
    try {
      const res = await saveToDocuments(fileUri);
      if (res.success) {
        setStatus('saved');
        Alert.alert('Saved to Files', 'Your video is in the Files app.');
      } else {
        setStatus('idle');
      }
    } catch (e) {
      setStatus('idle');
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Could not save the video.');
    }
  }

  return { status, save };
}
