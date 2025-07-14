import { ThemedText } from "@/components/ThemedText";
import { DraftStorage } from "@/utils/draftStorage";
import { useEventListener } from "expo";
import { router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function PreviewScreen() {
  const { draftId } = useLocalSearchParams<{ draftId: string }>();
  const insets = useSafeAreaInsets();

  const [videoUris, setVideoUris] = useState<string[]>([]);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [useSecondPlayer, setUseSecondPlayer] = useState(false);

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
        const draft = await DraftStorage.getDraftById(draftId);
        if (draft && draft.segments.length > 0) {
          const uris = draft.segments.map((segment) => segment.uri);
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
  }, [videoUris, isLoading]);

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

      <TouchableOpacity
        style={[styles.closeButton, { top: insets.top + 20 }]}
        onPress={handleClose}
      >
        <ThemedText style={styles.closeText}>×</ThemedText>
      </TouchableOpacity>
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
});
