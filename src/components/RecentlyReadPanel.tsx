import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
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

function timeAgo(ts?: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

function ReadArticleRow({ article }: { article: Article }) {
  const handlePress = useCallback(() => {
    router.push({
      pathname: "/article",
      params: {
        url: article.url,
        title: article.title,
        description: article.description ?? "",
        imageUrl: article.imageUrl ?? "",
        feedTitle: article.feedTitle ?? "",
        author: article.author ?? "",
        publishedAt: article.publishedAt?.toString() ?? "",
        articleId: article.id,
      },
    });
  }, [article]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
    >
      <View style={styles.rowContent}>
        <Text style={styles.feedName} numberOfLines={1}>
          {article.feedTitle}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {article.title}
        </Text>
        <Text style={styles.meta}>{timeAgo(article.publishedAt)}</Text>
      </View>
      <Feather name="chevron-right" size={16} color={Colors.light.textTertiary} />
    </Pressable>
  );
}

interface RecentlyReadPanelProps {
  visible: boolean;
  onClose: () => void;
}

export function RecentlyReadPanel({ visible, onClose }: RecentlyReadPanelProps) {
  const { articles } = useFeeds();
  const insets = useSafeAreaInsets();

  const readArticles = articles
    .filter((a) => a.isRead)
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));

  const renderItem = useCallback(
    ({ item }: { item: Article }) => <ReadArticleRow article={item} />,
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
          ItemSeparatorComponent={() => <View style={styles.separator} />}
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  rowContent: {
    flex: 1,
    gap: 3,
  },
  feedName: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.light.accent,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  title: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
    lineHeight: 21,
  },
  meta: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textTertiary,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.light.separator,
    marginLeft: 20,
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
