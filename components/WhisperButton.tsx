import React, { useState } from 'react';
import { TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { ThemedText } from './ThemedText';
import { MaterialIcons } from '@expo/vector-icons';

interface WhisperButtonProps {
  /** Callback when transcription is requested */
  onTranscribe: () => Promise<void>;
  /** Whether transcription is currently in progress */
  isTranscribing?: boolean;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Custom style for the button */
  style?: any;
}

/**
 * Button component for initiating Whisper.cpp transcription
 */
export default function WhisperButton({
  onTranscribe,
  isTranscribing = false,
  disabled = false,
  style,
}: WhisperButtonProps) {
  const [localProcessing, setLocalProcessing] = useState(false);

  const handlePress = async () => {
    if (disabled || isTranscribing || localProcessing) return;

    try {
      setLocalProcessing(true);
      await onTranscribe();
    } catch (error) {
      console.error('Transcription failed:', error);
    } finally {
      setLocalProcessing(false);
    }
  };

  const isProcessing = isTranscribing || localProcessing;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        disabled && styles.disabled,
        isProcessing && styles.processing,
        style,
      ]}
      onPress={handlePress}
      disabled={disabled || isProcessing}
    >
      {isProcessing ? (
        <ActivityIndicator size="small" color="#ffffff" />
      ) : (
        <MaterialIcons name="transcribe" size={20} color="#ffffff" />
      )}
      <ThemedText style={styles.buttonText}>
        {isProcessing ? 'Transcribing...' : 'Transcribe'}
      </ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 100,
    gap: 6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  disabled: {
    backgroundColor: '#CCCCCC',
    opacity: 0.6,
  },
  processing: {
    backgroundColor: '#1976D2',
  },
});