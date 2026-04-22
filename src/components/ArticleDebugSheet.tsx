import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { Article, EXPIRY_DURATIONS } from "@/context/FeedsContext";

interface Props {
  article: Article | null;
  onClose: () => void;
}

function fmt(ts?: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function relativeTime(ts?: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function expiryStatus(article: Article): string {
  if (!article.fetchedAt || !article.expiryBucket) return "—";
  const duration = EXPIRY_DURATIONS[article.expiryBucket];
  const grace = article.isRead ? 7 * 24 * 60 * 60 * 1000 : 0;
  const expiresAt = article.fetchedAt + duration + grace;
  const diff = expiresAt - Date.now();
  if (diff <= 0) {
    const hrs = Math.floor(Math.abs(diff) / 3600000);
    return `expired ${hrs}h ago${grace ? " (grace active)" : ""}`;
  }
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return `in ${hrs}h${grace ? " (incl. read grace)" : ""}`;
  const days = Math.floor(hrs / 24);
  return `in ${days}d${grace ? " (incl. read grace)" : ""}`;
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, mono && styles.fieldValueMono]} selectable>
        {value}
      </Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

export function ArticleDebugSheet({ article, onClose }: Props) {
  const insets = useSafeAreaInsets();

  // Keep content visible during the close animation
  const lastArticleRef = React.useRef(article);
  if (article) lastArticleRef.current = article;
  const a = lastArticleRef.current;

  if (!a) return null;

  const progress = Math.max(a.scrollProgress ?? 0, a.readerScrollProgress ?? 0);

  return (
    <Modal
      visible={!!article}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={2}>{a.title}</Text>
            <Text style={styles.subtitle}>Article debug</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={22} color={Colors.light.textSecondary} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <Section title="State">
            <Field label="Read" value={a.isRead ? "yes" : "no"} />
            <Field label="Dismissed" value={a.dismissed ? "yes" : "no"} />
            <Field label="Expiry bucket" value={a.expiryBucket ?? "—"} />
            <Field label="Expires" value={expiryStatus(a)} />
            {!!progress && (
              <Field label="Read progress" value={`${Math.round(progress * 100)}%${a.readerScrollProgress ? " (reader)" : " (live)"}`} />
            )}
          </Section>

          <Section title="Timestamps">
            <Field label="Published" value={a.publishedAt ? `${fmt(a.publishedAt)}  ·  ${relativeTime(a.publishedAt)}` : "—"} />
            <Field label="Fetched" value={a.fetchedAt ? `${fmt(a.fetchedAt)}  ·  ${relativeTime(a.fetchedAt)}` : "—"} />
            {!!a.lastOpened && (
              <Field label="Last opened" value={`${fmt(a.lastOpened)}  ·  ${relativeTime(a.lastOpened)}`} />
            )}
          </Section>

          <Section title="Content">
            <Field label="Title" value={a.title} />
            {!!a.author && <Field label="Author" value={a.author} />}
            {!!a.description && <Field label="Description" value={a.description} />}
            {!!a.imageUrl && <Field label="Image URL" value={a.imageUrl} mono />}
          </Section>

          <Section title="URLs & IDs">
            <Field label="Article URL" value={a.url} mono />
            <Field label="Feed URL" value={a.feedUrl} mono />
            <Field label="Article ID" value={a.id} mono />
            <Field label="Feed ID" value={a.feedId} mono />
          </Section>
        </ScrollView>
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
    marginBottom: 24,
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    lineHeight: 24,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 3,
  },
  scroll: {
    gap: 20,
    paddingBottom: 8,
  },
  section: {
    gap: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  sectionCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
  field: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
    gap: 2,
  },
  fieldLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  fieldValue: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
    lineHeight: 20,
  },
  fieldValueMono: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
});
