import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Draft, DraftStorage } from "@/utils/draftStorage";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

export default function DraftsScreen() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDrafts();
  }, []);

  const loadDrafts = async () => {
    try {
      const savedDrafts = await DraftStorage.getAllDrafts();
      setDrafts(
        savedDrafts.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        )
      );
    } catch (error) {
      console.error("Error loading drafts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDraftPress = (draft: Draft) => {
    // Navigate to shorts screen with draft ID
    router.push({
      pathname: "/(camera)/shorts",
      params: { draftId: draft.id },
    });
  };

  const handleDeleteDraft = async (draftId: string) => {
    Alert.alert("Delete Draft", "Are you sure you want to delete this draft?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await DraftStorage.deleteDraft(draftId);
            loadDrafts(); // Refresh the list
          } catch (error) {
            console.error("Error deleting draft:", error);
          }
        },
      },
    ]);
  };

  const formatDuration = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const formatDate = (date: Date) => {
    return (
      date.toLocaleDateString() +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  };

  const renderDraftItem = ({ item }: { item: Draft }) => {
    const totalRecordedDuration = item.segments.reduce(
      (total, segment) => total + segment.duration,
      0
    );

    return (
      <TouchableOpacity
        style={styles.draftItem}
        onPress={() => handleDraftPress(item)}
      >
        <View style={styles.draftContent}>
          {item.thumbnail && (
            <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
          )}
          <View style={styles.draftInfo}>
            <ThemedText style={styles.draftTitle}>
              Draft ({item.segments.length} segment
              {item.segments.length !== 1 ? "s" : ""})
            </ThemedText>
            <ThemedText style={styles.draftDetails}>
              Recorded: {formatDuration(Math.round(totalRecordedDuration))} /{" "}
              {formatDuration(item.totalDuration)}
            </ThemedText>
            <ThemedText style={styles.draftDate}>
              {formatDate(item.createdAt)}
            </ThemedText>
          </View>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDeleteDraft(item.id)}
          >
            <ThemedText style={styles.deleteText}>×</ThemedText>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.loadingText}>Loading drafts...</ThemedText>
      </ThemedView>
    );
  }

  if (drafts.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <ThemedView style={styles.emptyContainer}>
          <ThemedText style={styles.emptyTitle}>No Drafts</ThemedText>
          <ThemedText style={styles.emptySubtitle}>
            Your saved recording drafts will appear here
          </ThemedText>
        </ThemedView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText style={styles.headerTitle}>Drafts</ThemedText>
        <ThemedText style={styles.headerSubtitle}>
          Tap to continue recording
        </ThemedText>
      </ThemedView>

      <FlatList
        data={drafts}
        renderItem={renderDraftItem}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    padding: 20,
    paddingTop: 60,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: "#888888",
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 20,
    paddingTop: 0,
  },
  draftItem: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#333",
  },
  draftContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: "#333",
    marginRight: 12,
  },
  draftInfo: {
    flex: 1,
  },
  draftTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#ffffff",
    marginBottom: 4,
  },
  draftDetails: {
    fontSize: 14,
    color: "#888888",
    marginBottom: 2,
  },
  draftDate: {
    fontSize: 12,
    color: "#666666",
  },
  deleteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 0, 0, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },
  deleteText: {
    color: "#ff0000",
    fontSize: 20,
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: "#888888",
    textAlign: "center",
    lineHeight: 24,
  },
  loadingText: {
    fontSize: 18,
    color: "#ffffff",
    textAlign: "center",
    marginTop: 100,
  },
});
