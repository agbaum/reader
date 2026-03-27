import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useCallback } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import Colors from "@/constants/colors";
import { Article } from "@/context/FeedsContext";

interface ArticleCardProps {
  article: Article;
  onMarkRead: (id: string) => void;
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
  showFeedName = true,
}: ArticleCardProps) {
  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onMarkRead(article.id);
    router.push({
      pathname: "/article",
      params: {
        url: article.url,
        title: article.title,
        articleId: article.id,
        imageUrl: article.imageUrl ?? "",
        description: article.description ?? "",
        author: article.author ?? "",
        feedTitle: article.feedTitle,
        publishedAt: article.publishedAt?.toString() ?? "",
      },
    });
  }, [article, onMarkRead]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
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
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light.surface,
    marginHorizontal: 16,
    marginVertical: 5,
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    overflow: "hidden",
  },
  cardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
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
