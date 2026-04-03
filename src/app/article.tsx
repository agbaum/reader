import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useLocalSearchParams, router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";

export default function ArticleScreen() {
  const params = useLocalSearchParams<{
    url: string;
    title: string;
    imageUrl?: string;
    description?: string;
    author?: string;
    feedTitle?: string;
    publishedAt?: string;
  }>();

  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  const handleClose = useCallback(() => {
    router.back();
  }, []);

  const handleShare = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Share.share({ url: params.url ?? "", message: params.title ?? "" });
  }, [params.url, params.title]);

  const handleOpenBrowser = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (params.url) {
      await WebBrowser.openBrowserAsync(params.url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        toolbarColor: Colors.light.surface,
        createTask: false,
      });
    }
  }, [params.url]);

  const publishedAt = params.publishedAt ? parseInt(params.publishedAt) : undefined;
  const dateStr =
    publishedAt && !isNaN(publishedAt)
      ? new Date(publishedAt).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : undefined;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.toolbar}>
        <Pressable
          onPress={handleClose}
          hitSlop={12}
          style={({ pressed }) => [styles.toolbarBtn, pressed && { opacity: 0.6 }]}
        >
          <Feather name="chevron-down" size={24} color={Colors.light.text} />
        </Pressable>
        <View style={styles.toolbarActions}>
          <Pressable
            onPress={handleShare}
            hitSlop={12}
            style={({ pressed }) => [styles.toolbarBtn, pressed && { opacity: 0.6 }]}
          >
            <Feather name="share" size={20} color={Colors.light.text} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {!!params.feedTitle && (
          <Text style={styles.feedName}>{params.feedTitle}</Text>
        )}

        <Text style={styles.title}>{params.title}</Text>

        <View style={styles.meta}>
          {!!params.author && (
            <Text style={styles.metaText}>{params.author}</Text>
          )}
          {!!dateStr && <Text style={styles.metaText}>{dateStr}</Text>}
        </View>

        {!!params.imageUrl && (
          <Image
            source={{ uri: params.imageUrl }}
            style={styles.heroImage}
            contentFit="cover"
            transition={300}
          />
        )}

        {!!params.description && (
          <Text style={styles.description}>{params.description}</Text>
        )}

        <Pressable
          onPress={handleOpenBrowser}
          style={({ pressed }) => [
            styles.readFullBtn,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.readFullText}>Read full article</Text>
          <Feather name="external-link" size={16} color="#fff" />
        </Pressable>

        <Text style={styles.readFullNote}>Opens in your browser</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  toolbarBtn: {
    padding: 4,
  },
  toolbarActions: {
    flexDirection: "row",
    gap: 16,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 28,
    gap: 16,
  },
  feedName: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.accent,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  meta: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  metaText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textTertiary,
  },
  heroImage: {
    width: "100%",
    height: 220,
    borderRadius: 14,
    backgroundColor: Colors.light.surfaceAlt,
  },
  description: {
    fontSize: 17,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    lineHeight: 28,
  },
  readFullBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.light.accent,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 8,
  },
  readFullText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  readFullNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textTertiary,
    textAlign: "center",
    marginTop: -4,
  },
});
