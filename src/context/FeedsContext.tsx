import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { Platform } from "react-native";

export interface Feed {
  id: string;
  url: string;
  title: string;
  description?: string;
  imageUrl?: string;
  lastFetched?: number;
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
  isRead: boolean;
  author?: string;
}

interface FeedsContextValue {
  feeds: Feed[];
  articles: Article[];
  isRefreshing: boolean;
  addFeed: (url: string) => Promise<{ success: boolean; error?: string }>;
  removeFeed: (id: string) => void;
  markAsRead: (articleId: string) => void;
  markAllAsRead: (feedId?: string) => void;
  refreshFeeds: () => Promise<void>;
  refreshFeed: (feedId: string) => Promise<void>;
  unreadCount: number;
}

const FeedsContext = createContext<FeedsContextValue | null>(null);

const FEEDS_KEY = "rss_feeds_v2";
const ARTICLES_KEY = "rss_articles_v2";
const READ_KEY = "rss_read_ids_v2";

function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function extractImageFromContent(html: string): string | undefined {
  const match = html?.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1];
}

function stripHtml(html: string): string {
  return html?.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ").trim() ?? "";
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
}

async function fetchFeedData(
  url: string
): Promise<{ feed: Partial<Feed>; articles: Partial<Article>[] } | null> {
  try {
    let xml: string;

    if (Platform.OS === "web") {
      // Browser needs a CORS proxy
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const response = await fetchWithTimeout(proxyUrl, 15000);
      if (!response.ok) throw new Error(`Network error: ${response.status}`);
      const data = await response.json();
      xml = data.contents;
    } else {
      // React Native fetches directly — no CORS restriction on device
      const response = await fetchWithTimeout(url, 15000);
      if (!response.ok) throw new Error(`Network error: ${response.status}`);
      xml = await response.text();
    }

    if (!xml) throw new Error("Empty response");

    const isAtom = xml.includes("<feed");
    const isRss = xml.includes("<rss") || xml.includes("<channel");
    if (!isAtom && !isRss) throw new Error("Not a valid RSS/Atom feed");

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

      const publishedAt = pubDate ? new Date(pubDate).getTime() : Date.now();

      return {
        id: generateId(),
        title: title || "Untitled",
        url: link,
        description: description?.slice(0, 300),
        imageUrl: imageUrl || undefined,
        publishedAt: isNaN(publishedAt) ? Date.now() : publishedAt,
        author: author || undefined,
        isRead: false,
      };
    });

    return {
      feed: {
        title: feedTitle || new URL(url).hostname,
        description: feedDesc || undefined,
      },
      articles,
    };
  } catch (e) {
    console.error("Feed fetch error:", e);
    return null;
  }
}

export function FeedsProvider({ children }: { children: ReactNode }) {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [feedsStr, articlesStr, readStr] = await Promise.all([
          AsyncStorage.getItem(FEEDS_KEY),
          AsyncStorage.getItem(ARTICLES_KEY),
          AsyncStorage.getItem(READ_KEY),
        ]);

        const loadedFeeds: Feed[] = feedsStr ? JSON.parse(feedsStr) : [];
        const loadedArticles: Article[] = articlesStr ? JSON.parse(articlesStr) : [];
        const loadedReadIds: Set<string> = readStr
          ? new Set(JSON.parse(readStr))
          : new Set();

        setFeeds(loadedFeeds);
        setArticles(loadedArticles);
        setReadIds(loadedReadIds);

        // Background refresh using loaded data directly (avoids stale closure)
        if (loadedFeeds.length > 0) {
          setIsRefreshing(true);
          await Promise.all(
            loadedFeeds.map(async (feed) => {
              const result = await fetchFeedData(feed.url);
              if (!result) return;

              const existingUrls = new Set(
                loadedArticles.filter((a) => a.feedId === feed.id).map((a) => a.url)
              );

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
                }));

              const updatedFeed = {
                ...feed,
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

          const sorted = [...loadedArticles].sort(
            (a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0)
          );
          setFeeds([...loadedFeeds]);
          setArticles(sorted);
          await AsyncStorage.setItem(FEEDS_KEY, JSON.stringify(loadedFeeds));
          await AsyncStorage.setItem(ARTICLES_KEY, JSON.stringify(sorted));
          setIsRefreshing(false);
        }
      } catch (e) {
        console.error("Load error:", e);
        setIsRefreshing(false);
      }
    };
    load();
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
        url: trimmed,
        title: result.feed.title ?? new URL(trimmed).hostname,
        description: result.feed.description,
        lastFetched: Date.now(),
      };

      const newArticles: Article[] = result.articles.map((a) => ({
        ...a,
        id: generateId(),
        feedId: newFeed.id,
        feedTitle: newFeed.title,
        feedUrl: trimmed,
        title: a.title ?? "Untitled",
        url: a.url ?? "",
        isRead: false,
        publishedAt: a.publishedAt ?? Date.now(),
      }));

      const updatedFeeds = [...feeds, newFeed];
      const updatedArticles = [...articles, ...newArticles].sort(
        (a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0)
      );

      await saveFeeds(updatedFeeds);
      await saveArticles(updatedArticles);
      return { success: true };
    },
    [feeds, articles, saveFeeds, saveArticles]
  );

  const removeFeed = useCallback(
    async (id: string) => {
      const updatedFeeds = feeds.filter((f) => f.id !== id);
      const updatedArticles = articles.filter((a) => a.feedId !== id);
      await saveFeeds(updatedFeeds);
      await saveArticles(updatedArticles);
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
        const existingUrls = new Set(
          currentArticles.filter((a) => a.feedId === feedId).map((a) => a.url)
        );
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
          }));
        const sorted = [...newArticles, ...currentArticles].sort(
          (a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0)
        );
        AsyncStorage.setItem(ARTICLES_KEY, JSON.stringify(sorted));
        return sorted;
      });

      setFeeds((currentFeeds) => {
        const updated = currentFeeds.map((f) =>
          f.id === feedId
            ? { ...f, title: result.feed.title ?? f.title, lastFetched: Date.now() }
            : f
        );
        AsyncStorage.setItem(FEEDS_KEY, JSON.stringify(updated));
        return updated;
      });
    },
    [feeds]
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
          const existingUrls = new Set(
            merged.filter((a) => a.feedId === feed.id).map((a) => a.url)
          );
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
            }));
          merged = [...newArticles, ...merged];
        }
        const sorted = merged.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
        AsyncStorage.setItem(ARTICLES_KEY, JSON.stringify(sorted));
        return sorted;
      });

      setFeeds((currentFeeds) => {
        const updated = currentFeeds.map((f) => {
          const match = results.find((r) => r.feed.id === f.id);
          if (!match?.result) return f;
          return { ...f, title: match.result.feed.title ?? f.title, lastFetched: Date.now() };
        });
        AsyncStorage.setItem(FEEDS_KEY, JSON.stringify(updated));
        return updated;
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [feeds]);

  const articlesWithState = articles.map((a) => ({
    ...a,
    isRead: readIds.has(a.id),
  }));

  const unreadCount = articlesWithState.filter((a) => !a.isRead).length;

  return (
    <FeedsContext.Provider
      value={{
        feeds,
        articles: articlesWithState,
        isRefreshing,
        addFeed,
        removeFeed,
        markAsRead,
        markAllAsRead,
        refreshFeeds,
        refreshFeed,
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
