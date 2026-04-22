import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { AppState } from "react-native";

export type ExpiryBucket = "6h" | "18h" | "3d" | "7d";

export const EXPIRY_DURATIONS: Record<ExpiryBucket, number> = {
  "6h":  6  * 60 * 60 * 1000,
  "18h": 18 * 60 * 60 * 1000,
  "3d":  3  * 24 * 60 * 60 * 1000,
  "7d":  7  * 24 * 60 * 60 * 1000,
};

export const EXPIRY_LABELS: Record<ExpiryBucket, string> = {
  "6h":  "6 hours",
  "18h": "18 hours",
  "3d":  "3 days",
  "7d":  "1 week",
};

export interface Feed {
  id: string;
  url: string;
  title: string;
  customTitle?: string;
  description?: string;
  imageUrl?: string;
  lastFetched?: number;
  expiryBucket?: ExpiryBucket;
  readerMode?: boolean;
}

export interface Article {
  id: string;
  feedId: string;
  feedTitle: string;
  feedUrl: string;
  title: string;
  description?: string;
  url: string;
  imageUrl?: string;
  publishedAt?: number;
  fetchedAt?: number;
  isRead: boolean;
  dismissed?: boolean;
  scrollProgress?: number;
  readerScrollProgress?: number;
  lastOpened?: number;
  author?: string;
  expiryBucket?: ExpiryBucket;
}

interface FeedsContextValue {
  feeds: Feed[];
  articles: Article[];
  isRefreshing: boolean;
  addFeed: (url: string) => Promise<{ success: boolean; error?: string }>;
  addMultipleFeeds: (urls: string[]) => Promise<{ success: number; failed: number; failedUrls: string[] }>;
  removeFeed: (id: string) => void;
  markAsRead: (articleId: string) => void;
  markAllAsRead: (feedId?: string) => void;
  refreshFeeds: () => Promise<void>;
  refreshFeed: (feedId: string) => Promise<void>;
  updateFeedExpiry: (feedId: string, bucket: ExpiryBucket) => Promise<void>;
  updateFeedReaderMode: (feedId: string, enabled: boolean) => Promise<void>;
  renameFeed: (feedId: string, customTitle: string) => Promise<void>;
  resetArticleExpiry: (articleId: string) => Promise<void>;
  dismissArticle: (articleId: string) => void;
  saveScrollProgress: (articleId: string, progress: number) => void;
  saveReaderScrollProgress: (articleId: string, progress: number) => void;
  saveArticleMode: (articleId: string, isLiveMode: boolean) => void;
  markArticleOpened: (articleId: string) => void;
  articleModeMap: Record<string, boolean>;
  unreadCount: number;
}

const FeedsContext = createContext<FeedsContextValue | null>(null);

const FEEDS_KEY = "rss_feeds_v2";
const ARTICLES_KEY = "rss_articles_v2";
const READ_KEY = "rss_read_ids_v2";
const PROGRESS_KEY = "rss_progress_v2";
const READER_PROGRESS_KEY = "rss_reader_progress_v2";
const DISMISSED_URLS_KEY = "rss_dismissed_urls_v3";
const ARTICLE_MODES_KEY = "rss_article_modes_v1";
// Time-based cutoff for entries from deleted feeds (active feeds use per-feed minimum instead)
const MAX_DISMISSED_AGE = 14 * 24 * 60 * 60 * 1000;
const MAX_DISMISSED_PER_FEED = 50; // matches article cap per feed

type DismissedEntry = { feedId: string; ts: number };

function pruneDismissedUrls(
  map: Map<string, DismissedEntry>,
  activeFeedIds: Set<string>
): Map<string, DismissedEntry> {
  const now = Date.now();
  const byFeed = new Map<string, Array<[string, DismissedEntry]>>();
  for (const [url, entry] of map) {
    const list = byFeed.get(entry.feedId) ?? [];
    list.push([url, entry]);
    byFeed.set(entry.feedId, list);
  }
  const result = new Map<string, DismissedEntry>();
  for (const [feedId, entries] of byFeed) {
    entries.sort((a, b) => b[1].ts - a[1].ts);
    const isActive = activeFeedIds.has(feedId);
    for (let i = 0; i < entries.length; i++) {
      const [url, entry] = entries[i];
      if ((isActive && i < MAX_DISMISSED_PER_FEED) || now - entry.ts < MAX_DISMISSED_AGE) {
        result.set(url, entry);
      }
    }
  }
  return result;
}

