import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useState } from "react";
import {
  FlatList,
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
import { EXPIRY_LABELS, Feed, useFeeds } from "@/context/FeedsContext";

function FeedRow({
  feed,
  onRefresh,
  onOpenSettings,
}: {
  feed: Feed;
  onRefresh: (id: string) => void;
  onOpenSettings: (feed: Feed) => void;
}) {
  const { articles } = useFeeds();
  const unread = articles.filter((a) => a.feedId === feed.id && !a.isRead).length;
  const total = articles.filter((a) => a.feedId === feed.id).length;

  const handleRefresh = useCallback(() => {
    Haptics.selectionAsync();
    onRefresh(feed.id);
  }, [feed.id, onRefresh]);

  const domain = (() => {
    try {
      return new URL(feed.url).hostname.replace("www.", "");
    } catch {
      return feed.url;
    }
  })();

  const expiryLabel = EXPIRY_LABELS[feed.expiryBucket ?? "3d"];

  return (
    <Pressable
      onPress={() => onOpenSettings(feed)}
      style={({ pressed }) => [styles.feedRow, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.feedIcon}>
        <Feather name="rss" size={16} color={Colors.light.accent} />
      </View>
      <View style={styles.feedInfo}>
        <Text style={styles.feedTitle} numberOfLines={1}>
          {feed.title}
        </Text>
        <Text style={styles.feedDomain} numberOfLines={1}>
          {domain}
        </Text>
        <Text style={styles.feedCount}>
          {unread > 0 ? `${unread} unread` : "Up to date"} · {total} total · expires {expiryLabel}
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

export default function FeedsScreen() {
  const { feeds, refreshFeed } = useFeeds();
  const insets = useSafeAreaInsets();
  const [showAdd, setShowAdd] = useState(false);
  const [settingsFeed, setSettingsFeed] = useState<Feed | null>(null);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  const renderItem = useCallback(
    ({ item }: { item: Feed }) => (
      <FeedRow feed={item} onRefresh={refreshFeed} onOpenSettings={setSettingsFeed} />
    ),
    [refreshFeed]
  );

  const ListHeader = (
    <View style={[styles.header, { paddingTop: topPad + 16 }]}>
      <View style={styles.headerTop}>
        <View>
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
    <View style={styles.container}>
      <FlatList
        data={feeds}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        scrollEnabled={true}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={[
          styles.list,
          Platform.OS === "web" && { paddingBottom: 34 },
        ]}
      />
      <AddFeedSheet visible={showAdd} onClose={() => setShowAdd(false)} />
      <FeedSettingsSheet feed={settingsFeed} onClose={() => setSettingsFeed(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  list: {
    paddingBottom: 100,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  heading: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
    letterSpacing: -0.5,
  },
  subheading: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.accentLight,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
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
