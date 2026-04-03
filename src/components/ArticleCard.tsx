import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import Colors from "@/constants/colors";
import { Article, ExpiryBucket } from "@/context/FeedsContext";

const EXPIRY_COLORS: Record<ExpiryBucket, string> = {
  "6h":  "#C97676", // soft red
  "18h": "#9B88C4", // soft purple
  "3d":  "#6E9AB5", // soft blue
  "7d":  "#74A87E", // soft green
};

const DISMISS_THRESHOLD = 110;

interface ArticleCardProps {
  article: Article;
  onMarkRead: (id: string) => void;
  onResetExpiry?: (id: string) => void;
  onDismiss?: (id: string) => void;
  showFeedName?: boolean;
}

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
  const wks = Math.floor(days / 7);
  return `${wks}w`;
}

export function ArticleCard({
  article,
  onMarkRead,
  onResetExpiry,
  onDismiss,
  showFeedName = true,
}: ArticleCardProps) {
  const translateX = useSharedValue(0);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onMarkRead(article.id);
    if (article.url) {
      WebBrowser.openBrowserAsync(article.url);
    }
  }, [article, onMarkRead]);

  const handleLongPress = useCallback(() => {
    if (!onResetExpiry) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onResetExpiry(article.id);
  }, [article.id, onResetExpiry]);

  const triggerDismiss = useCallback((id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onDismiss?.(id);
  }, [onDismiss]);

  const gesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > DISMISS_THRESHOLD) {
        const direction = e.translationX > 0 ? 1 : -1;
        translateX.value = withTiming(direction * 600, { duration: 220 }, () => {
          runOnJS(triggerDismiss)(article.id);
        });
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const bgOpacityStyle = useAnimatedStyle(() => ({
    opacity: Math.min(Math.abs(translateX.value) / DISMISS_THRESHOLD, 1),
  }));

  return (
    <View style={styles.rowContainer}>
      <Animated.View style={[styles.dismissBg, bgOpacityStyle]}>
        <Feather name="archive" size={18} color={Colors.light.accent} />
        <Text style={styles.dismissLabel}>Dismiss</Text>
      </Animated.View>

      <GestureDetector gesture={gesture}>
        <Animated.View style={cardAnimStyle}>
          <Pressable
            onPress={handlePress}
            onLongPress={handleLongPress}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            {article.expiryBucket && (
              <View style={[styles.expiryStrip, { backgroundColor: EXPIRY_COLORS[article.expiryBucket] }]} />
            )}
            <View style={styles.content}>
              <View style={styles.meta}>
                {showFeedName && (
                  <Text style={styles.feedName} numberOfLines={1}>
                    {article.feedTitle}
                  </Text>
                )}
                <Text style={styles.time}>{timeAgo(article.publishedAt)}</Text>
              </View>

              <View style={styles.main}>
                <View style={styles.textBlock}>
                  <Text
                    style={[styles.title, article.isRead && styles.titleRead]}
                    numberOfLines={3}
                  >
                    {article.title}
                  </Text>
                  {!!article.description && (
                    <Text style={styles.description} numberOfLines={2}>
                      {article.description}
                    </Text>
                  )}
                </View>
                {!!article.imageUrl && (
                  <Image
                    source={{ uri: article.imageUrl }}
                    style={styles.thumbnail}
                    contentFit="cover"
                    transition={200}
                  />
                )}
              </View>

              {!!article.author && (
                <Text style={styles.author} numberOfLines={1}>
                  {article.author}
                </Text>
              )}
            </View>

            {!article.isRead && <View style={styles.unreadDot} />}
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  rowContainer: {
    marginHorizontal: 16,
    marginVertical: 5,
  },
  dismissBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#EDD5C8",
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  dismissLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.accent,
  },
  card: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    paddingTop: 16,
    paddingBottom: 16,
    paddingLeft: 19,
    paddingRight: 16,
    flexDirection: "row",
    overflow: "hidden",
  },
  cardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
  expiryStrip: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  content: {
    flex: 1,
    gap: 8,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "space-between",
  },
  feedName: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.accent,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    flex: 1,
  },
  time: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textTertiary,
  },
  main: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  textBlock: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    lineHeight: 22,
  },
  titleRead: {
    color: Colors.light.textTertiary,
    fontFamily: "Inter_400Regular",
  },
  description: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    lineHeight: 19,
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: Colors.light.surfaceAlt,
  },
  author: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textTertiary,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.light.accent,
    marginLeft: 10,
    marginTop: 6,
  },
});
