import { Readability } from "@mozilla/readability";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { parseHTML } from "linkedom";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, WebViewMessageEvent } from "react-native-webview";

import Colors from "@/constants/colors";
import { useFeeds } from "@/context/FeedsContext";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildReaderHtml(
  title: string,
  byline: string | null,
  content: string,
  articleUrl: string
): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<base href="${escapeHtml(articleUrl)}">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: ${Colors.light.background};
    color: ${Colors.light.text};
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 18px;
    line-height: 1.75;
    padding: 24px 20px 80px;
    max-width: 680px;
    margin: 0 auto;
  }
  h1.reader-title {
    font-size: 24px;
    line-height: 1.3;
    margin-bottom: 10px;
    font-family: Georgia, serif;
    font-weight: bold;
  }
  .reader-byline {
    color: ${Colors.light.textSecondary};
    font-size: 14px;
    margin-bottom: 28px;
    font-family: -apple-system, sans-serif;
    border-bottom: 1px solid ${Colors.light.border};
    padding-bottom: 20px;
  }
  h2 { font-size: 20px; margin: 28px 0 12px; line-height: 1.3; }
  h3 { font-size: 18px; margin: 24px 0 10px; line-height: 1.3; }
  h4, h5, h6 { font-size: 16px; margin: 20px 0 8px; }
  p { margin-bottom: 18px; }
  a { color: ${Colors.light.accent}; text-decoration: none; }
  img { max-width: 100%; height: auto; border-radius: 4px; margin: 16px 0; display: block; }
  blockquote {
    border-left: 3px solid ${Colors.light.border};
    padding-left: 16px;
    color: ${Colors.light.textSecondary};
    margin: 20px 0;
    font-style: italic;
  }
  pre {
    background: ${Colors.light.surfaceAlt};
    padding: 16px;
    border-radius: 6px;
    overflow-x: auto;
    margin-bottom: 18px;
  }
  code {
    font-family: 'Courier New', monospace;
    font-size: 14px;
    background: ${Colors.light.surfaceAlt};
    padding: 2px 5px;
    border-radius: 3px;
  }
  pre code { background: none; padding: 0; font-size: 13px; }
  ul, ol { padding-left: 24px; margin-bottom: 18px; }
  li { margin-bottom: 6px; }
  figure { margin: 20px 0; }
  figcaption {
    font-size: 13px;
    color: ${Colors.light.textSecondary};
    margin-top: 8px;
    text-align: center;
    font-family: -apple-system, sans-serif;
  }
  hr { border: none; border-top: 1px solid ${Colors.light.border}; margin: 28px 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 15px; }
  th, td { border: 1px solid ${Colors.light.border}; padding: 8px 10px; }
  th { background: ${Colors.light.surfaceAlt}; font-weight: 600; }
  .hidden, [hidden] { display: none !important; }
</style>
</head>
<body>
  <h1 class="reader-title">${escapeHtml(title)}</h1>
  ${byline ? `<div class="reader-byline">${escapeHtml(byline)}</div>` : ""}
  ${content}
