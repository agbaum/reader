# RSS Reader — Design Document

## Overview

A personal, client-only RSS reader for Android. No backend, no sync, no accounts. All state lives on-device in AsyncStorage. Built with React Native + Expo, TypeScript (strict), and Expo Router for file-based navigation.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.83 + Expo 55 |
| Navigation | Expo Router (file-based, typed routes) |
| Language | TypeScript (strict), path alias `@/` → `src/` |
| Animations | React Native Reanimated 4 + Gesture Handler 2 |
| Persistence | AsyncStorage |
| Feed parsing | linkedom (DOM parsing) + custom XML logic |
| Article parsing | @mozilla/readability |
| Package manager | pnpm v10 |

---

## Directory Structure

```
src/
  app/
    _layout.tsx           # Root layout: providers, fonts, stack navigator
    +not-found.tsx        # 404 fallback
    article.tsx           # Article reader (modal)
    (tabs)/
      _layout.tsx         # Tab navigator (tab bar hidden)
      index.tsx           # Today screen (main reading list)
      feeds.tsx           # Feeds management screen
  components/
    AddFeedSheet.tsx      # Add feed / import OPML entry point
    ArticleCard.tsx       # Feed item with swipe gestures + animations
    ArticleDebugSheet.tsx # Dev tool: full article metadata inspector
    ErrorBoundary.tsx     # Class component error boundary
    ErrorFallback.tsx     # Error UI with reload action
    FeedSettingsSheet.tsx # Per-feed config (label, expiry, reader mode)
    FeedsPanel.tsx        # Sidebar-embedded feeds list
    OPMLImportSheet.tsx   # OPML file picker + feed selector
    RecentlyReadPanel.tsx # Sidebar-embedded read history
    Sidebar.tsx           # Animated slide-out navigation panel
  context/
    FeedsContext.tsx      # Single source of truth: feeds, articles, read state
  hooks/
    use-color-scheme.ts   # Re-exports RN useColorScheme
    use-open-article.ts   # Navigate to article with haptics
  constants/
    colors.ts             # Warm beige/brown palette
  lib/
    last-opened-article.ts  # Transient state for return-to-list highlight
  utils/
    article-prefetch.ts     # Shared HTML building + background prefetch cache logic
```

---

## Data Model

### `Feed`

```ts
{
  id: string;
  url: string;
  title: string;
  customTitle?: string;       // User-set label
  description?: string;
  imageUrl?: string;
  expiryBucket: ExpiryBucket; // "6h" | "18h" | "3d" | "7d"
  readerMode: boolean;        // Use Mozilla Readability by default
}
```

### `Article`

```ts
{
  id: string;
  feedId: string;
  url: string;
  title: string;
  description?: string;
  content?: string;           // Raw HTML from feed's <content> / <content:encoded> (≤100KB); used by reader mode to avoid re-fetching the URL
  author?: string;
  imageUrl?: string;
  publishedAt: number;        // Unix ms
  fetchedAt: number;          // Unix ms — expiry clock starts here
  isRead: boolean;             // derived at render time from rss_read_ids_v2
  dismissed?: boolean;
  scrollProgress: number;     // 0–1, live WebView mode — derived from rss_progress_v2
  readerScrollProgress: number; // 0–1, reader mode — derived from rss_reader_progress_v2
  lastReadAt?: number;
}
```

### `ExpiryBucket`

| Value | TTL |
|---|---|
| `"6h"` | 6 hours |
| `"18h"` | 18 hours |
| `"3d"` | 3 days |
| `"7d"` | 7 days |

Articles expire at their TTL regardless of read/progress status. Articles that were read or had scroll progress are not deleted on expiry — they are instead marked `dismissed: true` and kept for an additional 7-day grace period so they remain visible in the Recently Read panel. After `TTL + 7d` they are fully removed.

### AsyncStorage Keys

| Key | Contents |
|---|---|
| `rss_feeds_v2` | `Feed[]` |
| `rss_articles_v2` | `Article[]` |
| `rss_read_ids_v2` | `string[]` — article IDs |
| `rss_progress_v2` | `Record<id, number>` — live scroll progress |
| `rss_reader_progress_v2` | `Record<id, number>` — reader scroll progress |
| `rss_dismissed_urls_v3` | `Record<url, {feedId, ts}>` — per-feed minimum of 50 kept regardless of age; older entries from deleted feeds expire after 14 days |
| `rss_prefetch_cache_v1` | `Record<id, PrefetchEntry>` — pre-fetched article content keyed by article ID |

No migrations exist. Changing a key name drops its data.

---

## State Management: FeedsContext

`FeedsContext` is the single source of truth. All screens and components consume it via `useFeeds()`.

### Initialization sequence

1. Mount: read all AsyncStorage keys in parallel
2. Populate state synchronously (instant display of cached content)
3. Fire `refreshFeeds()` in the background — no loading gate

### Key operations

