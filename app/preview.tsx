import { ThemedText } from "@/components/ThemedText";
import VideoConcatModule from "@/modules/video-concat";
import { DraftStorage } from "@/utils/draftStorage";
import { fileStore } from "@/utils/fileStore";
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
  const [isConcatenating, setIsConcatenating] = useState(false);
  const [concatenatedVideoUri, setConcatenatedVideoUri] = useState<
    string | null
  >(null);
  const [concatProgress, setConcatProgress] = useState(0);
  const [concatPhase, setConcatPhase] = useState<string>("");
  const [draft, setDraft] = useState<any>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);

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

  const _currentPlayer = useSecondPlayer ? player2 : player1; // eslint-disable-line @typescript-eslint/no-unused-vars
  const nextPlayer = useSecondPlayer ? player1 : player2;

  useEventListener(player1, "playToEnd", () => {
    // Only handle segment cycling if we're not in merged video mode
    if (videoUris.length > 1 && !concatenatedVideoUri) {
      setUseSecondPlayer(true);
      player2.play();
      advanceToNextVideo();
    }
  });

  useEventListener(player2, "playToEnd", () => {
    // Only handle segment cycling if we're not in merged video mode
    if (videoUris.length > 1 && !concatenatedVideoUri) {
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
        const draft = await DraftStorage.getDraftById(draftId);
        if (draft && draft.segments.length > 0) {
          setDraft(draft);
          // Convert relative paths to absolute paths for video playback
          const uris = draft.segments.map((segment) =>
            fileStore.toAbsolutePath(segment.uri)
          );
          setVideoUris(uris);
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
      if (videoUris.length > 0 && !isLoading) {
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
  }, [videoUris, isLoading, player1, player2]);

  useEffect(() => {
    const preloadNext = async () => {
      if (videoUris.length <= 1) return;

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
  }, [currentVideoIndex, videoUris, nextPlayer]);

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

  // Add concatenation handler
  const handleConcatenate = async () => {
    if (!draftId) return;

    try {
      console.log("🎬 Starting video concatenation...");
      setIsConcatenating(true);

      const draft = await DraftStorage.getDraftById(draftId);
      if (!draft) {
        console.error("❌ No draft found");
        return;
      }

      console.log("📝 Draft loaded:", {
        id: draft.id,
        segments: draft.segments.length,
        totalDuration: draft.totalDuration,
      });

      // Set up progress listener
      const progressListener = VideoConcatModule.addListener(
        "onProgress",
        (event) => {
          const { progress, currentSegment, phase } = event.progress;
          console.log(
            `📊 Progress: ${Math.round(progress * 100)}% - Segment ${
              currentSegment + 1
            } - ${phase}`
          );
          setConcatProgress(progress);
          setConcatPhase(phase);
        }
      );

      // Convert relative paths to absolute paths for native module
      const segmentsWithAbsolutePaths = draft.segments.map((segment) => ({
        ...segment,
        uri: fileStore.toAbsolutePath(segment.uri),
      }));

      // Start concatenation
      console.log("🚀 Calling native export function...");
      const outputUri = await VideoConcatModule.export(
        segmentsWithAbsolutePaths
      );
      console.log("✅ Concatenation completed:", outputUri);

      // Remove progress listener
      progressListener?.remove();

      setConcatenatedVideoUri(outputUri);

      // Load concatenated video
      console.log("📺 Loading concatenated video into player...");
      setIsLoadingVideo(true);

      try {
        await player1.replaceAsync(outputUri);

        // Wait a moment for the video to load its metadata and orientation
        await new Promise((resolve) => setTimeout(resolve, 1000));

        setIsLoadingVideo(false);
        player1.play();
        console.log("▶️ Video playback started");
      } catch (videoLoadError) {
        console.error("❌ Failed to load concatenated video:", videoLoadError);
        // Reset the concatenated video state if loading fails
        setConcatenatedVideoUri(null);
        setIsLoadingVideo(false);
        throw videoLoadError; // Re-throw to be caught by outer catch
      }
    } catch (error) {
      console.error("❌ Concatenation failed:", error);
      // Reset states on any error
      setConcatenatedVideoUri(null);
    } finally {
      setIsConcatenating(false);
    }
  };

  return (
    <View style={styles.container}>
      <VideoView
        player={player1}
        style={[styles.video, useSecondPlayer && styles.hiddenVideo]}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
        showsTimecodes={false}
        requiresLinearPlayback={true}
        contentFit="cover"
        nativeControls={concatenatedVideoUri ? true : false}
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

      <TouchableOpacity
        style={[styles.closeButton, { top: insets.top + 20 }]}
        onPress={handleClose}
      >
        <ThemedText style={styles.closeText}>×</ThemedText>
      </TouchableOpacity>

      {/* Add concatenate button - only show if not concatenated */}
      {!concatenatedVideoUri && (
        <TouchableOpacity
          style={[styles.concatenateButton, { bottom: insets.bottom + 20 }]}
          onPress={handleConcatenate}
          disabled={isConcatenating}
        >
          <ThemedText style={styles.buttonText}>
            {isConcatenating ? "Processing..." : "Merge Videos"}
          </ThemedText>
        </TouchableOpacity>
      )}

      {/* Loading overlay */}
      {(isConcatenating || isLoadingVideo) && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#ffffff" />
          <ThemedText style={styles.loadingText}>
            {isLoadingVideo
              ? "Loading merged video..."
              : concatPhase === "processing"
              ? `Processing segment ${
                  Math.round(concatProgress * draft?.segments.length || 0) + 1
                }...`
              : concatPhase === "finalizing"
              ? "Finalizing video..."
              : "Merging videos..."}
          </ThemedText>
          {!isLoadingVideo && (
            <ThemedText style={styles.progressText}>
              {Math.round(concatProgress * 100)}%
            </ThemedText>
          )}
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
  concatenateButton: {
    position: "absolute",
    left: 20,
    right: 20,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#ff0000",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Roboto-Bold",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
  },
  loadingText: {
    color: "#ffffff",
    marginTop: 20,
    fontSize: 16,
  },
  progressText: {
    color: "#ffffff",
    marginTop: 10,
    fontSize: 24,
    fontWeight: "bold",
  },
});
