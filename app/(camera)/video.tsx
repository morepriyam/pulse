import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Ionicons } from "@expo/vector-icons";
import * as MediaLibrary from "expo-media-library";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const { width } = Dimensions.get("window");
const numColumns = 3;
const itemSize = width / numColumns;

type VideoScreenProps = {
  navigation?: { goBack: () => void };
};

export default function VideoScreen({ navigation }: VideoScreenProps) {
  const [videos, setVideos] = useState<MediaLibrary.Asset[]>([]);
  const [hasPermission, setHasPermission] = useState(false);
  const [loading, setLoading] = useState(true);
  const [after, setAfter] = useState<string | undefined>(undefined);
  const [hasNextPage, setHasNextPage] = useState(true);
  const pageSize = 100;

  useEffect(() => {
    (async () => {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      setHasPermission(status === "granted");
      if (status === "granted") {
        loadMoreVideos();
      } else {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMoreVideos = async () => {
    if (!hasNextPage) return;
    setLoading(true);
    const media = await MediaLibrary.getAssetsAsync({
      mediaType: [MediaLibrary.MediaType.video],
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      first: pageSize,
      after,
    });
    setVideos((prev) => [...prev, ...media.assets]);
    setAfter(media.endCursor);
    setHasNextPage(media.hasNextPage);
    setLoading(false);
  };

  if (!hasPermission) {
    return (
      <Text
        style={{
          color: "white",
          flex: 1,
          textAlign: "center",
          marginTop: 100,
        }}
      >
        No access to gallery
      </Text>
    );
  }

  if (loading && videos.length === 0) {
    return (
      <ThemedView style={{ flex: 1 }} darkColor="black" lightColor="black">
        <ActivityIndicator color="white" size="large" style={{ flex: 1, alignSelf: 'center' }} />
      </ThemedView>
    );
  }

  return (
    <ThemedView
      style={{ flex: 1 }}
      darkColor="black"
      lightColor="black"
    >
      {/* X Close Button */}
      <TouchableOpacity
        style={styles.closeButton}
        onPress={() => navigation?.goBack && navigation.goBack()}
      >
        <Ionicons name="close" size={32} color="white" />
      </TouchableOpacity>
      {/* Title */}
      <ThemedText type="title" style={styles.title}>
        Upload video
      </ThemedText>
      {/* Gallery Grid */}
      <FlatList
        data={videos}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        renderItem={({ item }) => (
          <Image source={{ uri: item.uri }} style={styles.thumbnail} />
        )}
        contentContainerStyle={styles.grid}
        onEndReached={loadMoreVideos}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loading ? <ActivityIndicator color="white" style={{ margin: 16 }} /> : null}
      />
      {/* Curved Bottom */}
      <View style={styles.curvedBottom} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "black" },
  closeButton: { position: "absolute", top: 40, left: 20, zIndex: 2 },
  title: {
    color: "white",
    fontSize: 24,
    fontWeight: "bold",
    alignSelf: "center",
    marginTop: 40,
  },
  grid: { marginTop: 80, paddingBottom: 100 },
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
});