function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function extractImageFromContent(html: string): string | undefined {
  const match = html?.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1];
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&rsquo;|&lsquo;/g, "\u2019")
    .replace(/&rdquo;|&ldquo;/g, "\u201C")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&hellip;/g, "\u2026")
    .replace(/&[a-zA-Z][a-zA-Z0-9]*;/g, ""); // drop any remaining unknown named entities
}

function stripHtml(html: string): string {
  return decodeEntities(html?.replace(/<[^>]*>/g, "") ?? "").trim();
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RSS Reader)",
        Accept: "application/rss+xml, application/atom+xml, */*",
        "Accept-Encoding": "gzip, deflate",
      },
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

// Named timezone abbreviations JS can't parse natively, mapped to UTC offsets
const TZ_OFFSETS: Record<string, string> = {
  EDT: "-0400", CDT: "-0500", MDT: "-0600", PDT: "-0700",
  EST: "-0500", CST: "-0600", MST: "-0700", PST: "-0800",
  GMT: "+0000", UT:  "+0000", UTC: "+0000",
};

function parsePubDate(str: string): number {
  if (!str) return Date.now();

  // Try direct parse (handles RFC 822 with numeric tz and ISO 8601)
  let ts = new Date(str).getTime();
  if (!isNaN(ts)) return ts;

  // Replace named timezone abbreviations with numeric offsets
  const normalized = str.replace(
    /\b([A-Z]{2,5})\s*$/,
    (_, tz) => TZ_OFFSETS[tz] ?? "+0000"
  );
  ts = new Date(normalized).getTime();
  if (!isNaN(ts)) return ts;

  // Handle "YYYY-MM-DD HH:MM:SS" (space instead of T separator)
  ts = new Date(str.replace(" ", "T")).getTime();
  if (!isNaN(ts)) return ts;

  return Date.now();
}

