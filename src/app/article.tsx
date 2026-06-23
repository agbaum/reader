import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import ReAnimated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { ArticleDebugSheet } from "@/components/ArticleDebugSheet";
import Colors from "@/constants/colors";
import { useFeeds } from "@/context/FeedsContext";
import { setLastOpenedArticle } from "@/lib/last-opened-article";
import {
  fetchAndExtract,
  loadPrefetchCache,
} from "@/utils/article-prefetch";

// Injected into the page to report scroll progress and detect overscroll-to-close.
function buildInjectedJS(restoreProgress: number, articleUrl: string, isReaderMode: boolean): string {
  return `
    (function() {
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
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'scroll', progress: progress }));
      }
      window.addEventListener('scroll', sendProgress, { passive: true });

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

export default function ArticleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { feeds, articles, markAsRead, saveScrollProgress, saveReaderScrollProgress, saveArticleMode, articleModeMap } = useFeeds();

  const article = articles.find((a) => a.id === id);
  const feed = article ? feeds.find((f) => f.id === article.feedId) : undefined;
  const feedReaderMode = feed?.readerMode ?? true;

  const savedLiveProgress = article?.scrollProgress ?? 0;
  const savedReaderProgress = article?.readerScrollProgress ?? 0;

  const savedMode = id !== undefined ? articleModeMap[id] : undefined;
  const initialLiveMode = savedMode !== undefined ? savedMode : !feedReaderMode;

  const [readerHtml, setReaderHtml] = useState<string | null>(null);
  const [cachedRawHtml, setCachedRawHtml] = useState<string | null>(null);
  const [readerLoading, setReaderLoading] = useState(true);
  const [liveMode, setLiveMode] = useState(initialLiveMode);
  const [debugOpen, setDebugOpen] = useState(false);

  const readerProgressRef = useRef(savedReaderProgress);
  const liveProgressRef = useRef(savedLiveProgress);
  const initialProgress = initialLiveMode ? savedLiveProgress : savedReaderProgress;
  const progressAnim = useRef(new Animated.Value(initialProgress)).current;
  const [trackWidth, setTrackWidth] = useState(0);
  const hasMarkedRead = useRef(article?.isRead ?? false);
  const isOnOriginalPage = useRef(true);

  const [atBottom, setAtBottom] = useState(false);
  const atBottomSV = useSharedValue(false);

  const { height: screenHeight } = useWindowDimensions();
  const dragY = useSharedValue(screenHeight);
  const isClosingRef = useRef(false);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
  }));

  useEffect(() => {
    dragY.value = withTiming(0, { duration: 220 });
  }, []);

  const isReaderMode = !liveMode;

  // Ensure highlight fires on the article card regardless of how we exit
  // (X button and overscroll also call this, but a double-write is harmless)
  useEffect(() => {
    return () => {
      if (id) setLastOpenedArticle(id, hasMarkedRead.current);
    };
  }, []);

  useEffect(() => {
    if (!article) return;
    let cancelled = false;

    setReaderLoading(true);
    setReaderHtml(null);
    setCachedRawHtml(null);

    const run = async () => {
      // Check prefetch cache first (fast local read)
      try {
        const cache = await loadPrefetchCache();
        if (cancelled) return;
        const entry = cache[article.id];
        if (entry?.readerHtml) {
          setReaderHtml(entry.readerHtml);
          setReaderLoading(false);
          return;
        }
        if (entry?.rawHtml) {
          setCachedRawHtml(entry.rawHtml);
          setReaderLoading(false);
          return;
        }
      } catch {}

      if (cancelled) return;

      // Fall back to on-demand fetch
      try {
        const html = await fetchAndExtract(article.url, article.content);
        if (cancelled) return;
        if (html) {
          setReaderHtml(html);
        } else {
          setLiveMode(true);
        }
      } catch {
        if (!cancelled) setLiveMode(true);
      } finally {
        if (!cancelled) setReaderLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [article?.url]);

  const handleNavigationStateChange = useCallback(
    ({ url }: { url: string }) => {
      if (isReaderMode) return;
      if (url && article?.url && url !== article.url) {
        isOnOriginalPage.current = false;
      }
    },
    [article?.url, isReaderMode]
  );

  const handleShouldStartLoadWithRequest = useCallback(
    ({ url }: { url: string }) => {
      if (!url || url === "about:blank") return true;
      if (isReaderMode) {
        // Reader mode renders static HTML — any navigation is a link tap
        WebBrowser.openBrowserAsync(url, { createTask: false });
        return false;
      }
      // Live mode: allow loading the article's own URL, intercept everything else
      if (article?.url && url !== article.url) {
        WebBrowser.openBrowserAsync(url, { createTask: false });
        return false;
      }
      return true;
    },
    [article?.url, isReaderMode]
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        if (data.type !== "scroll" || !id || !isOnOriginalPage.current) return;

        const p: number = Math.min(1, Math.max(0, data.progress));

        if (isReaderMode) {
          readerProgressRef.current = p;
          saveReaderScrollProgress(id, p);
        } else {
          liveProgressRef.current = p;
          saveScrollProgress(id, p);
        }

        Animated.timing(progressAnim, {
          toValue: p,
          duration: 100,
          useNativeDriver: true,
        }).start();

        const maxProgress = Math.max(readerProgressRef.current, liveProgressRef.current);
        if (!hasMarkedRead.current && maxProgress >= 0.9) {
          hasMarkedRead.current = true;
          markAsRead(id);
        }

        const newAtBottom = p >= 0.99;
        atBottomSV.value = newAtBottom;
        setAtBottom(newAtBottom);
      } catch {
        // ignore malformed messages
      }
    },
    [id, isReaderMode, markAsRead, saveScrollProgress, saveReaderScrollProgress, progressAnim]
  );

  const openInBrowser = useCallback(() => {
    if (article?.url) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      WebBrowser.openBrowserAsync(article.url, { createTask: false });
    }
  }, [article?.url]);

  const openDebug = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDebugOpen(true);
  }, []);

  const handleBack = useCallback(() => {
    if (id) setLastOpenedArticle(id, hasMarkedRead.current);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, [router, id]);

  const dismiss = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    dragY.value = withTiming(-screenHeight, { duration: 220 }, (finished) => {
      if (finished) runOnJS(handleBack)();
    });
  }, [dragY, screenHeight, handleBack]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      dismiss();
      return true;
    });
    return () => sub.remove();
  }, [dismiss]);

  const dismissGesture = Gesture.Pan()
    .activeOffsetY([-8, Number.MAX_VALUE])
    .enabled(atBottom)
    .onUpdate((e) => {
      if (atBottomSV.value && e.translationY < 0) dragY.value = e.translationY;
    })
    .onEnd((e) => {
      if (atBottomSV.value && (e.translationY < -100 || (e.translationY < -50 && e.velocityY < -500))) {
        runOnJS(dismiss)();
      } else {
        dragY.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  const toggleMode = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    isOnOriginalPage.current = true;
    setLiveMode((prev) => {
      const next = !prev;
      const nextIsReaderMode = prev;
      const nextProgress = nextIsReaderMode ? readerProgressRef.current : liveProgressRef.current;
      progressAnim.setValue(nextProgress);
      if (id) saveArticleMode(id, next);
      return next;
    });
  }, [progressAnim, id, saveArticleMode]);

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
    ? cachedRawHtml
      ? { html: cachedRawHtml, baseUrl: article.url }
      : { uri: article.url }
    : readerHtml
      ? { html: readerHtml }
      : null;

  const savedProgress = isReaderMode ? savedReaderProgress : savedLiveProgress;
  const injectedJS = buildInjectedJS(savedProgress, article.url, isReaderMode);

  return (
    <GestureDetector gesture={dismissGesture}>
    <ReAnimated.View style={[{ flex: 1 }, animatedStyle]}>
    <View style={styles.container}>
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
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
        />
      ) : null}

      {/* Bottom card edge */}
      <View style={styles.bottomEdgeShade} pointerEvents="none" />
      <View style={styles.bottomEdgeCurve} pointerEvents="none" />

      {/* Top bar */}
      <View
        style={[
          styles.topBar,
          { height: barHeight, paddingTop: barTop },
        ]}
      >
        <View style={styles.topBarContent}>
          <Pressable
            onPress={dismiss}
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
            <Pressable
              onPress={openDebug}
              hitSlop={8}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.5 }]}
            >
              <Feather name="help-circle" size={18} color={Colors.light.textSecondary} />
            </Pressable>
          </View>
        </View>

        {/* Reading progress bar */}
        <View
          style={styles.progressTrack}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        >
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: trackWidth,
                transform: [
                  {
                    translateX: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-trackWidth / 2, 0],
                    }),
                  },
                  { scaleX: progressAnim },
                ],
              },
            ]}
          />
        </View>
      </View>

      <ArticleDebugSheet
        article={debugOpen ? article : null}
        onClose={() => setDebugOpen(false)}
      />
    </View>
    </ReAnimated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.card,
  },
  webview: {
    flex: 1,
    backgroundColor: Colors.light.card,
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
    backgroundColor: Colors.light.card,
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
  bottomEdgeShade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 24,
    backgroundColor: Colors.light.background,
  },
  bottomEdgeCurve: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 8,
    height: 24,
    backgroundColor: Colors.light.card,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
});
