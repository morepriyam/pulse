import { ThemedText } from "@/components/ThemedText";
import { useVideoProcessor } from "@/hooks/useVideoProcessor";
import { DraftStorage } from "@/utils/draftStorage";
import { useEventListener } from "expo";
import { router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function PreviewScreen() {
  const { draftId } = useLocalSearchParams<{ draftId: string }>();
  const insets = useSafeAreaInsets();

  const [videoUris, setVideoUris] = useState<string[]>([]);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [useSecondPlayer, setUseSecondPlayer] = useState(false);
  const [draft, setDraft] = useState<any>(null);

  // Video processing hook
  const {
    processDraft,
    isProcessing,
    progress,
    exportedVideoPath,
    resetExport,
  } = useVideoProcessor();

  // Players for segment preview
  const player1 = useVideoPlayer(null, (player) => {
    if (player) {
      player.loop = false;
      player.muted = false;
    }
  });

  const player2 = useVideoPlayer(null, (player) => {
    if (player) {
      player.loop = false;
      player.muted = false;
    }
  });

  // Player for exported video
  const exportedPlayer = useVideoPlayer(null, (player) => {
    if (player) {
      player.loop = true;
      player.muted = false;
    }
  });

  const currentPlayer = useSecondPlayer ? player2 : player1;
  const nextPlayer = useSecondPlayer ? player1 : player2;

  useEventListener(player1, "playToEnd", () => {
    if (videoUris.length > 1) {
      setUseSecondPlayer(true);
      player2.play();
      advanceToNextVideo();
    }
  });

  useEventListener(player2, "playToEnd", () => {
    if (videoUris.length > 1) {
      setUseSecondPlayer(false);
      player1.play();
      advanceToNextVideo();
    }
  });

  const advanceToNextVideo = () => {
    setCurrentVideoIndex((prev) => {
      const nextIndex = prev < videoUris.length - 1 ? prev + 1 : 0;
      return nextIndex;
    });
  };

  useEffect(() => {
    const loadDraft = async () => {
      if (!draftId) {
        router.back();
        return;
      }

      try {
        const loadedDraft = await DraftStorage.getDraftById(draftId);
        if (loadedDraft && loadedDraft.segments.length > 0) {
          const uris = loadedDraft.segments.map((segment) => segment.uri);
          setVideoUris(uris);
          setDraft(loadedDraft);
        } else {
          router.back();
        }
      } catch (error) {
        console.error("Draft load failed:", error);
        router.back();
      } finally {
        setIsLoading(false);
      }
    };

    loadDraft();
  }, [draftId]);

  useEffect(() => {
    const setupPlayers = async () => {
      if (videoUris.length > 0 && !isLoading && !exportedVideoPath) {
        try {
          await player1.replaceAsync(videoUris[0]);
          player1.play();

          if (videoUris.length > 1) {
            const nextIndex = videoUris.length > 1 ? 1 : 0;
            await player2.replaceAsync(videoUris[nextIndex]);
          }
        } catch (error) {
          console.error("Player setup failed:", error);
        }
      }
    };

    setupPlayers();
  }, [videoUris, isLoading, exportedVideoPath]);

  useEffect(() => {
    const preloadNext = async () => {
      if (videoUris.length <= 1 || exportedVideoPath) return;

      try {
        const nextIndex =
          currentVideoIndex < videoUris.length - 1 ? currentVideoIndex + 1 : 0;
        const nextVideoUri = videoUris[nextIndex];

        await nextPlayer.replaceAsync(nextVideoUri);
      } catch (error) {
        console.error("Preload failed:", error);
      }
    };

    if (videoUris.length > 0) {
      preloadNext();
    }
  }, [currentVideoIndex, videoUris, nextPlayer, exportedVideoPath]);

  // Load exported video when ready
  useEffect(() => {
    const loadExportedVideo = async () => {
      if (exportedVideoPath) {
        try {
          await exportedPlayer.replaceAsync(exportedVideoPath);
          exportedPlayer.play();
        } catch (error) {
          console.error("Failed to load exported video:", error);
        }
      }
    };

    loadExportedVideo();
  }, [exportedVideoPath]);

  const handleExport = async () => {
    if (draft && draft.segments.length > 0) {
      console.log("🎬 Starting export process...");
      await processDraft(draft.segments);
    }
  };

  const handleBackToSegments = () => {
    resetExport();
  };

  const handleClose = useCallback(() => {
    router.back();
  }, []);

  if (isLoading || videoUris.length === 0) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.closeButton, { top: insets.top + 20 }]}
          onPress={handleClose}
        >
          <ThemedText style={styles.closeText}>×</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Segment Players */}
      {!exportedVideoPath && (
        <>
          <VideoView
            player={player1}
            style={[styles.video, useSecondPlayer && styles.hiddenVideo]}
            allowsFullscreen={false}
            allowsPictureInPicture={false}
            showsTimecodes={false}
            requiresLinearPlayback={true}
            contentFit="cover"
            nativeControls={false}
          />

          <VideoView
            player={player2}
            style={[styles.video, !useSecondPlayer && styles.hiddenVideo]}
            allowsFullscreen={false}
            allowsPictureInPicture={false}
            showsTimecodes={false}
            requiresLinearPlayback={true}
            contentFit="cover"
            nativeControls={false}
          />
        </>
      )}

      {/* Exported Video Player */}
      {exportedVideoPath && (
        <VideoView
          player={exportedPlayer}
          style={styles.video}
          allowsFullscreen={false}
          allowsPictureInPicture={false}
          showsTimecodes={false}
          requiresLinearPlayback={true}
          contentFit="cover"
          nativeControls={false}
        />
      )}

      {/* Processing Overlay */}
      {isProcessing && (
        <View style={styles.processingOverlay}>
          <View style={styles.processingCard}>
            <ActivityIndicator size="large" color="#007AFF" />
            <ThemedText style={styles.processingText}>
              Exporting Video...
            </ThemedText>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
            <ThemedText style={styles.progressText}>
              {Math.round(progress)}%
            </ThemedText>
          </View>
        </View>
      )}

      {/* Close Button */}
      <TouchableOpacity
        style={[styles.closeButton, { top: insets.top + 20 }]}
        onPress={handleClose}
      >
        <ThemedText style={styles.closeText}>×</ThemedText>
      </TouchableOpacity>

      {/* Export Button */}
      {!exportedVideoPath && !isProcessing && videoUris.length > 1 && (
        <TouchableOpacity
          style={[styles.exportButton, { bottom: insets.bottom + 40 }]}
          onPress={handleExport}
        >
          <ThemedText style={styles.exportText}>Export Video</ThemedText>
        </TouchableOpacity>
      )}

      {/* Back to Segments Button */}
      {exportedVideoPath && (
        <TouchableOpacity
          style={[styles.backButton, { bottom: insets.bottom + 40 }]}
          onPress={handleBackToSegments}
        >
          <ThemedText style={styles.backText}>Back to Segments</ThemedText>
        </TouchableOpacity>
      )}

      {/* Export Success Indicator */}
      {exportedVideoPath && (
        <View style={[styles.successIndicator, { top: insets.top + 80 }]}>
          <ThemedText style={styles.successText}>
            ✅ Export Complete!
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  video: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  hiddenVideo: {
    opacity: 0,
    zIndex: 0,
  },
  closeButton: {
    position: "absolute",
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 25,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  closeText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "600",
    fontFamily: "Roboto-Bold",
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  exportButton: {
    position: "absolute",
    right: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#007AFF",
    borderRadius: 25,
    zIndex: 10,
  },
  exportText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Roboto-Bold",
  },
  backButton: {
    position: "absolute",
    right: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 25,
    zIndex: 10,
  },
  backText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Roboto-Bold",
  },
  processingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
  },
  processingCard: {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    minWidth: 200,
  },
  processingText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
    textAlign: "center",
  },
  progressBar: {
    width: 160,
    height: 4,
    backgroundColor: "#E5E5E5",
    borderRadius: 2,
    marginTop: 16,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#007AFF",
    borderRadius: 2,
  },
  progressText: {
    marginTop: 8,
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  successIndicator: {
    position: "absolute",
    left: 20,
    right: 20,
    backgroundColor: "rgba(0, 122, 255, 0.9)",
    borderRadius: 12,
    padding: 12,
    zIndex: 10,
  },
  successText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    fontFamily: "Roboto-Bold",
  },
});
