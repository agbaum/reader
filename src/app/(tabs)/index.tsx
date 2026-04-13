import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
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

function PulsingDot({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (visible) {
      opacity.setValue(1);
      loopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.25, duration: 550, useNativeDriver: true, isInteraction: false }),
          Animated.timing(opacity, { toValue: 1, duration: 550, useNativeDriver: true, isInteraction: false }),
        ])
      );
      loopRef.current.start();
    } else {
      loopRef.current?.stop();
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
    }
  }, [visible]);

  return (
    <Animated.View pointerEvents="none" style={[styles.dot, { opacity }]} />
  );
}

export default function TodayScreen() {
  const { articles, isRefreshing, refreshFeeds, resetArticleExpiry, dismissArticle } = useFeeds();
  const insets = useSafeAreaInsets();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [feedsPanelOpen, setFeedsPanelOpen] = useState(false);
  const [recentlyReadOpen, setRecentlyReadOpen] = useState(false);

  const unreadArticles = useMemo(
    () => articles.filter((a) => !a.isRead && !a.dismissed),
    [articles]
  );

  const renderItem = useCallback(
    ({ item }: { item: Article }) => (
      <ArticleCard article={item} onResetExpiry={resetArticleExpiry} onDismiss={dismissArticle} showFeedName />
    ),
    []
  );

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const barHeight = topPad + 52;

  const barTranslateY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);
  const barVisible = useRef(true);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const diff = y - lastScrollY.current;
      lastScrollY.current = y;

      if (diff > 4 && barVisible.current && y > barHeight) {
        barVisible.current = false;
        Animated.timing(barTranslateY, {
          toValue: -barHeight,
          duration: 200,
          useNativeDriver: true,
        }).start();
      } else if (diff < -4 && !barVisible.current) {
        barVisible.current = true;
        Animated.timing(barTranslateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    },
    [barHeight]
  );

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
        ListEmptyComponent={ListEmpty}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        scrollEnabled={true}
        overScrollMode="always"
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        contentContainerStyle={[styles.list, { paddingTop: barHeight }]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      />

      <Animated.View
        style={[
          styles.topBar,
          { height: barHeight, transform: [{ translateY: barTranslateY }] },
        ]}
      >
        <View style={[styles.topBarContent, { paddingTop: topPad }]}>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setSidebarOpen(true);
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.menuBtn, pressed && { opacity: 0.6 }]}
          >
            <Feather name="menu" size={20} color={Colors.light.text} />
            <PulsingDot visible={isRefreshing} />
          </Pressable>
        </View>
      </Animated.View>

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
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: Colors.light.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  topBarContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  dot: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.light.accent,
  },
  menuBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
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
