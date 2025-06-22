import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import EvilIcons from "@expo/vector-icons/EvilIcons";
import * as MediaLibrary from "expo-media-library";
import { router } from "expo-router";
import * as VideoThumbnails from "expo-video-thumbnails";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const { width } = Dimensions.get("window");
const numColumns = 3;
const itemSize = width / numColumns;

type VideoAsset = MediaLibrary.Asset & {
  localUri: string;
  thumbnailUri?: string;
};
type VideoScreenProps = {
  navigation?: { goBack: () => void };
};

let preloadedVideos: VideoAsset[] = [];
let preloadedAfter: string | undefined = undefined;
let preloadedHasNextPage: boolean = true;

export default function VideoScreen({ navigation }: VideoScreenProps) {
  const [videos, setVideos] = useState<VideoAsset[]>(preloadedVideos);
  const [loading, setLoading] = useState(preloadedVideos.length === 0);
  const [after, setAfter] = useState<string | undefined>(preloadedAfter);
  const [hasNextPage, setHasNextPage] = useState(preloadedHasNextPage);
  const pageSize = 40;
  const [fetchingMore, setFetchingMore] = useState(false);

  const loadMoreVideos = async () => {
    if (!hasNextPage || fetchingMore) return;
    setFetchingMore(true);
    const media = await MediaLibrary.getAssetsAsync({
      mediaType: [MediaLibrary.MediaType.video],
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      first: pageSize,
      after,
    });
    const assetsWithUri = await Promise.all(
      media.assets.map(async (asset) => {
        const info = await MediaLibrary.getAssetInfoAsync(asset.id);
        let thumbnailUri = undefined;
        try {
          const { uri: thumb } = await VideoThumbnails.getThumbnailAsync(
            info.localUri || asset.uri,
            { time: 1000 }
          );
          thumbnailUri = thumb;
        } catch (e) {
          console.warn("Could not generate thumbnail for", asset.filename, e);
        }
        return { ...asset, localUri: info.localUri || asset.uri, thumbnailUri };
      })
    );
    setVideos((prev) => {
      const newVideos = [...prev, ...assetsWithUri];
      preloadedVideos = newVideos;
      preloadedAfter = media.endCursor;
      preloadedHasNextPage = media.hasNextPage;
      return newVideos;
    });
    setAfter(media.endCursor);
    setHasNextPage(media.hasNextPage);
    setFetchingMore(false);
    setLoading(false);
  };

  useEffect(() => {
    if (preloadedVideos.length === 0) {
      setLoading(true);
      loadMoreVideos();
    }
  }, []);

  return (
    <ThemedView style={{ flex: 1 }} darkColor="black" lightColor="black">
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => router.dismiss()}
        >
          <EvilIcons name="close" size={24} color="white" />
        </TouchableOpacity>
        <ThemedText type="title" style={styles.title}>
          Upload video
        </ThemedText>
      </View>
      {loading && videos.length === 0 ? (
        <ActivityIndicator
          color="white"
          size="large"
          style={{ flex: 1, alignSelf: "center" }}
        />
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          renderItem={({ item }) => (
            <View style={styles.thumbnailContainer}>
              {item.thumbnailUri ? (
                <Image
                  source={{ uri: item.thumbnailUri }}
                  style={styles.thumbnail}
                />
              ) : (
                <View
                  style={[
                    styles.thumbnail,
                    {
                      backgroundColor: "#222",
                      justifyContent: "center",
                      alignItems: "center",
                    },
                  ]}
                >
                  <EvilIcons name="close" size={32} color="#666" />
                </View>
              )}
              {/* Duration overlay */}
              <View style={styles.durationOverlay}>
                <Text style={styles.durationText}>
                  {formatDuration(item.duration)}
                </Text>
              </View>
            </View>
          )}
          contentContainerStyle={styles.grid}
          onEndReached={loadMoreVideos}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            fetchingMore ? (
              <ActivityIndicator color="white" style={{ margin: 16 }} />
            ) : null
          }
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  closeButton: { position: "relative", top: 0, left: 0, zIndex: 2 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Platform.select({
      ios: 64,
      android: StatusBar.currentHeight ? StatusBar.currentHeight + 24 : 40,
      default: 40,
    }),
    marginLeft: 20,
    marginBottom: 16,
    paddingTop: Platform.select({ ios: 8, android: 0, default: 0 }),
  },
  title: {
    color: "white",
    fontSize: 24,
    fontWeight: "bold",
    marginLeft: 16,
  },
  grid: { paddingBottom: 100 },
  thumbnail: { width: itemSize, height: itemSize, margin: 1 },
  curvedBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: "black",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
  },
  thumbnailContainer: {
    position: "relative",
  },
  durationOverlay: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  durationText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
});

function formatDuration(duration: number) {
  const minutes = Math.floor(duration / 60);
  const seconds = Math.floor(duration % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
