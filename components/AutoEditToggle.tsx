import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';

interface AutoEditToggleProps {
  isEnabled: boolean;
  isProcessing?: boolean;
  onToggle: () => void;
  fillerWordsCount?: number;
  timeSaved?: number; // in milliseconds
}

/**
 * Toggle button for auto-edit mode with status indicators
 */
export default function AutoEditToggle({
  isEnabled,
  isProcessing = false,
  onToggle,
  fillerWordsCount = 0,
  timeSaved = 0
}: AutoEditToggleProps) {
  const formatTimeSaved = (ms: number): string => {
    const seconds = Math.round(ms / 1000);
    return seconds > 0 ? `${seconds}s saved` : '';
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        isEnabled ? styles.enabled : styles.disabled,
        isProcessing && styles.processing
      ]}
      onPress={onToggle}
      disabled={isProcessing}
    >
      <View style={styles.content}>
        <MaterialIcons 
          name={isProcessing ? "hourglass-empty" : (isEnabled ? "auto-fix-high" : "auto-fix-off")} 
          size={20} 
          color={isEnabled ? "#fff" : "#666"} 
        />
        <ThemedText style={[styles.text, isEnabled && styles.enabledText]}>
          {isProcessing ? 'Processing...' : 'Auto-Edit'}
        </ThemedText>
        
        {isEnabled && fillerWordsCount > 0 && (
          <View style={styles.badge}>
            <ThemedText style={styles.badgeText}>
              {fillerWordsCount}
            </ThemedText>
          </View>
        )}
      </View>
      
      {isEnabled && timeSaved > 0 && (
        <ThemedText style={styles.timeSaved}>
          {formatTimeSaved(timeSaved)}
        </ThemedText>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    minWidth: 100,
    alignItems: 'center'
  },
  enabled: {
    backgroundColor: 'rgba(76, 175, 80, 0.9)',
    borderColor: 'rgba(76, 175, 80, 1)'
  },
  disabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.2)'
  },
  processing: {
    backgroundColor: 'rgba(255, 152, 0, 0.9)',
    borderColor: 'rgba(255, 152, 0, 1)'
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ccc'
  },
  enabledText: {
    color: '#fff'
  },
  badge: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff'
  },
  timeSaved: {
    fontSize: 10,
    color: '#fff',
    opacity: 0.8,
    marginTop: 2
  }
});