| Function | Description |
|---|---|
| `fetchFeedData(url)` | HTTP fetch → XML parse (RSS 2.0 + Atom) → Article[] (max 50) |
| `addFeed(url)` | Validate URL, fetch, persist |
| `addMultipleFeeds(urls[])` | Parallel fetch for OPML import |
| `refreshFeeds()` / `refreshFeed(id)` | Re-fetch and merge new articles, enforce expiry |
| `markAsRead(id)` | Add to read-IDs set, persist |
| `markAllAsRead(feedId?)` | Bulk mark by feed or globally |
| `dismissArticle(id)` | Archive; keep if read or has scroll progress (for Recently Read), otherwise discard |
| `resetArticleExpiry(id)` | Reset `fetchedAt` to now |
| `updateFeedExpiry(id, bucket)` | Change retention window |
| `updateFeedReaderMode(id, bool)` | Toggle Readability default |
| `renameFeed(id, label)` | Set `customTitle` |
| `saveScrollProgress(id, pct)` | Persist live mode reading position |
| `saveReaderScrollProgress(id, pct)` | Persist reader mode reading position |

### Automatic behaviors

- **AppState listener**: `refreshFeeds()` called every time app returns to foreground
- **60-second timer**: Expiry pruning runs continuously while app is active
- **Dismissed URL cache**: Prevents re-fetching dismissed/expired articles. Per active feed, the 50 most recent dismissed URLs are kept indefinitely (matching the article cap). Entries from deleted feeds expire after 14 days. Cleared for a feed when that feed is removed.

### Feed fetching details

- Direct HTTP fetch
- Auto-upgrade HTTP → HTTPS on failure
- Image extraction: tries `media:content`, `enclosure`, then inline `<img>` from content
- Date parsing: handles multiple RFC formats + timezone normalization
- Articles capped at 50 per feed

---

## Screens

### Today Screen (`src/app/(tabs)/index.tsx`)

The main reading interface. Shows all unread, non-dismissed, non-expired articles sorted by publish date descending.

**UI structure:**
- Collapsing top bar (hides on scroll down, shows on scroll up, threshold: 4pt delta)
- Menu button → opens `Sidebar`
- Pulsing dot indicator during background refresh
- `FlatList` of `ArticleCard` components
- Pull-to-refresh → `refreshFeeds()`
- Empty state: "All caught up"

**Article list filtering:**
- Exclude `isRead` or `dismissed` articles
- Keep articles currently in the linger-fade animation

**Highlight animation:**
- On return from article screen, `consumeLastOpenedArticle()` returns the last-read article ID
- That card receives a 2.5s highlight pulse

**Dismiss animation:**
- Dismissed articles enter a "lingering" state — kept visible while collapsing to 0 height (380ms) before removal from the list

---

### Feeds Screen (`src/app/(tabs)/feeds.tsx`)

Feed management. Lists all feeds with unread/total counts, expiry bucket, and per-feed refresh button.

- Tap feed row → `FeedSettingsSheet`
- Tap + → `AddFeedSheet`
- Tap refresh icon → `refreshFeed(id)`

---

### Article Screen (`src/app/article.tsx`)

Modal (slide from bottom) for reading articles. Two modes:

#### Reader Mode (default when `feed.readerMode = true`)
1. If `article.content` is set (HTML stored from feed), use that; otherwise fetch HTML from URL
2. Run Mozilla Readability → extract `title`, `byline`, `content`
3. Render extracted HTML in a `WebView` with injected CSS (serif fonts, proper spacing, styled blockquotes/code/images)
4. If Readability fails or returns < 100 chars → auto-fallback to Live Mode

#### Live Mode
- Raw `WebView` pointing directly at article URL
- Full original page styling preserved

**Shared behaviors:**
- Top bar: feed title (uppercase), close (X), mode toggle, open-in-browser
- Progress bar: 2px colored stripe at top showing scroll %
- Scroll tracking: injected JS reports `scrollTop / scrollHeight` back to RN
- Auto-mark read at ≥ 90% combined progress (live + reader)
- Scroll position restored on mount (multiple retry attempts for render timing)
- **Overscroll-to-close**: when already at bottom, swipe up >60pt dismisses with animation
- **Link taps**: intercepted via `onShouldStartLoadWithRequest` — any link opens in an in-app browser overlay (`WebBrowser.openBrowserAsync`) rather than navigating the WebView. The article stays loaded underneath in both modes.

**On exit:**
- Calls `setLastOpenedArticle(id, wasRead)` for return-highlight on Today screen

---

## Components

### ArticleCard

The core list item. Handles display and swipe gestures.

**Display:**
- Left edge: expiry bar (color-coded: red=6h, purple=18h, blue=3d, green=7d)
- Bottom edge: read-progress bar (hidden at 0% or ≥90%)
- Title bold if unread, light if read
- Feed name, relative time, description preview (2 lines), thumbnail, author

**Swipe gesture (horizontal pan):**

| Distance | Behavior |
|---|---|
| < 50pt | Elastic drag, snaps back |
| ≥ 50pt | Haptic + "Reset expiry" action revealed |
| ≥ 110pt | Haptic + switches to "Dismiss" action |
| Release at ≥ 110pt | Triggers action, animates card off-screen |
| Release at 50–110pt | Springs back with haptic |

