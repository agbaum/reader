import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, WebViewMessageEvent } from "react-native-webview";

import Colors from "@/constants/colors";
import { useFeeds } from "@/context/FeedsContext";

// Injected into the page to report scroll progress and restore position
function buildInjectedJS(restoreProgress: number): string {
  return `
    (function() {
      var restored = false;
      function getDocHeight() {
        return Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        ) - window.innerHeight;
      }
      function sendProgress() {
        var h = getDocHeight();
        var progress = h > 0 ? window.scrollY / h : 0;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'scroll', progress: progress }));
      }
      window.addEventListener('scroll', sendProgress, { passive: true });
      // Restore saved position after page settles
      ${
        restoreProgress > 0
          ? `
      function tryRestore() {
        if (restored) return;
        var h = getDocHeight();
        if (h > 100) {
          window.scrollTo(0, ${restoreProgress} * h);
          restored = true;
        }
      }
      window.addEventListener('load', tryRestore);
      setTimeout(tryRestore, 800);
      setTimeout(tryRestore, 2000);
      `
          : ""
      }
    })();
    true;
  `;
}

export default function ArticleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { articles, markAsRead, saveScrollProgress } = useFeeds();

  const article = articles.find((a) => a.id === id);
  const savedProgress = article?.scrollProgress ?? 0;

  const progressAnim = useRef(new Animated.Value(savedProgress)).current;
  const [progressWidth, setProgressWidth] = useState(savedProgress);
  const hasMarkedRead = useRef(article?.isRead ?? false);
  const latestProgress = useRef(savedProgress);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type !== "scroll" || !id) return;

        const p: number = Math.min(1, Math.max(0, data.progress));
        latestProgress.current = p;

        Animated.timing(progressAnim, {
          toValue: p,
          duration: 100,
          useNativeDriver: false,
        }).start();
        setProgressWidth(p);

        saveScrollProgress(id, p);

        if (!hasMarkedRead.current && p >= 0.9) {
          hasMarkedRead.current = true;
          markAsRead(id);
        }
      } catch {
        // ignore malformed messages
      }
    },
    [id, markAsRead, saveScrollProgress, progressAnim]
  );

  const openInBrowser = useCallback(() => {
    if (article?.url) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      WebBrowser.openBrowserAsync(article.url, { createTask: false });
    }
  }, [article?.url]);

  const openHomepage = useCallback(() => {
    if (article?.url) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        const { origin } = new URL(article.url);
        WebBrowser.openBrowserAsync(origin, { createTask: false });
      } catch {
        WebBrowser.openBrowserAsync(article.url, { createTask: false });
      }
    }
  }, [article?.url]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, [router]);

  if (!article) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Article not found.</Text>
      </View>
    );
  }

  const barTop = insets.top;
  const barHeight = barTop + 48;

  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: article.url }}
        style={styles.webview}
        contentInset={{ top: barHeight }}
        // Spoof a real Chrome UA so paywalled/UA-sniffing sites render properly
        applicationNameForUserAgent="Chrome/124.0.0.0 Mobile Safari/537.36"
        injectedJavaScript={buildInjectedJS(savedProgress)}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
      />

      {/* Top bar */}
      <View
        style={[
          styles.topBar,
          { height: barHeight, paddingTop: barTop },
        ]}
      >
        <View style={styles.topBarContent}>
          <Pressable
            onPress={handleBack}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.5 }]}
          >
            <Feather name="chevron-down" size={22} color={Colors.light.text} />
          </Pressable>

          <Text style={styles.feedTitle} numberOfLines={1}>
            {article.feedTitle}
          </Text>

          <View style={styles.actions}>
            <Pressable
              onPress={openHomepage}
              hitSlop={8}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.5 }]}
            >
              <Feather name="log-in" size={18} color={Colors.light.textSecondary} />
            </Pressable>
            <Pressable
              onPress={openInBrowser}
              hitSlop={8}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.5 }]}
            >
              <Feather name="external-link" size={18} color={Colors.light.textSecondary} />
            </Pressable>
          </View>
        </View>

        {/* Reading progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  webview: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.light.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  topBarContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  feedTitle: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.accent,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
  },
  progressTrack: {
    height: 2,
    backgroundColor: Colors.light.border,
  },
  progressFill: {
    height: 2,
    backgroundColor: Colors.light.accent,
  },
  errorText: {
    padding: 24,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
});