async function fetchFeedData(
  url: string
): Promise<{ feed: Partial<Feed>; articles: Partial<Article>[]; canonicalUrl: string } | null> {
  try {
    let xml: string;
    let redirectUrl = url;

    const response = await fetchWithTimeout(url, 15000);
    if (!response.ok) throw new Error(`Network error: ${response.status}`);
    redirectUrl = response.url || url; // final URL after any HTTP redirects
    xml = await response.text();

    if (!xml) throw new Error("Empty response");

    const isAtom = xml.includes("<feed");
    const isRss = xml.includes("<rss") || xml.includes("<channel");
    const isSitemap = xml.includes("<urlset") || xml.includes("<sitemap");
    if (!isAtom && !isRss) {
      if (isSitemap) {
        console.warn(`Skipping sitemap URL: ${url}`);
        return null;
      }
      // Log first 200 chars to debug what was actually returned
      const preview = xml.substring(0, 200);
      console.error(`Invalid feed format from ${url}: ${preview}`);
      throw new Error("Not a valid RSS/Atom feed");
    }

    const getTagContent = (text: string, tag: string): string => {
      const patterns = [
        new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i"),
        new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"),
      ];
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) return match[1].trim();
      }
      return "";
    };

    const getAttr = (text: string, tag: string, attr: string): string => {
      const pattern = new RegExp(`<${tag}[^>]+${attr}=["']([^"']+)["'][^>]*>`, "i");
      return text.match(pattern)?.[1] ?? "";
    };

    let feedTitle = "";
    let feedDesc = "";
    let itemsRaw: string[] = [];

    if (isAtom) {
      // Only parse feed-level metadata from the section before the first <entry>
      const feedHeader = xml.split(/<entry[\s>]/i)[0] ?? xml;
      feedTitle = stripHtml(getTagContent(feedHeader, "title"));
      feedDesc = stripHtml(getTagContent(feedHeader, "subtitle"));
      const entryMatches = xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
      itemsRaw = entryMatches;
    } else {
      const channelMatch = xml.match(/<channel>([\s\S]*?)<\/channel>/i) ?? [, xml];
      const channelContent = channelMatch[1] ?? xml;
      // Only parse feed-level metadata from the section before the first <item>
      const channelHeader = channelContent.split(/<item[\s>]/i)[0] ?? channelContent;
      feedTitle = stripHtml(getTagContent(channelHeader, "title"));
      feedDesc = stripHtml(getTagContent(channelHeader, "description"));
      const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
      itemsRaw = itemMatches;
    }

    const articles: Partial<Article>[] = itemsRaw.slice(0, 50).map((item) => {
      let title = "";
      let link = "";
      let description = "";
      let pubDate = "";
      let author = "";
      let imageUrl = "";

      if (isAtom) {
        title = stripHtml(getTagContent(item, "title"));
        link = getAttr(item, "link", "href") || getTagContent(item, "link");
        description = getTagContent(item, "summary") || getTagContent(item, "content");
        pubDate = getTagContent(item, "published") || getTagContent(item, "updated");
        author = getTagContent(item, "name") || getTagContent(item, "author");
        imageUrl = extractImageFromContent(description) ?? "";
        description = stripHtml(description);
      } else {
        title = stripHtml(getTagContent(item, "title"));
        link = getTagContent(item, "link");
        if (!link) link = getAttr(item, "link", "href");
        description =
          getTagContent(item, "description") ||
          getTagContent(item, "content:encoded");
        pubDate = getTagContent(item, "pubDate") || getTagContent(item, "dc:date");
        author = getTagContent(item, "author") || getTagContent(item, "dc:creator");

        const mediaUrlMatch = item.match(/<media:content[^>]+url=["']([^"']+)["']/i);
        const enclosureMatch = item.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image/i);
        imageUrl =
          mediaUrlMatch?.[1] ??
          enclosureMatch?.[1] ??
          extractImageFromContent(getTagContent(item, "content:encoded")) ??
          extractImageFromContent(description) ??
          "";

        description = stripHtml(description);
      }

      const publishedAt = parsePubDate(pubDate);

      return {
        id: generateId(),
        title: title || "Untitled",
        url: link,
        description: description?.slice(0, 300),
        imageUrl: imageUrl || undefined,
        publishedAt,
        author: author || undefined,
        isRead: false,
      };
    });

    // Prefer atom:link rel="self" as the canonical URL, fall back to redirect URL
    const xmlHeader = xml.split(/<(?:item|entry)[\s>]/i)[0] ?? xml;
    const selfLink =
      xmlHeader.match(/<(?:atom:)?link[^>]+rel=["']self["'][^>]+href=["']([^"']+)["']/i)?.[1] ??
      xmlHeader.match(/<(?:atom:)?link[^>]+href=["']([^"']+)["'][^>]+rel=["']self["']/i)?.[1];
    const canonicalUrl = selfLink ?? redirectUrl;

    return {
      feed: {
        title: feedTitle || new URL(url).hostname,
        description: feedDesc || undefined,
      },
      articles,
      canonicalUrl,
    };
  } catch (e) {
    // If an http:// URL failed, retry with https://
    if (url.startsWith("http://")) {
      const httpsUrl = "https://" + url.slice(7);
      console.log(`Retrying with HTTPS: ${httpsUrl}`);
      return fetchFeedData(httpsUrl);
    }
    console.error("Feed fetch error:", e);
    return null;
  }
}

// Read/in-progress articles are kept in the dismissed state for this long after their normal expiry,
// so they continue to appear in the Recently Read panel.
const RECENTLY_READ_GRACE_PERIOD = 7 * 24 * 60 * 60 * 1000;

function expireArticles(
  articles: Article[],
  feeds: Feed[],
  readIds: Set<string>,
  progressMap: Record<string, number>,
  readerProgressMap: Record<string, number>
): { kept: Article[]; expired: Array<{ url: string; feedId: string }>; mutated: boolean } {
  const feedMap = new Map(feeds.map((f) => [f.id, f]));
  const kept: Article[] = [];
  const expired: Array<{ url: string; feedId: string }> = [];
  let mutated = false;
  const now = Date.now();
  for (const article of articles) {
    const feed = feedMap.get(article.feedId);
    if (!feed) {
      if (article.url) expired.push({ url: article.url, feedId: article.feedId });
      mutated = true;
      continue;
    }
    const duration = EXPIRY_DURATIONS[feed.expiryBucket ?? "3d"];
    const age = now - (article.fetchedAt ?? article.publishedAt ?? 0);
    if (age < duration) {
      kept.push(article);
    } else if (article.dismissed) {
      // Already dismissed (by user or a prior expiry run) — keep through grace period then fully remove
      if (age < duration + RECENTLY_READ_GRACE_PERIOD) {
        kept.push(article);
      } else {
        if (article.url) expired.push({ url: article.url, feedId: article.feedId });
        mutated = true;
      }
    } else {
      const wasEngaged =
        readIds.has(article.id) ||
        (progressMap[article.id] ?? 0) > 0 ||
        (readerProgressMap[article.id] ?? 0) > 0;
      if (wasEngaged) {
        // Expire from Today but keep for Recently Read; URL cached only on full removal
        kept.push({ ...article, dismissed: true });
        mutated = true;
      } else {
        if (article.url) expired.push({ url: article.url, feedId: article.feedId });
        mutated = true;
      }
    }
  }
  return { kept, expired, mutated };
}

export function FeedsProvider({ children }: { children: ReactNode }) {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [readerProgressMap, setReaderProgressMap] = useState<Record<string, number>>({});
  const [articleModeMap, setArticleModeMap] = useState<Record<string, boolean>>({});
  const dismissedUrlsRef = useRef<Map<string, DismissedEntry>>(new Map());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const initialLoadDone = useRef(false);

  // Always-current refs used by the expiry interval (avoids stale closures)
  const feedsRef = useRef(feeds);
  feedsRef.current = feeds;
  const readIdsRef = useRef(readIds);
  readIdsRef.current = readIds;
  const progressMapRef = useRef(progressMap);
  progressMapRef.current = progressMap;
  const readerProgressMapRef = useRef(readerProgressMap);
  readerProgressMapRef.current = readerProgressMap;

  useEffect(() => {
    const load = async () => {
      try {
        const [feedsStr, articlesStr, readStr, progressStr, readerProgressStr, dismissedStr, articleModesStr] = await Promise.all([
          AsyncStorage.getItem(FEEDS_KEY),
          AsyncStorage.getItem(ARTICLES_KEY),
          AsyncStorage.getItem(READ_KEY),
          AsyncStorage.getItem(PROGRESS_KEY),
          AsyncStorage.getItem(READER_PROGRESS_KEY),
          AsyncStorage.getItem(DISMISSED_URLS_KEY),
          AsyncStorage.getItem(ARTICLE_MODES_KEY),
        ]);

        const loadedFeeds: Feed[] = feedsStr ? JSON.parse(feedsStr) : [];
        const loadedArticles: Article[] = articlesStr ? JSON.parse(articlesStr) : [];
        const loadedReadIds: Set<string> = readStr
          ? new Set(JSON.parse(readStr))
          : new Set();
        const loadedProgress: Record<string, number> = progressStr
          ? JSON.parse(progressStr)
          : {};
        const loadedReaderProgress: Record<string, number> = readerProgressStr
          ? JSON.parse(readerProgressStr)
          : {};

        const rawDismissed: [string, DismissedEntry][] = dismissedStr ? JSON.parse(dismissedStr) : [];
        const loadedActiveFeedIds = new Set(loadedFeeds.map((f) => f.id));
        const prunedDismissed = pruneDismissedUrls(new Map(rawDismissed), loadedActiveFeedIds);
        dismissedUrlsRef.current = prunedDismissed;
        if (prunedDismissed.size !== rawDismissed.length) {
          await AsyncStorage.setItem(DISMISSED_URLS_KEY, JSON.stringify([...prunedDismissed.entries()]));
        }

        const loadedArticleModes: Record<string, boolean> = articleModesStr ? JSON.parse(articleModesStr) : {};

        setFeeds(loadedFeeds);
        setArticles(loadedArticles);
        setReadIds(loadedReadIds);
        setProgressMap(loadedProgress);
        setReaderProgressMap(loadedReaderProgress);
        setArticleModeMap(loadedArticleModes);

        // Background refresh using loaded data directly (avoids stale closure)
        if (loadedFeeds.length > 0) {
          setIsRefreshing(true);
          await Promise.all(
            loadedFeeds.map(async (feed) => {
              const result = await fetchFeedData(feed.url);
              if (!result) return;

              const existingUrls = new Set([
                ...loadedArticles.filter((a) => a.feedId === feed.id).map((a) => a.url),
                ...dismissedUrlsRef.current.keys(),
              ]);

              const newArticles: Article[] = result.articles
                .filter((a) => !existingUrls.has(a.url ?? ""))
                .map((a) => ({
                  ...a,
                  id: generateId(),
                  feedId: feed.id,
                  feedTitle: result.feed.title ?? feed.title,
                  feedUrl: feed.url,
                  title: a.title ?? "Untitled",
                  url: a.url ?? "",
                  isRead: false,
                  publishedAt: a.publishedAt ?? Date.now(),
                  fetchedAt: Date.now(),
                }));

              const updatedFeed = {
                ...feed,
                url: result.canonicalUrl,
                title: result.feed.title ?? feed.title,
                lastFetched: Date.now(),
              };

              loadedFeeds.splice(
                loadedFeeds.findIndex((f) => f.id === feed.id),
                1,
                updatedFeed
              );
              loadedArticles.unshift(...newArticles);
            })
          );

          const { kept: sorted, expired } = expireArticles(
            [...loadedArticles].sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0)),
            loadedFeeds,
            loadedReadIds,
            loadedProgress,
            loadedReaderProgress
          );

          if (expired.length > 0) {
            const ts = Date.now();
            for (const { url, feedId } of expired) {
              if (url) dismissedUrlsRef.current.set(url, { feedId, ts });
            }
            await AsyncStorage.setItem(DISMISSED_URLS_KEY, JSON.stringify([...dismissedUrlsRef.current.entries()]));
          }

          setFeeds([...loadedFeeds]);
          setArticles(sorted);
          await AsyncStorage.setItem(FEEDS_KEY, JSON.stringify(loadedFeeds));
          await AsyncStorage.setItem(ARTICLES_KEY, JSON.stringify(sorted));
          setIsRefreshing(false);
        }
      } catch (e) {
        console.error("Load error:", e);
        setIsRefreshing(false);
      } finally {
        initialLoadDone.current = true;
      }
    };
    load();
  }, []);

  // Prune expired articles every minute while the app is in the foreground
  useEffect(() => {
    const id = setInterval(() => {
      setArticles((currentArticles) => {
        const { kept, expired, mutated } = expireArticles(
          currentArticles,
          feedsRef.current,
          readIdsRef.current,
          progressMapRef.current,
          readerProgressMapRef.current
        );
        if (!mutated) return currentArticles;
        if (expired.length > 0) {
          const ts = Date.now();
          for (const { url, feedId } of expired) {
            if (url) dismissedUrlsRef.current.set(url, { feedId, ts });
          }
          AsyncStorage.setItem(DISMISSED_URLS_KEY, JSON.stringify([...dismissedUrlsRef.current.entries()]));
        }
        AsyncStorage.setItem(ARTICLES_KEY, JSON.stringify(kept));
        return kept;
      });
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const saveFeeds = useCallback(async (f: Feed[]) => {
    setFeeds(f);
    await AsyncStorage.setItem(FEEDS_KEY, JSON.stringify(f));
  }, []);

  const saveArticles = useCallback(async (a: Article[]) => {
    setArticles(a);
    await AsyncStorage.setItem(ARTICLES_KEY, JSON.stringify(a));
  }, []);

  const saveReadIds = useCallback(async (ids: Set<string>) => {
    setReadIds(ids);
    await AsyncStorage.setItem(READ_KEY, JSON.stringify([...ids]));
  }, []);

  const saveScrollProgress = useCallback((articleId: string, progress: number) => {
    setProgressMap((current) => {
      const updated = { ...current, [articleId]: progress };
      AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const saveReaderScrollProgress = useCallback((articleId: string, progress: number) => {
    setReaderProgressMap((current) => {
      const updated = { ...current, [articleId]: progress };
      AsyncStorage.setItem(READER_PROGRESS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const markArticleOpened = useCallback((articleId: string) => {
    setArticles((current) => {
      const updated = current.map((a) =>
        a.id === articleId ? { ...a, lastOpened: Date.now() } : a
      );
      AsyncStorage.setItem(ARTICLES_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const saveArticleMode = useCallback((articleId: string, isLiveMode: boolean) => {
    setArticleModeMap((current) => {
      const updated = { ...current, [articleId]: isLiveMode };
      AsyncStorage.setItem(ARTICLE_MODES_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const saveDismissedUrls = useCallback(async (m: Map<string, DismissedEntry>) => {
    dismissedUrlsRef.current = m;
    await AsyncStorage.setItem(DISMISSED_URLS_KEY, JSON.stringify([...m.entries()]));
  }, []);

  const addFeed = useCallback(
    async (url: string): Promise<{ success: boolean; error?: string }> => {
      const trimmed = url.trim();
      if (!trimmed) return { success: false, error: "Please enter a URL" };
      if (feeds.find((f) => f.url === trimmed))
        return { success: false, error: "Feed already added" };

      const result = await fetchFeedData(trimmed);
      if (!result)
        return { success: false, error: "Could not load feed. Check the URL and try again." };

      const newFeed: Feed = {
        id: generateId(),
        url: result.canonicalUrl,
        title: result.feed.title ?? new URL(result.canonicalUrl).hostname,
        description: result.feed.description,
        lastFetched: Date.now(),
      };

      const newArticles: Article[] = result.articles.map((a) => ({
        ...a,
        id: generateId(),
        feedId: newFeed.id,
        feedTitle: newFeed.title,
        feedUrl: result.canonicalUrl,
        title: a.title ?? "Untitled",
        url: a.url ?? "",
        isRead: false,
        publishedAt: a.publishedAt ?? Date.now(),
        fetchedAt: Date.now(),
      }));

      const updatedFeeds = [...feeds, newFeed];
      const { kept: updatedArticles } = expireArticles(
        [...articles, ...newArticles].sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0)),
        updatedFeeds,
        readIds,
        progressMap,
        readerProgressMap
      );

      await saveFeeds(updatedFeeds);
      await saveArticles(updatedArticles);
      return { success: true };
    },
    [feeds, articles, readIds, progressMap, readerProgressMap, saveFeeds, saveArticles]
  );

  const addMultipleFeeds = useCallback(
    async (urls: string[]): Promise<{ success: number; failed: number; failedUrls: string[] }> => {
      const existingUrls = new Set(feeds.map((f) => f.url));

      // Filter to only new, non-empty, unique URLs before fetching
      const toFetch = [...new Set(urls.map((u) => u.trim()).filter((u) => u && !existingUrls.has(u)))];
      const skipped = urls.length - toFetch.length;

      // Fetch all feeds in parallel
      const results = await Promise.all(
        toFetch.map(async (url) => ({ url, result: await fetchFeedData(url) }))
      );

      let successCount = 0;
      const failedUrls: string[] = [];
      const newFeeds: Feed[] = [];
      let newArticles: Article[] = [];

      for (const { url, result } of results) {
        if (!result) {
          failedUrls.push(url);
          continue;
        }

        const newFeed: Feed = {
          id: generateId(),
          url: result.canonicalUrl,
          title: result.feed.title ?? new URL(result.canonicalUrl).hostname,
          description: result.feed.description,
          lastFetched: Date.now(),
        };

        const feedArticles: Article[] = result.articles.map((a) => ({
          ...a,
          id: generateId(),
          feedId: newFeed.id,
          feedTitle: newFeed.title,
          feedUrl: result.canonicalUrl,
          title: a.title ?? "Untitled",
          url: a.url ?? "",
          isRead: false,
          publishedAt: a.publishedAt ?? Date.now(),
          fetchedAt: Date.now(),
        }));

        newFeeds.push(newFeed);
        newArticles = [...feedArticles, ...newArticles];
        successCount++;
      }

      const allFeeds = [...feeds, ...newFeeds];
      const { kept: sorted } = expireArticles(
        [...newArticles, ...articles].sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0)),
        allFeeds,
        readIds,
        progressMap,
        readerProgressMap
      );
      await saveFeeds(allFeeds);
      await saveArticles(sorted);
      return { success: successCount, failed: failedUrls.length, failedUrls };
    },
    [feeds, articles, readIds, progressMap, readerProgressMap, saveFeeds, saveArticles]
  );

  const removeFeed = useCallback(
    async (id: string) => {
      const updatedFeeds = feeds.filter((f) => f.id !== id);
      const updatedArticles = articles.filter((a) => a.feedId !== id);
      await saveFeeds(updatedFeeds);
      await saveArticles(updatedArticles);
      let changed = false;
      for (const [url, entry] of dismissedUrlsRef.current) {
        if (entry.feedId === id) {
          dismissedUrlsRef.current.delete(url);
          changed = true;
        }
      }
      if (changed) {
        await AsyncStorage.setItem(DISMISSED_URLS_KEY, JSON.stringify([...dismissedUrlsRef.current.entries()]));
      }
    },
    [feeds, articles, saveFeeds, saveArticles]
  );

  const markAsRead = useCallback(
    async (articleId: string) => {
      const newIds = new Set(readIds);
      newIds.add(articleId);
      await saveReadIds(newIds);
    },
    [readIds, saveReadIds]
  );

  const markAllAsRead = useCallback(
    async (feedId?: string) => {
      const newIds = new Set(readIds);
      const toMark = feedId ? articles.filter((a) => a.feedId === feedId) : articles;
      toMark.forEach((a) => newIds.add(a.id));
      await saveReadIds(newIds);
    },
    [readIds, articles, saveReadIds]
  );

  const refreshFeed = useCallback(
    async (feedId: string) => {
      const feed = feeds.find((f) => f.id === feedId);
      if (!feed) return;

      const result = await fetchFeedData(feed.url);
      if (!result) return;

      // Snapshot current articles to avoid stale state issues
      setArticles((currentArticles) => {
        const existingUrls = new Set([
          ...currentArticles.filter((a) => a.feedId === feedId).map((a) => a.url),
          ...dismissedUrlsRef.current.keys(),
        ]);
        const newArticles: Article[] = result.articles
          .filter((a) => !existingUrls.has(a.url ?? ""))
          .map((a) => ({
            ...a,
            id: generateId(),
            feedId: feed.id,
            feedTitle: result.feed.title ?? feed.title,
            feedUrl: feed.url,
            title: a.title ?? "Untitled",
            url: a.url ?? "",
            isRead: false,
            publishedAt: a.publishedAt ?? Date.now(),
            fetchedAt: Date.now(),
          }));
        const { kept: sorted, expired } = expireArticles(
          [...newArticles, ...currentArticles].sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0)),
          feeds,
          readIds,
          progressMap,
          readerProgressMap
        );
        AsyncStorage.setItem(ARTICLES_KEY, JSON.stringify(sorted));
        if (expired.length > 0) {
          const ts = Date.now();
          for (const { url, feedId } of expired) {
            if (url) dismissedUrlsRef.current.set(url, { feedId, ts });
          }
          AsyncStorage.setItem(DISMISSED_URLS_KEY, JSON.stringify([...dismissedUrlsRef.current.entries()]));
        }
        return sorted;
      });

      setFeeds((currentFeeds) => {
        const updated = currentFeeds.map((f) =>
          f.id === feedId
            ? { ...f, url: result.canonicalUrl, title: result.feed.title ?? f.title, lastFetched: Date.now() }
            : f
        );
        AsyncStorage.setItem(FEEDS_KEY, JSON.stringify(updated));
        return updated;
      });
    },
    [feeds, readIds, progressMap, readerProgressMap]
  );

  const refreshFeeds = useCallback(async () => {
    if (feeds.length === 0) return;
    setIsRefreshing(true);

    try {
      // Fetch all feeds in parallel, then do a single merged save
      const results = await Promise.all(
        feeds.map(async (feed) => ({ feed, result: await fetchFeedData(feed.url) }))
      );

      setArticles((currentArticles) => {
        let merged = [...currentArticles];
        for (const { feed, result } of results) {
          if (!result) continue;
          const existingUrls = new Set([
            ...merged.filter((a) => a.feedId === feed.id).map((a) => a.url),
            ...dismissedUrlsRef.current.keys(),
          ]);
          const newArticles: Article[] = result.articles
            .filter((a) => !existingUrls.has(a.url ?? ""))
            .map((a) => ({
              ...a,
              id: generateId(),
              feedId: feed.id,
              feedTitle: result.feed.title ?? feed.title,
              feedUrl: feed.url,
              title: a.title ?? "Untitled",
              url: a.url ?? "",
              isRead: false,
              publishedAt: a.publishedAt ?? Date.now(),
              fetchedAt: Date.now(),
            }));
          merged = [...newArticles, ...merged];
        }
        const { kept: sorted, expired } = expireArticles(
          merged.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0)),
          feeds,
          readIds,
          progressMap,
          readerProgressMap
        );
        AsyncStorage.setItem(ARTICLES_KEY, JSON.stringify(sorted));
        const ts = Date.now();
        for (const { url, feedId } of expired) {
          if (url) dismissedUrlsRef.current.set(url, { feedId, ts });
        }
        const activeFeedIds = new Set(feeds.map((f) => f.id));
        const pruned = pruneDismissedUrls(dismissedUrlsRef.current, activeFeedIds);
        if (pruned.size !== dismissedUrlsRef.current.size || expired.length > 0) {
          dismissedUrlsRef.current = pruned;
          AsyncStorage.setItem(DISMISSED_URLS_KEY, JSON.stringify([...pruned.entries()]));
        }
        return sorted;
      });

      setFeeds((currentFeeds) => {
        const updated = currentFeeds.map((f) => {
          const match = results.find((r) => r.feed.id === f.id);
          if (!match?.result) return f;
          return { ...f, url: match.result.canonicalUrl, title: match.result.feed.title ?? f.title, lastFetched: Date.now() };
        });
        AsyncStorage.setItem(FEEDS_KEY, JSON.stringify(updated));
        return updated;
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [feeds, readIds, progressMap, readerProgressMap]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && initialLoadDone.current) {
        refreshFeeds();
      }
    });
    return () => subscription.remove();
  }, [refreshFeeds]);

  const updateFeedExpiry = useCallback(
    async (feedId: string, bucket: ExpiryBucket) => {
      const updated = feeds.map((f) =>
        f.id === feedId ? { ...f, expiryBucket: bucket } : f
      );
      await saveFeeds(updated);
    },
    [feeds, saveFeeds]
  );

  const updateFeedReaderMode = useCallback(
    async (feedId: string, enabled: boolean) => {
      const updated = feeds.map((f) =>
        f.id === feedId ? { ...f, readerMode: enabled } : f
      );
      await saveFeeds(updated);
    },
    [feeds, saveFeeds]
  );

  const renameFeed = useCallback(
    async (feedId: string, customTitle: string) => {
      const updated = feeds.map((f) =>
        f.id === feedId ? { ...f, customTitle: customTitle.trim() || undefined } : f
      );
      await saveFeeds(updated);
    },
    [feeds, saveFeeds]
  );

  const dismissArticle = useCallback((articleId: string) => {
    setArticles((current) => {
      const article = current.find((a) => a.id === articleId);
      const wasEngaged =
        readIds.has(articleId) ||
        (progressMap[articleId] ?? 0) > 0 ||
        (readerProgressMap[articleId] ?? 0) > 0;
      // Keep engaged articles (read or in-progress) so they remain in Recently Read;
      // fully-unread dismissed articles can be removed entirely.
      const updated = wasEngaged
        ? current.map((a) => (a.id === articleId ? { ...a, dismissed: true } : a))
        : current.filter((a) => a.id !== articleId);
      AsyncStorage.setItem(ARTICLES_KEY, JSON.stringify(updated));
      if (article?.url) {
        dismissedUrlsRef.current.set(article.url, { feedId: article.feedId, ts: Date.now() });
        AsyncStorage.setItem(DISMISSED_URLS_KEY, JSON.stringify([...dismissedUrlsRef.current.entries()]));
      }
      return updated;
    });
  }, [readIds, progressMap, readerProgressMap]);

  const resetArticleExpiry = useCallback(async (articleId: string) => {
    setArticles((current) => {
      const updated = current.map((a) =>
        a.id === articleId ? { ...a, fetchedAt: Date.now() } : a
      );
      AsyncStorage.setItem(ARTICLES_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const feedMap = new Map(feeds.map((f) => [f.id, f]));
  const articlesWithState = articles.map((a) => {
    const feed = feedMap.get(a.feedId);
    return {
      ...a,
      feedTitle: feed?.customTitle ?? a.feedTitle,
      isRead: readIds.has(a.id),
      scrollProgress: progressMap[a.id],
      readerScrollProgress: readerProgressMap[a.id],
      expiryBucket: feed?.expiryBucket ?? "3d",
    };
  });

  const unreadCount = articlesWithState.filter((a) => !a.isRead).length;

  return (
    <FeedsContext.Provider
      value={{
        feeds,
        articles: articlesWithState,
        isRefreshing,
        addFeed,
        addMultipleFeeds,
        removeFeed,
        markAsRead,
        markAllAsRead,
        refreshFeeds,
        refreshFeed,
        updateFeedExpiry,
        updateFeedReaderMode,
        renameFeed,
        resetArticleExpiry,
        dismissArticle,
        saveScrollProgress,
        saveReaderScrollProgress,
        saveArticleMode,
        markArticleOpened,
        articleModeMap,
        unreadCount,
      }}
    >
      {children}
    </FeedsContext.Provider>
  );
}

export function useFeeds() {
  const ctx = useContext(FeedsContext);
  if (!ctx) throw new Error("useFeeds must be used within FeedsProvider");
  return ctx;
}
