import AsyncStorage from "@react-native-async-storage/async-storage";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

import Colors from "@/constants/colors";
import type { Article, Feed } from "@/context/FeedsContext";

export const PREFETCH_CACHE_KEY = "rss_prefetch_cache_v1";

export type PrefetchEntry = {
  readerHtml?: string;
  rawHtml?: string;
  failed?: boolean;
  ts: number;
};

export type PrefetchCache = Record<string, PrefetchEntry>;

// ---------- HTML building (shared with article.tsx) ----------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildReaderHtml(
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
    background: ${Colors.light.card};
    color: ${Colors.light.text};
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 18px;
    line-height: 1.75;
    padding: 24px 20px 120px;
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

async function tryExtract(html: string, url: string): Promise<string | null> {
  const { document } = parseHTML(html);
  const reader = new Readability(document as unknown as Document);
  const result = reader.parse();
  if (!result?.content || result.content.length < 100) return null;
  return buildReaderHtml(result.title ?? "", result.byline ?? null, result.content, url);
}

export async function fetchAndExtract(
  url: string,
  storedContent?: string
): Promise<string | null> {
  if (storedContent) {
    const fromStored = await tryExtract(storedContent, url);
    if (fromStored) return fromStored;
    // Stored RSS content was too sparse (teaser/excerpt) — fall through to URL fetch
  }
  try {
    const response = await fetch(url);
    const html = await response.text();
    return tryExtract(html, url);
  } catch {
    return null;
  }
}

// ---------- Cache helpers ----------

export async function loadPrefetchCache(): Promise<PrefetchCache> {
  try {
    const str = await AsyncStorage.getItem(PREFETCH_CACHE_KEY);
    return str ? JSON.parse(str) : {};
  } catch {
    return {};
  }
}

// ---------- Background prefetch ----------

const PREFETCH_TIMEOUT_MS = 12000;
const PREFETCH_DELAY_MS = 200;

export async function runPrefetch(articles: Article[], feeds: Feed[]): Promise<void> {
  const feedMap = new Map(feeds.map((f) => [f.id, f]));

  const cache = await loadPrefetchCache();

  // Remove entries for articles that are no longer in the list
  const activeIds = new Set(articles.map((a) => a.id));
  let staleRemoved = false;
  for (const id of Object.keys(cache)) {
    if (!activeIds.has(id)) {
      delete cache[id];
      staleRemoved = true;
    }
  }
  if (staleRemoved) {
    await AsyncStorage.setItem(PREFETCH_CACHE_KEY, JSON.stringify(cache));
  }

  // Prioritise articles with stored content (free — no network needed) then the rest
  const toPrefetch = articles
    .filter((a) => !a.dismissed && a.url && !cache[a.id])
    .sort((a, b) => (b.content ? 1 : 0) - (a.content ? 1 : 0));

  for (const article of toPrefetch) {
    const feed = feedMap.get(article.feedId);
    const isLiveMode = feed?.readerMode === false;

    try {
      if (isLiveMode) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PREFETCH_TIMEOUT_MS);
        try {
          const res = await fetch(article.url, {
            signal: controller.signal,
            headers: { "User-Agent": "Mozilla/5.0 (compatible; RSS Reader)" },
          });
          const rawHtml = await res.text();
          cache[article.id] = { rawHtml, ts: Date.now() };
        } finally {
          clearTimeout(timer);
        }
      } else {
        const readerHtml = await Promise.race([
          fetchAndExtract(article.url, article.content),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), PREFETCH_TIMEOUT_MS)
          ),
        ]);
        cache[article.id] = readerHtml
          ? { readerHtml, ts: Date.now() }
          : { failed: true, ts: Date.now() };
      }
    } catch {
      cache[article.id] = { failed: true, ts: Date.now() };
    }

    await AsyncStorage.setItem(PREFETCH_CACHE_KEY, JSON.stringify(cache));
    await new Promise((r) => setTimeout(r, PREFETCH_DELAY_MS));
  }
}
