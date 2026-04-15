import { Feather } from "@expo/vector-icons";
import React, { useCallback } from "react";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { Article, useFeeds } from "@/context/FeedsContext";
import { ArticleCard } from "@/components/ArticleCard";

interface RecentlyReadPanelProps {
  visible: boolean;
  onClose: () => void;
}

export function RecentlyReadPanel({ visible, onClose }: RecentlyReadPanelProps) {
  const { articles } = useFeeds();
  const insets = useSafeAreaInsets();

  const readArticles = articles
    .filter((a) => a.isRead || Math.max(a.scrollProgress ?? 0, a.readerScrollProgress ?? 0) > 0)
    .sort((a, b) => (b.lastReadAt ?? b.publishedAt ?? 0) - (a.lastReadAt ?? a.publishedAt ?? 0));

  const renderItem = useCallback(
    ({ item }: { item: Article }) => (
      <ArticleCard article={item} showExpiryBar={false} />
    ),
    []
  );

  const ListHeader = (
    <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
        >
          <Feather name="x" size={20} color={Colors.light.textSecondary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.heading}>Recently Read</Text>
          <Text style={styles.subheading}>
            {readArticles.length} article{readArticles.length !== 1 ? "s" : ""}
          </Text>
        </View>
      </View>
    </View>
  );

  const ListEmpty = (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Feather name="book-open" size={32} color={Colors.light.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>Nothing read yet</Text>
      <Text style={styles.emptyDesc}>
        Articles you've read will appear here.
      </Text>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS !== "ios"}
    >
      <View style={styles.container}>
        <FlatList
          data={readArticles}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmpty}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 32 },
          ]}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  list: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.separator,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerCenter: {
    flex: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.light.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  heading: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
    letterSpacing: -0.3,
  },
  subheading: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 1,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingTop: 80,
    gap: 12,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Colors.light.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "center",
  },
  emptyDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 21,
  },
});
