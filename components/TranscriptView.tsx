import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  SafeAreaView,
} from 'react-native';
import { ThemedText } from './ThemedText';
import { MaterialIcons } from '@expo/vector-icons';
import { VideoTranscript, TranscriptSegment, TranscriptWord } from '../types/transcription';

interface TranscriptViewProps {
  /** The transcript data to display */
  transcript: VideoTranscript | null;
  /** Whether to show word-level timestamps */
  showWordTimestamps?: boolean;
  /** Callback when user taps on a timestamp */
  onTimestampTap?: (timestampMs: number) => void;
  /** Whether the view is in editing mode */
  editMode?: boolean;
  /** Callback when transcript text is edited */
  onTextEdit?: (segmentId: string, newText: string) => void;
  /** Custom style for the container */
  style?: any;
}

/**
 * Component for displaying timestamped video transcripts
 * Supports both segment and word-level timestamps
 */
export default function TranscriptView({
  transcript,
  showWordTimestamps = false,
  onTimestampTap,
  editMode = false,
  onTextEdit,
  style,
}: TranscriptViewProps) {
  const [expandedModal, setExpandedModal] = useState(false);

  const formatTime = (milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const ms = Math.floor((milliseconds % 1000) / 10);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const renderWord = (word: TranscriptWord, segmentId: string) => (
    <TouchableOpacity
      key={`${segmentId}-${word.startMs}`}
      style={[
        styles.word,
        word.confidence < 0.7 && styles.lowConfidence,
      ]}
      onPress={() => onTimestampTap?.(word.startMs)}
    >
      <ThemedText style={styles.wordText}>{word.text}</ThemedText>
      {showWordTimestamps && (
        <ThemedText style={styles.wordTimestamp}>
          {formatTime(word.startMs)}
        </ThemedText>
      )}
    </TouchableOpacity>
  );

  const renderSegment = (segment: TranscriptSegment) => (
    <View key={segment.id} style={styles.segment}>
      <TouchableOpacity
        style={styles.timestampButton}
        onPress={() => onTimestampTap?.(segment.startMs)}
      >
        <MaterialIcons name="play-arrow" size={16} color="#2196F3" />
        <ThemedText style={styles.timestamp}>
          {formatTime(segment.startMs)} - {formatTime(segment.endMs)}
        </ThemedText>
      </TouchableOpacity>

      {showWordTimestamps ? (
        <View style={styles.wordsContainer}>
          {segment.words.map((word) => renderWord(word, segment.id))}
        </View>
      ) : (
        <ThemedText style={styles.segmentText}>
          {segment.text}
        </ThemedText>
      )}

      {segment.confidence < 0.8 && (
        <View style={styles.confidenceWarning}>
          <MaterialIcons name="warning" size={12} color="#FFA726" />
          <ThemedText style={styles.confidenceText}>
            Low confidence ({Math.round(segment.confidence * 100)}%)
          </ThemedText>
        </View>
      )}
    </View>
  );

  if (!transcript) {
    return (
      <View style={[styles.container, styles.emptyState, style]}>
        <MaterialIcons name="transcribe" size={48} color="#CCCCCC" />
        <ThemedText style={styles.emptyText}>
          No transcript available
        </ThemedText>
        <ThemedText style={styles.emptySubtext}>
          Use the Transcribe button to generate a transcript
        </ThemedText>
      </View>
    );
  }

  if (transcript.status === 'processing') {
    return (
      <View style={[styles.container, styles.emptyState, style]}>
        <MaterialIcons name="auto-fix-high" size={48} color="#2196F3" />
        <ThemedText style={styles.emptyText}>
          Transcribing...
        </ThemedText>
        <ThemedText style={styles.emptySubtext}>
          Please wait while we process your audio
        </ThemedText>
      </View>
    );
  }

  if (transcript.status === 'error') {
    return (
      <View style={[styles.container, styles.emptyState, style]}>
        <MaterialIcons name="error" size={48} color="#F44336" />
        <ThemedText style={styles.emptyText}>
          Transcription failed
        </ThemedText>
        <ThemedText style={styles.emptySubtext}>
          {transcript.error || 'Unknown error occurred'}
        </ThemedText>
      </View>
    );
  }

  const mainContent = (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <ThemedText style={styles.title}>Transcript</ThemedText>
        <View style={styles.headerInfo}>
          <ThemedText style={styles.info}>
            {transcript.language.toUpperCase()} • {formatTime(transcript.durationMs)}
          </ThemedText>
          <TouchableOpacity onPress={() => setExpandedModal(true)}>
            <MaterialIcons name="fullscreen" size={20} color="#666" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlButton}>
          <MaterialIcons 
            name={showWordTimestamps ? "text-fields" : "format-align-left"} 
            size={16} 
            color="#2196F3" 
          />
          <ThemedText style={styles.controlText}>
            {showWordTimestamps ? 'Word View' : 'Segment View'}
          </ThemedText>
        </TouchableOpacity>
      </View>

      {transcript.segments.map(renderSegment)}
    </ScrollView>
  );

  return (
    <>
      <View style={[styles.container, style]}>
        {mainContent}
      </View>

      <Modal
        visible={expandedModal}
        animationType="slide"
        presentationStyle="formSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>Full Transcript</ThemedText>
            <TouchableOpacity 
              onPress={() => setExpandedModal(false)}
              style={styles.closeButton}
            >
              <MaterialIcons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          {mainContent}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  info: {
    fontSize: 12,
    color: '#666',
  },
  controls: {
    flexDirection: 'row',
    paddingVertical: 12,
    gap: 12,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#E3F2FD',
    borderRadius: 16,
    gap: 4,
  },
  controlText: {
    fontSize: 12,
    color: '#2196F3',
    fontWeight: '500',
  },
  segment: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#2196F3',
  },
  timestampButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 4,
  },
  timestamp: {
    fontSize: 12,
    color: '#2196F3',
    fontWeight: '500',
  },
  segmentText: {
    fontSize: 16,
    lineHeight: 24,
  },
  wordsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  word: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  wordText: {
    fontSize: 16,
  },
  wordTimestamp: {
    fontSize: 10,
    color: '#666',
  },
  lowConfidence: {
    backgroundColor: '#FFF3E0',
  },
  confidenceWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  confidenceText: {
    fontSize: 10,
    color: '#FFA726',
  },
  emptyState: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    color: '#666',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 4,
  },
});