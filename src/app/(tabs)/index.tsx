import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ArticleCard } from "@/components/ArticleCard";
import { FeedsPanel } from "@/components/FeedsPanel";
import { RecentlyReadPanel } from "@/components/RecentlyReadPanel";
import { Sidebar } from "@/components/Sidebar";
import Colors from "@/constants/colors";
import { Article, useFeeds } from "@/context/FeedsContext";

function RefreshingBar({ visible }: { visible: boolean }) {
  const spin = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (visible) {
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      loopRef.current = Animated.loop(
        Animated.timing(spin, { toValue: 1, duration: 900, useNativeDriver: true, isInteraction: false })
      );
      loopRef.current.start();
    } else {
      loopRef.current?.stop();
      spin.setValue(0);
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Animated.View style={[styles.refreshBar, { opacity }]}>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Feather name="refresh-cw" size={13} color={Colors.light.accent} />
      </Animated.View>
      <Text style={styles.refreshBarText}>Updating feeds…</Text>
    </Animated.View>
  );
}

export default function TodayScreen() {
  const { articles, isRefreshing, refreshFeeds, markAsRead } = useFeeds();
  const insets = useSafeAreaInsets();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [feedsPanelOpen, setFeedsPanelOpen] = useState(false);
  const [recentlyReadOpen, setRecentlyReadOpen] = useState(false);

  const unreadArticles = useMemo(
    () => articles.filter((a) => !a.isRead),
    [articles]
  );

  const renderItem = useCallback(
    ({ item }: { item: Article }) => (
      <ArticleCard article={item} onMarkRead={markAsRead} showFeedName />
    ),
    [markAsRead]
  );

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  const sidebarItems = [
    {
      icon: "rss" as const,
      label: "Feeds",
      onPress: () => setFeedsPanelOpen(true),
    },
    {
      icon: "book-open" as const,
      label: "Recently Read",
      onPress: () => setRecentlyReadOpen(true),
    },
  ];

  const ListHeader = (
    <View style={[styles.header, { paddingTop: topPad + 16 }]}>
      <RefreshingBar visible={isRefreshing} />
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          setSidebarOpen(true);
        }}
        hitSlop={8}
        style={({ pressed }) => [styles.menuBtn, pressed && { opacity: 0.6 }]}
      >
        <Feather name="menu" size={20} color={Colors.light.text} />
      </Pressable>
    </View>
  );

  const ListEmpty = (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Feather name="inbox" size={32} color={Colors.light.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>All caught up</Text>
      <Text style={styles.emptyDesc}>
        Nothing new to read. Check back later or add more feeds.
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={unreadArticles}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        scrollEnabled={true}
        overScrollMode="always"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshFeeds}
            tintColor={Colors.light.accent}
            colors={[Colors.light.accent]}
            progressBackgroundColor={Colors.light.surface}
          />
        }
        contentContainerStyle={styles.list}
      />

      <Sidebar
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        items={sidebarItems}
      />

      <FeedsPanel
        visible={feedsPanelOpen}
        onClose={() => setFeedsPanelOpen(false)}
      />

      <RecentlyReadPanel
        visible={recentlyReadOpen}
        onClose={() => setRecentlyReadOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  list: {
    paddingBottom: Platform.OS === "web" ? 34 : 40,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 16,
  },
  refreshBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: Colors.light.accentLight,
    borderRadius: 20,
    alignSelf: "flex-start",
    marginBottom: 4,
  },
  refreshBarText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.light.accent,
  },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.light.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
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
