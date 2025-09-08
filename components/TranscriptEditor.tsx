import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { ThemedText } from './ThemedText';
import { MaterialIcons } from '@expo/vector-icons';
import { VideoTranscript, TranscriptSegment } from '../types/transcription';

interface TranscriptEditorProps {
  /** The transcript data to edit */
  transcript: VideoTranscript;
  /** Callback when transcript is saved */
  onSave: (updatedTranscript: VideoTranscript) => void;
  /** Callback when editing is cancelled */
  onCancel: () => void;
  /** Whether to show word-level editing */
  showWordEditing?: boolean;
  /** Custom style for the container */
  style?: any;
}

/**
 * Component for editing timestamped video transcripts
 * Allows text editing while preserving timestamps
 */
export default function TranscriptEditor({
  transcript,
  onSave,
  onCancel,
  showWordEditing = false,
  style,
}: TranscriptEditorProps) {
  const [editedTranscript, setEditedTranscript] = useState<VideoTranscript>(transcript);
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const formatTime = (milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const ms = Math.floor((milliseconds % 1000) / 10);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const updateSegmentText = useCallback((segmentId: string, newText: string) => {
    setEditedTranscript(prev => ({
      ...prev,
      segments: prev.segments.map(segment =>
        segment.id === segmentId
          ? { ...segment, text: newText }
          : segment
      ),
    }));
    setHasChanges(true);
  }, []);

  const handleSave = () => {
    if (!hasChanges) {
      onCancel();
      return;
    }

    // Update transcript with new modification date
    const updatedTranscript = {
      ...editedTranscript,
      createdAt: new Date(),
      id: `${transcript.id}_edited`,
    };

    onSave(updatedTranscript);
  };

  const handleCancel = () => {
    if (hasChanges) {
      Alert.alert(
        'Discard Changes?',
        'You have unsaved changes. Are you sure you want to discard them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: onCancel },
        ]
      );
    } else {
      onCancel();
    }
  };

  const renderSegmentEditor = (segment: TranscriptSegment) => {
    const isEditing = editingSegmentId === segment.id;

    return (
      <View key={segment.id} style={styles.segmentEditor}>
        <View style={styles.segmentHeader}>
          <TouchableOpacity style={styles.timestampChip}>
            <MaterialIcons name="schedule" size={14} color="#2196F3" />
            <ThemedText style={styles.timestampText}>
              {formatTime(segment.startMs)} - {formatTime(segment.endMs)}
            </ThemedText>
          </TouchableOpacity>

          <View style={styles.segmentActions}>
            <TouchableOpacity
              style={[styles.actionButton, isEditing && styles.activeActionButton]}
              onPress={() => setEditingSegmentId(isEditing ? null : segment.id)}
            >
              <MaterialIcons
                name={isEditing ? 'check' : 'edit'}
                size={16}
                color={isEditing ? '#4CAF50' : '#666'}
              />
            </TouchableOpacity>
          </View>
        </View>

        {isEditing ? (
          <TextInput
            style={styles.textInput}
            value={segment.text}
            onChangeText={(text) => updateSegmentText(segment.id, text)}
            multiline
            placeholder="Enter transcript text..."
            autoFocus
            onBlur={() => setEditingSegmentId(null)}
          />
        ) : (
          <TouchableOpacity
            onPress={() => setEditingSegmentId(segment.id)}
            style={styles.textDisplay}
          >
            <ThemedText style={styles.segmentText}>
              {segment.text || 'Tap to add text...'}
            </ThemedText>
          </TouchableOpacity>
        )}

        {segment.confidence < 0.8 && (
          <View style={styles.confidenceWarning}>
            <MaterialIcons name="warning" size={12} color="#FFA726" />
            <ThemedText style={styles.confidenceText}>
              Low confidence ({Math.round(segment.confidence * 100)}%) - Review recommended
            </ThemedText>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, style]}>
      <View style={styles.header}>
        <View style={styles.titleSection}>
          <ThemedText style={styles.title}>Edit Transcript</ThemedText>
          <ThemedText style={styles.subtitle}>
            {editedTranscript.language.toUpperCase()} • {editedTranscript.segments.length} segments
          </ThemedText>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
            <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.saveButton, !hasChanges && styles.disabledButton]}
            onPress={handleSave}
            disabled={!hasChanges}
          >
            <MaterialIcons name="save" size={16} color="#ffffff" />
            <ThemedText style={styles.saveButtonText}>Save</ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.editorContent}>
          {editedTranscript.segments.map(renderSegmentEditor)}
        </View>

        <View style={styles.instructions}>
          <MaterialIcons name="info" size={16} color="#666" />
          <ThemedText style={styles.instructionsText}>
            Tap any segment to edit its text. Timestamps are preserved automatically.
          </ThemedText>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  titleSection: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CCCCCC',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '500',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196F3',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 6,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledButton: {
    backgroundColor: '#CCCCCC',
    opacity: 0.6,
  },
  scrollView: {
    flex: 1,
  },
  editorContent: {
    padding: 16,
    gap: 16,
  },
  segmentEditor: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  segmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  timestampChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  timestampText: {
    fontSize: 12,
    color: '#2196F3',
    fontWeight: '500',
  },
  segmentActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  activeActionButton: {
    backgroundColor: '#E8F5E8',
  },
  textInput: {
    fontSize: 16,
    lineHeight: 24,
    padding: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#2196F3',
    minHeight: 60,
  },
  textDisplay: {
    padding: 4,
  },
  segmentText: {
    fontSize: 16,
    lineHeight: 24,
  },
  confidenceWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  confidenceText: {
    fontSize: 11,
    color: '#FFA726',
  },
  instructions: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    margin: 16,
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    gap: 8,
  },
  instructionsText: {
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
});