**Animations:**
- Highlight pulse: 120ms fade in, 1800ms fade out
- Height collapse on dismiss: parallel opacity + height → 0
- Gesture bounce at endpoints

---

### Sidebar

Animated left panel (270px wide).

- Opens with spring (damping=22, stiffness=220, mass=0.8)
- Closes with 200ms timing ease
- Semi-transparent overlay behind panel; tap closes
- Items: Feeds (→ FeedsPanel) and Recently Read (→ RecentlyReadPanel)
- Haptic selection on item tap; 180ms delay for animation before action fires

---

### AddFeedSheet

Bottom sheet for adding feeds.

- URL text input (auto-prepends `https://` if missing)
- Sample feed quick-add buttons (The Verge, Hacker News, NASA, Wired)
- Opens `OPMLImportSheet` for bulk import
- Shows loading indicator during fetch
- Haptic success/error feedback

---

### OPMLImportSheet

OPML file import flow.

1. Document picker (XML/text types)
2. Regex parse `<outline>` elements for `xmlUrl` and `title`
3. Display checklist, all pre-checked
4. Confirm → `addMultipleFeeds(selectedUrls)`
5. Show summary: N added, M failed (with failed URLs)

---

### FeedSettingsSheet

Per-feed configuration panel:
- Custom label input + save
- Reader mode toggle switch
- Expiry bucket radio buttons (6h / 18h / 3d / 7d)
- Remove feed (danger button)

---

### FeedsPanel / RecentlyReadPanel

Sidebar-embedded panels (nested modals). FeedsPanel mirrors the Feeds screen. RecentlyReadPanel shows articles where `isRead || scrollProgress > 0`, sorted by `lastReadAt`.

---

### ArticleDebugSheet

Dev-only tool (long-press on any article card). Shows all article fields: state, timestamps, content, URLs, IDs, expiry status with countdown.

---

## Hooks

| Hook | Purpose |
|---|---|
| `useFeeds()` | Access FeedsContext |
| `useOpenArticle()` | Navigate to `/article?id=…` with haptic |
| `useColorScheme()` | Platform-aware color scheme (hydration-safe on web) |

---

## Cross-Cutting Concerns

### Navigation

Expo Router file-based. Stack: `(tabs)` group + `article` modal. Tab bar is hidden — navigation is handled entirely by the Sidebar. The `feeds` tab has `href: null` (not directly linkable; only reachable through the sidebar).

### Fonts

Inter 400/500/600/700 loaded via `expo-font` in the root layout before rendering.

### Error handling

`ErrorBoundary` (class component) wraps the whole app. On error: shows `ErrorFallback` with a "Try Again" button that calls `reloadAppAsync()`. Dev mode adds a stack trace inspector.

### Theming

`colors.ts` defines a warm earthy palette (warm beige background, burnt-orange accent, dark-brown text). Only light mode is implemented; dark mode is not supported.

---

## Key Flows

### Adding a feed

```
User taps +
  → AddFeedSheet
  → addFeed(url)
    → fetchFeedData: HTTP fetch → XML parse → Article[]
    → Expire articles > TTL
    → Persist feeds + articles to AsyncStorage
  → Haptic + sheet closes
```

### Reading an article

```
User taps ArticleCard
  → useOpenArticle: haptic + navigate to /article?id=…
  → article.tsx mounts
  → Check rss_prefetch_cache_v1 for pre-fetched content
    → cache hit (readerHtml): render immediately, no network
    → cache hit (rawHtml, live-mode feed): render from cached HTML with baseUrl
    → cache miss: fetch URL + run Readability
      → success: render styled HTML in reader WebView
      → fail: fall back to live WebView (uri source)
  → Injected JS tracks scroll %
  → Progress saved on every scroll
  → At ≥ 90%: markAsRead()
  → User closes
    → setLastOpenedArticle(id, wasRead)
    → Today screen highlights the card
```

### Background prefetch

```
After each refreshFeeds() / initial load refresh
  → runPrefetch(articles, feeds)  [fire and forget]
    → Load existing rss_prefetch_cache_v1
    → Remove stale entries (IDs not in current article list)
    → For each non-dismissed article not already cached:
        reader-mode feed → fetch + Readability → store readerHtml
        live-mode feed   → fetch raw HTML → store rawHtml
      (12s timeout per article, 200ms delay between requests)
    → Save to AsyncStorage after each article
```

### Background refresh

```
App becomes active (AppState or launch)
  → refreshFeeds()
    → All feeds fetched in parallel
    → New articles merged
    → Expired articles pruned
    → Dismissed URL cache cleaned (> 14 days for deleted-feed entries)
    → runPrefetch() fired in background
  → Every 60s: expiry check timer fires
```

---

## Build & CI

- `npx expo run:android` for local development
- GitHub Actions builds APK on push to `main`
- Requires `EXPO_TOKEN` repo secret
- APK published as GitHub release artifact
- App version must be bumped before pushing; run `pnpm install` to update lockfile