</body>
</html>`;
}

// Injected into the page to report scroll progress and detect overscroll-to-close.
function buildInjectedJS(restoreProgress: number, articleUrl: string, isReaderMode: boolean): string {
  return `
    (function() {
      var atBottom = false;
      var touchStartY = 0;
      var dismissed = false;
      ${restoreProgress > 0 ? "var restored = false;" : ""}

      function getDocHeight() {
        return Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        ) - window.innerHeight;
      }

      function sendProgress() {
        var h = getDocHeight();
        var progress = h > 0 ? window.scrollY / h : 0;
        atBottom = h <= 0 || window.scrollY >= h - 2;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'scroll', progress: progress }));
      }
      window.addEventListener('scroll', sendProgress, { passive: true });

      // Overscroll-to-close: swipe up past threshold when already at bottom
      window.addEventListener('touchstart', function(e) {
        touchStartY = e.touches[0].clientY;
      }, { passive: true });

      window.addEventListener('touchmove', function(e) {
        if (dismissed || !atBottom) return;
        var dy = touchStartY - e.touches[0].clientY;
        if (dy > 60) {
          dismissed = true;
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'dismiss' }));
        }
      }, { passive: true });

      ${
        restoreProgress > 0
          ? isReaderMode
            ? `
      function tryRestore() {
        if (restored) return;
        var h = getDocHeight();
        if (h > 100) {
          window.scrollTo(0, ${restoreProgress} * h);
          restored = true;
        }
      }
      document.addEventListener('DOMContentLoaded', tryRestore);
      setTimeout(tryRestore, 300);
      setTimeout(tryRestore, 1000);
      `
            : `
      function tryRestore() {
        if (restored) return;
        if (window.location.href !== ${JSON.stringify(articleUrl)}) return;
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

async function fetchAndExtract(url: string): Promise<string | null> {
  const response = await fetch(url);
  const html = await response.text();
  const { document } = parseHTML(html);
  const reader = new Readability(document as unknown as Document);
  const result = reader.parse();
  if (!result) return null;
  return buildReaderHtml(result.title ?? "", result.byline ?? null, result.content ?? "", url);
}

export default function ArticleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const { feeds, articles, markAsRead, saveScrollProgress, saveReaderScrollProgress } = useFeeds();

  const article = articles.find((a) => a.id === id);
  const feed = article ? feeds.find((f) => f.id === article.feedId) : undefined;
  const feedReaderMode = feed?.readerMode ?? true;

  const savedLiveProgress = article?.scrollProgress ?? 0;
  const savedReaderProgress = article?.readerScrollProgress ?? 0;

  const [readerHtml, setReaderHtml] = useState<string | null>(null);
  const [readerLoading, setReaderLoading] = useState(true);
  const [liveMode, setLiveMode] = useState(!feedReaderMode);

  const readerProgressRef = useRef(savedReaderProgress);
  const liveProgressRef = useRef(savedLiveProgress);
  const maxProgress = Math.max(savedReaderProgress, savedLiveProgress);
  const progressAnim = useRef(new Animated.Value(maxProgress)).current;
  const containerTranslateY = useRef(new Animated.Value(0)).current;
  const [progressWidth, setProgressWidth] = useState(maxProgress);
  const hasMarkedRead = useRef(article?.isRead ?? false);
  const isOnOriginalPage = useRef(true);
  const isDismissing = useRef(false);

  const isReaderMode = !liveMode;

  useEffect(() => {
    if (!article) return;
    let cancelled = false;

    setReaderLoading(true);
    setReaderHtml(null);

    fetchAndExtract(article.url)
      .then((html) => {
        if (cancelled) return;
        if (html) {
          setReaderHtml(html);
        } else {
          // Readability couldn't parse — fall back to live
          setLiveMode(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLiveMode(true);
      })
      .finally(() => {
        if (!cancelled) setReaderLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [article?.url]);

  const dismissUp = useCallback(() => {
    if (isDismissing.current) return;
    isDismissing.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(containerTranslateY, {
      toValue: -screenHeight,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      router.back();
    });
  }, [containerTranslateY, screenHeight, router]);

  const handleNavigationStateChange = useCallback(
    ({ url }: { url: string }) => {
      // In reader mode, we never navigate away — always treat as original page
      if (isReaderMode) return;
      if (url && article?.url && url !== article.url) {
        isOnOriginalPage.current = false;
      }
    },
    [article?.url, isReaderMode]
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        if (data.type === "dismiss") {
          dismissUp();
          return;
        }

        if (data.type !== "scroll" || !id || !isOnOriginalPage.current) return;

        const p: number = Math.min(1, Math.max(0, data.progress));

        if (isReaderMode) {
          readerProgressRef.current = p;
          saveReaderScrollProgress(id, p);
        } else {
          liveProgressRef.current = p;
          saveScrollProgress(id, p);
        }

        const barProgress = Math.max(readerProgressRef.current, liveProgressRef.current);
        Animated.timing(progressAnim, {
          toValue: barProgress,
          duration: 100,
          useNativeDriver: false,
        }).start();
        setProgressWidth(barProgress);

        if (!hasMarkedRead.current && barProgress >= 0.9) {
          hasMarkedRead.current = true;
          markAsRead(id);
        }
      } catch {
        // ignore malformed messages
      }
    },
    [id, isReaderMode, markAsRead, saveScrollProgress, saveReaderScrollProgress, progressAnim, dismissUp]
  );

  const openInBrowser = useCallback(() => {
    if (article?.url) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      WebBrowser.openBrowserAsync(article.url, { createTask: false });
    }
  }, [article?.url]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, [router]);

  const toggleMode = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    isOnOriginalPage.current = true;
    setLiveMode((prev) => !prev);
  }, []);

  if (!article) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Article not found.</Text>
      </View>
    );
  }

  const barTop = insets.top;
  const barHeight = barTop + 48;

  const webviewSource = liveMode
    ? { uri: article.url }
    : readerHtml
      ? { html: readerHtml }
      : null;

  const savedProgress = isReaderMode ? savedReaderProgress : savedLiveProgress;
  const injectedJS = buildInjectedJS(savedProgress, article.url, isReaderMode);

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY: containerTranslateY }] }]}
    >
      {readerLoading && !liveMode ? (
        <View style={[styles.loadingContainer, { marginTop: barHeight }]}>
          <ActivityIndicator size="small" color={Colors.light.textSecondary} />
        </View>
      ) : webviewSource ? (
        <WebView
          key={liveMode ? "live" : "reader"}
          source={webviewSource}
          style={[styles.webview, { marginTop: barHeight }]}
          applicationNameForUserAgent="Chrome/124.0.0.0 Mobile Safari/537.36"
          injectedJavaScript={injectedJS}
          onMessage={handleMessage}
          onNavigationStateChange={handleNavigationStateChange}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
        />
      ) : null}

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
            <Feather name="x" size={22} color={Colors.light.text} />
          </Pressable>

          <Text style={styles.feedTitle} numberOfLines={1}>
            {article.feedTitle}
          </Text>

          <View style={styles.actions}>
            {!readerLoading && readerHtml && (
              <Pressable
                onPress={toggleMode}
                hitSlop={8}
                style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.5 }]}
              >
                <Feather
                  name={liveMode ? "book-open" : "globe"}
                  size={18}
                  color={liveMode ? Colors.light.textSecondary : Colors.light.accent}
                />
              </Pressable>
            )}
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
    </Animated.View>
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
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
