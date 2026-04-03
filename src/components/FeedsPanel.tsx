import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useState } from "react";
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

import { AddFeedSheet } from "@/components/AddFeedSheet";
import { FeedSettingsSheet } from "@/components/FeedSettingsSheet";
import Colors from "@/constants/colors";
import { Feed, useFeeds } from "@/context/FeedsContext";

function FeedRow({
  feed,
  onPress,
  onRefresh,
}: {
  feed: Feed;
  onPress: (feed: Feed) => void;
  onRefresh: (id: string) => void;
}) {
  const { articles } = useFeeds();
  const unread = articles.filter((a) => a.feedId === feed.id && !a.isRead).length;
  const total = articles.filter((a) => a.feedId === feed.id).length;

  const domain = (() => {
    try {
      return new URL(feed.url).hostname.replace("www.", "");
    } catch {
      return feed.url;
    }
  })();

  const handleRefresh = useCallback(() => {
    Haptics.selectionAsync();
    onRefresh(feed.id);
  }, [feed.id, onRefresh]);

  return (
    <Pressable
      onPress={() => onPress(feed)}
      style={({ pressed }) => [styles.feedRow, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.feedIcon}>
        <Feather name="rss" size={16} color={Colors.light.accent} />
      </View>
      <View style={styles.feedInfo}>
        <Text style={styles.feedTitle} numberOfLines={1}>
          {feed.customTitle ?? feed.title}
        </Text>
        <Text style={styles.feedDomain} numberOfLines={1}>
          {domain}
        </Text>
        <Text style={styles.feedCount}>
          {unread > 0 ? `${unread} unread` : "Up to date"} · {total} total
        </Text>
      </View>
      <Pressable
        onPress={handleRefresh}
        hitSlop={12}
        style={({ pressed }) => [styles.refreshBtn, pressed && { opacity: 0.5 }]}
      >
        <Feather name="refresh-cw" size={16} color={Colors.light.textTertiary} />
      </Pressable>
    </Pressable>
  );
}

interface FeedsPanelProps {
  visible: boolean;
  onClose: () => void;
}

export function FeedsPanel({ visible, onClose }: FeedsPanelProps) {
  const { feeds, refreshFeed } = useFeeds();
  const insets = useSafeAreaInsets();
  const [showAdd, setShowAdd] = useState(false);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);

  const selectedFeed = selectedFeedId ? (feeds.find((f) => f.id === selectedFeedId) ?? null) : null;

  const renderItem = useCallback(
    ({ item }: { item: Feed }) => (
      <FeedRow feed={item} onPress={(f) => setSelectedFeedId(f.id)} onRefresh={refreshFeed} />
    ),
    [refreshFeed]
  );

  const ListHeader = (
    <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
        >
          <Feather name="x" size={20} color={Colors.light.textSecondary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.heading}>Feeds</Text>
          <Text style={styles.subheading}>
            {feeds.length} feed{feeds.length !== 1 ? "s" : ""}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowAdd(true);
          }}
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.75 }]}
        >
          <Feather name="plus" size={20} color={Colors.light.accent} />
        </Pressable>
      </View>
    </View>
  );

  const ListEmpty = (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Feather name="rss" size={32} color={Colors.light.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>No feeds yet</Text>
      <Text style={styles.emptyDesc}>
        Tap the + button to add your first RSS feed.
      </Text>
      <Pressable
        onPress={() => setShowAdd(true)}
        style={({ pressed }) => [styles.emptyAddBtn, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.emptyAddText}>Add a feed</Text>
      </Pressable>
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
          data={feeds}
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
        <AddFeedSheet visible={showAdd} onClose={() => setShowAdd(false)} />
        <FeedSettingsSheet feed={selectedFeed} onClose={() => setSelectedFeed(null)} />
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
  backBtn: {
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
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.light.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  feedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.light.surface,
    gap: 14,
  },
  feedIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.light.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  feedInfo: {
    flex: 1,
    gap: 2,
  },
  feedTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  feedDomain: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textTertiary,
  },
  feedCount: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.accent,
    marginTop: 2,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  separator: {
    height: 1,
    backgroundColor: Colors.light.separator,
    marginLeft: 74,
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
  emptyAddBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: Colors.light.accent,
    borderRadius: 12,
  },
  emptyAddText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
