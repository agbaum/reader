import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import React, { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { useFeeds } from "@/context/FeedsContext";

interface FeedItem {
  url: string;
  title: string;
  selected: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

function parseOPML(xmlText: string): FeedItem[] {
  const feeds: FeedItem[] = [];

  try {
    // Extract all outline elements
    const outlineRegex = /<outline[^>]+>/gi;
    const matches = xmlText.match(outlineRegex) || [];

    for (const outline of matches) {
      // Extract xmlUrl attribute
      const urlMatch = outline.match(/xmlUrl=["']([^"']+)["']/i);
      if (!urlMatch?.[1]) continue;

      const url = urlMatch[1];

      // Extract title attribute
      const titleMatch = outline.match(/title=["']([^"']+)["']/i);
      const title = titleMatch?.[1] || new URL(url).hostname;

      // Skip if already added
      if (!feeds.find((f) => f.url === url)) {
        feeds.push({ url, title, selected: true });
      }
    }
  } catch (e) {
    console.error("OPML parsing error:", e);
  }

  return feeds;
}

export function OPMLImportSheet({ visible, onClose }: Props) {
  const { addMultipleFeeds } = useFeeds();
  const insets = useSafeAreaInsets();
  const [feeds, setFeeds] = useState<FeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSelectFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/xml", "text/plain", "application/xml"],
      });

      if (result.canceled) return;

      setIsLoading(true);
      const uri = result.assets[0].uri;

      // Read the file content
      const fileContent = await FileSystem.readAsStringAsync(uri);

      const parsedFeeds = parseOPML(fileContent);
      if (parsedFeeds.length === 0) {
        Alert.alert("No feeds found", "The OPML file doesn't contain any valid feeds.");
        setIsLoading(false);
        return;
      }

      setFeeds(parsedFeeds);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("File selection error:", error);
      Alert.alert("Error", "Could not read the file. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const toggleFeed = useCallback((url: string) => {
    setFeeds((prev) =>
      prev.map((f) => (f.url === url ? { ...f, selected: !f.selected } : f))
    );
  }, []);

  const handleImport = useCallback(async () => {
    const selectedUrls = feeds.filter((f) => f.selected).map((f) => f.url);
    if (selectedUrls.length === 0) {
      Alert.alert("No feeds selected", "Please select at least one feed to import.");
      return;
    }

    setIsProcessing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const result = await addMultipleFeeds(selectedUrls);
      setIsProcessing(false);

      if (result.success > 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (result.failed > 0) {
          console.warn(
            `Failed to add ${result.failed} feed(s):`,
            result.failedUrls.join(", ")
          );
        }
        Alert.alert(
          "Import successful",
          `Added ${result.success} feed${result.success !== 1 ? "s" : ""}${
            result.failed > 0
              ? `. Failed to add ${result.failed}:\n\n${result.failedUrls.join("\n")}`
              : "."
          }`
        );
        setFeeds([]);
        onClose();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Import failed", "Could not add any feeds. Please try again.");
      }
    } catch (error) {
      setIsProcessing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", "An error occurred while importing feeds.");
    }
  }, [feeds, addMultipleFeeds, onClose]);

  const handleClose = useCallback(() => {
    setFeeds([]);
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>Import OPML</Text>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Feather name="x" size={22} color={Colors.light.textSecondary} />
          </Pressable>
        </View>

        {feeds.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="file" size={48} color={Colors.light.textTertiary} />
            <Text style={styles.emptyStateTitle}>Upload an OPML file</Text>
            <Text style={styles.emptyStateDesc}>
              Select an OPML file from another RSS reader to import multiple feeds at once.
            </Text>

            <Pressable
              onPress={handleSelectFile}
              disabled={isLoading}
              style={({ pressed }) => [
                styles.selectBtn,
                pressed && { opacity: 0.85 },
                isLoading && styles.selectBtnDisabled,
              ]}
            >
              {isLoading ? (
                <ActivityIndicator color={Colors.light.accent} size="small" />
              ) : (
                <>
                  <Feather name="upload" size={18} color={Colors.light.accent} />
                  <Text style={styles.selectBtnText}>Choose File</Text>
                </>
              )}
            </Pressable>
          </View>
        ) : (
          <View style={styles.content}>
            <View style={styles.feedsHeader}>
              <Text style={styles.feedsCount}>
                {feeds.filter((f) => f.selected).length} of {feeds.length} selected
              </Text>
              <Pressable onPress={() => setFeeds(feeds.map((f) => ({ ...f, selected: true })))}>
                <Text style={styles.selectAllBtn}>Select All</Text>
              </Pressable>
            </View>

            <FlatList
              data={feeds}
              keyExtractor={(item) => item.url}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => toggleFeed(item.url)}
                  style={({ pressed }) => [
                    styles.feedItem,
                    pressed && { backgroundColor: Colors.light.surfaceAlt },
                  ]}
                >
                  <Pressable
                    onPress={() => toggleFeed(item.url)}
                    hitSlop={12}
                    style={styles.checkbox}
                  >
                    <View
                      style={[
                        styles.checkboxBox,
                        item.selected && styles.checkboxBoxSelected,
                      ]}
                    >
                      {item.selected && (
                        <Feather name="check" size={14} color="#fff" />
                      )}
                    </View>
                  </Pressable>
                  <View style={styles.feedInfo}>
                    <Text style={styles.feedTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.feedUrl} numberOfLines={1}>
                      {item.url}
                    </Text>
                  </View>
                </Pressable>
              )}
              scrollEnabled
              style={styles.feedsList}
              contentContainerStyle={styles.feedsListContent}
            />

            <View style={styles.actions}>
              <Pressable
                onPress={() => setFeeds([])}
                style={({ pressed }) => [
                  styles.cancelBtn,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleImport}
                disabled={isProcessing || feeds.filter((f) => f.selected).length === 0}
                style={({ pressed }) => [
                  styles.importBtn,
                  pressed && { opacity: 0.85 },
                  (isProcessing || feeds.filter((f) => f.selected).length === 0) &&
                    styles.importBtnDisabled,
                ]}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.importBtnText}>
                    Import {feeds.filter((f) => f.selected).length}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.light.border,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 20,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "center",
  },
  emptyStateDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
  },
  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.light.accent,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  selectBtnDisabled: {
    opacity: 0.5,
  },
  selectBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  feedsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingVertical: 8,
  },
  feedsCount: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  selectAllBtn: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.accent,
  },
  feedsList: {
    flex: 1,
  },
  feedsListContent: {
    gap: 2,
  },
  feedItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    marginBottom: 4,
  },
  checkbox: {
    marginRight: 12,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxBoxSelected: {
    backgroundColor: Colors.light.accent,
    borderColor: Colors.light.accent,
  },
  feedInfo: {
    flex: 1,
  },
  feedTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    marginBottom: 4,
  },
  feedUrl: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textTertiary,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 20,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    borderRadius: 12,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  importBtn: {
    flex: 1,
    backgroundColor: Colors.light.accent,
    borderRadius: 12,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  importBtnDisabled: {
    opacity: 0.5,
  },
  importBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
