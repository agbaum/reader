import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import {
  ExpiryBucket,
  EXPIRY_DURATIONS,
  EXPIRY_LABELS,
  Feed,
  useFeeds,
} from "@/context/FeedsContext";

const BUCKETS = Object.keys(EXPIRY_DURATIONS) as ExpiryBucket[];

interface Props {
  feed: Feed | null;
  onClose: () => void;
}

export function FeedSettingsSheet({ feed, onClose }: Props) {
  const { updateFeedExpiry, removeFeed } = useFeeds();
  const insets = useSafeAreaInsets();

  const handleSelectBucket = useCallback(
    async (bucket: ExpiryBucket) => {
      if (!feed) return;
      Haptics.selectionAsync();
      await updateFeedExpiry(feed.id, bucket);
    },
    [feed, updateFeedExpiry]
  );

  const handleRemove = useCallback(() => {
    if (!feed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    removeFeed(feed.id);
    onClose();
  }, [feed, removeFeed, onClose]);

  if (!feed) return null;

  const current = feed.expiryBucket ?? "3d";

  return (
    <Modal
      visible={!!feed}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <View>
            <Text style={styles.title} numberOfLines={1}>{feed.title}</Text>
            <Text style={styles.subtitle}>Feed settings</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={22} color={Colors.light.textSecondary} />
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>Article expiry</Text>
        <Text style={styles.sectionDesc}>
          Articles older than this will be removed on each refresh.
        </Text>

        <View style={styles.buckets}>
          {BUCKETS.map((bucket) => {
            const selected = bucket === current;
            return (
              <Pressable
                key={bucket}
                onPress={() => handleSelectBucket(bucket)}
                style={({ pressed }) => [
                  styles.bucketRow,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.bucketLabel, selected && styles.bucketLabelSelected]}>
                  {EXPIRY_LABELS[bucket]}
                </Text>
                {selected && (
                  <Feather name="check" size={18} color={Colors.light.accent} />
                )}
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={handleRemove}
          style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.7 }]}
        >
          <Feather name="trash-2" size={16} color={Colors.light.danger} />
          <Text style={styles.removeBtnText}>Remove feed</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    paddingHorizontal: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.light.border,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 32,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
    maxWidth: 260,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  sectionDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginBottom: 16,
    lineHeight: 19,
  },
  buckets: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    overflow: "hidden",
  },
  bucketRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  bucketLabel: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
  },
  bucketLabelSelected: {
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.accent,
  },
  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.light.danger,
  },
  removeBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.danger,
  },
});
