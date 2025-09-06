import React from 'react';
import { View, StyleSheet } from 'react-native';
import AutoEditToggle from '../components/AutoEditToggle';

// Demo component to showcase the AutoEditToggle UI
export default function AutoEditDemo() {
  const [isEnabled, setIsEnabled] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);

  const handleToggle = () => {
    if (isEnabled) {
      setIsEnabled(false);
      setIsProcessing(false);
    } else {
      setIsEnabled(true);
      setIsProcessing(true);
      
      // Simulate processing
      setTimeout(() => {
        setIsProcessing(false);
      }, 2000);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.background}>
        {/* Disabled state */}
        <View style={styles.demo}>
          <AutoEditToggle
            isEnabled={false}
            isProcessing={false}
            onToggle={() => {}}
            fillerWordsCount={0}
            timeSaved={0}
          />
        </View>

        {/* Processing state */}
        <View style={styles.demo}>
          <AutoEditToggle
            isEnabled={true}
            isProcessing={true}
            onToggle={() => {}}
            fillerWordsCount={0}
            timeSaved={0}
          />
        </View>

        {/* Active with results state */}
        <View style={styles.demo}>
          <AutoEditToggle
            isEnabled={true}
            isProcessing={false}
            onToggle={() => {}}
            fillerWordsCount={3}
            timeSaved={1600}
          />
        </View>

        {/* Interactive toggle */}
        <View style={styles.demo}>
          <AutoEditToggle
            isEnabled={isEnabled}
            isProcessing={isProcessing}
            onToggle={handleToggle}
            fillerWordsCount={isEnabled && !isProcessing ? 3 : 0}
            timeSaved={isEnabled && !isProcessing ? 1600 : 0}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  background: {
    backgroundColor: '#000',
    padding: 40,
    borderRadius: 20,
    gap: 20,
  },
  demo: {
    alignItems: 'center',
  },
});