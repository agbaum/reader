import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import Colors from "@/constants/colors";
import { Article, EXPIRY_DURATIONS, ExpiryBucket } from "@/context/FeedsContext";
import { useOpenArticle } from "@/hooks/use-open-article";

const EXPIRY_COLORS: Record<ExpiryBucket, string> = {
  "6h":  "#C97676", // soft red
  "18h": "#9B88C4", // soft purple
  "3d":  "#6E9AB5", // soft blue
  "7d":  "#74A87E", // soft green
};

const RESET_THRESHOLD = 50;
const DISMISS_THRESHOLD = 110;
const RESET_BG = "#C8EDD5";
const DISMISS_BG = "#EDD5C8";
const RESET_FG = "#2E7D4F";

interface ArticleCardProps {
  article: Article;
  onResetExpiry?: (id: string) => void;
  onDismiss?: (id: string) => void;
  onLongPress?: (id: string) => void;
  showFeedName?: boolean;
  showExpiryBar?: boolean;
  highlighted?: boolean;
  fading?: boolean;
  onFadeComplete?: () => void;
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
  onResetExpiry,
  onDismiss,
  onLongPress,
  showFeedName = true,
  showExpiryBar = true,
  highlighted = false,
  fading = false,
  onFadeComplete,
}: ArticleCardProps) {
  const translateX = useSharedValue(0);
  const highlightAnim = useSharedValue(0);
  const fadeAnim = useSharedValue(1);
  const measuredHeight = useSharedValue(0);
  const heightAnim = useSharedValue(-1); // -1 = unconstrained (not collapsing)
  const openArticle = useOpenArticle();

  // Keep a stable ref to onFadeComplete so the Reanimated callback always calls the latest version
  const onFadeCompleteRef = useRef(onFadeComplete);
  useEffect(() => { onFadeCompleteRef.current = onFadeComplete; });
  const callFadeComplete = useCallback(() => { onFadeCompleteRef.current?.(); }, []);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    // Don't update once collapse has started
    if (heightAnim.value < 0) {
      measuredHeight.value = e.nativeEvent.layout.height;
    }
  }, []);

  useEffect(() => {
    if (highlighted) {
      highlightAnim.value = withSequence(
        withTiming(1, { duration: 120 }),
        withTiming(0, { duration: 1800 })
      );
    }
  }, [highlighted]);

  useEffect(() => {
    if (fading) {
      heightAnim.value = measuredHeight.value;
      fadeAnim.value = withTiming(0, { duration: 380 });
      heightAnim.value = withTiming(0, { duration: 380 }, (finished) => {
        if (finished) runOnJS(callFadeComplete)();
      });
    }
  }, [fading]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const expiryPct = useMemo(() => {
    if (!article.fetchedAt || !article.expiryBucket) return 1;
    const duration = EXPIRY_DURATIONS[article.expiryBucket];
    const elapsed = now - article.fetchedAt;
    return Math.max(0, Math.min(1, 1 - elapsed / duration));
  }, [article.fetchedAt, article.expiryBucket, now]);

  const hasCrossedReset = useSharedValue(false);
  const hasCrossedDismiss = useSharedValue(false);

  const handlePress = useCallback(() => {
    openArticle(article);
  }, [article, openArticle]);

  const handleLongPress = useCallback(() => {
    if (!onLongPress) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress(article.id);
  }, [article.id, onLongPress]);

  const hapticLight = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const triggerDismiss = useCallback((id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onDismiss?.(id);
  }, [onDismiss]);

  const triggerResetExpiry = useCallback((id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onResetExpiry?.(id);
  }, [onResetExpiry]);

  const gesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .enabled(!!onDismiss)
    .onBegin(() => {
      hasCrossedReset.value = false;
      hasCrossedDismiss.value = false;
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
      const abs = Math.abs(e.translationX);
      if (abs > RESET_THRESHOLD && !hasCrossedReset.value) {
        hasCrossedReset.value = true;
        runOnJS(hapticLight)();
      } else if (abs <= RESET_THRESHOLD && hasCrossedReset.value) {
        hasCrossedReset.value = false;
      }
      if (abs > DISMISS_THRESHOLD && !hasCrossedDismiss.value) {
        hasCrossedDismiss.value = true;
      } else if (abs <= DISMISS_THRESHOLD && hasCrossedDismiss.value) {
        hasCrossedDismiss.value = false;
      }
    })
    .onEnd((e) => {
      const abs = Math.abs(e.translationX);
      if (abs > DISMISS_THRESHOLD) {
        const direction = e.translationX > 0 ? 1 : -1;
        translateX.value = withTiming(direction * 600, { duration: 220 }, () => {
          runOnJS(triggerDismiss)(article.id);
        });
      } else if (abs > RESET_THRESHOLD) {
        translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
        runOnJS(triggerResetExpiry)(article.id);
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  const collapseStyle = useAnimatedStyle(() => {
    if (heightAnim.value < 0) return {};
    return { height: heightAnim.value, overflow: "hidden" };
  });

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const highlightOverlayStyle = useAnimatedStyle(() => ({
    opacity: highlightAnim.value,
  }));

  const containerFadeStyle = useAnimatedStyle(() => ({
    opacity: fadeAnim.value,
  }));

  const bgStyle = useAnimatedStyle(() => {
    const abs = Math.abs(translateX.value);
    const t = Math.min(Math.max((abs - RESET_THRESHOLD) / (DISMISS_THRESHOLD - RESET_THRESHOLD), 0), 1);
    return {
      backgroundColor: interpolateColor(t, [0, 1], [RESET_BG, DISMISS_BG]),
      opacity: Math.min(abs / RESET_THRESHOLD, 1),
    };
  });

  const actionPositionStyle = useAnimatedStyle(() => ({
    left: translateX.value >= 0 ? 20 : undefined,
    right: translateX.value < 0 ? 20 : undefined,
    flexDirection: translateX.value >= 0 ? "row" : "row-reverse",
  }));

  const resetActionStyle = useAnimatedStyle(() => {
    const abs = Math.abs(translateX.value);
    const t = Math.min(Math.max((abs - RESET_THRESHOLD) / (DISMISS_THRESHOLD - RESET_THRESHOLD), 0), 1);
    return { opacity: 1 - t };
  });

  const dismissActionStyle = useAnimatedStyle(() => {
    const abs = Math.abs(translateX.value);
    const t = Math.min(Math.max((abs - RESET_THRESHOLD) / (DISMISS_THRESHOLD - RESET_THRESHOLD), 0), 1);
    return { opacity: t };
  });

  return (
    <Animated.View style={collapseStyle} onLayout={handleLayout}>
    <Animated.View style={[styles.rowContainer, containerFadeStyle]}>
      <Animated.View style={[styles.dismissBg, bgStyle]}>
        <Animated.View style={[styles.actionContent, actionPositionStyle, resetActionStyle]}>
          <Feather name="rotate-ccw" size={18} color={RESET_FG} />
          <Text style={[styles.actionLabel, { color: RESET_FG }]}>Reset</Text>
        </Animated.View>
        <Animated.View style={[styles.actionContent, actionPositionStyle, dismissActionStyle]}>
          <Feather name="archive" size={18} color={Colors.light.accent} />
          <Text style={[styles.actionLabel, { color: Colors.light.accent }]}>Dismiss</Text>
        </Animated.View>
      </Animated.View>

      <GestureDetector gesture={gesture}>
        <Animated.View style={cardAnimStyle}>
          <Pressable
            onPress={handlePress}
            onLongPress={onLongPress ? handleLongPress : undefined}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            {showExpiryBar && article.expiryBucket && (
              <View style={[styles.expiryTrack, { backgroundColor: EXPIRY_COLORS[article.expiryBucket] + "30" }]}>
                <View style={{ flex: 1 - expiryPct }} />
                <View style={[styles.expiryFill, { flex: expiryPct, backgroundColor: EXPIRY_COLORS[article.expiryBucket] }]} />
              </View>
            )}
            {(() => {
              const p = Math.max(article.scrollProgress ?? 0, article.readerScrollProgress ?? 0);
              return !!p && p < 0.9 ? (
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${p * 100}%` as any }]} />
                </View>
              ) : null;
            })()}
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

            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFillObject, styles.highlightOverlay, highlightOverlayStyle]}
            />
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  rowContainer: {
    marginHorizontal: 16,
    marginVertical: 5,
  },
  dismissBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
  },
  actionContent: {
    position: "absolute",
    top: 0,
    bottom: 0,
    alignItems: "center",
    gap: 8,
  },
  actionLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  card: {
    backgroundColor: Colors.light.card,
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
  expiryTrack: {
    position: "absolute",
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    borderRadius: 1.5,
    overflow: "hidden",
  },
  expiryFill: {},
  highlightOverlay: {
    backgroundColor: Colors.light.accent + "26", // ~15% opacity at full anim value
    borderRadius: 14,
  },
  progressTrack: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: Colors.light.accent + "20",
  },
  progressFill: {
    height: 3,
    borderTopRightRadius: 1.5,
    borderBottomRightRadius: 1.5,
    backgroundColor: Colors.light.accent,
    opacity: 0.65,
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
});
