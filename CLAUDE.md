# RSS Reader

A personal RSS reader built for Android. Client-only — no backend, no sync, no accounts. The intended audience is one person (the developer).

## Stack

- **React Native + Expo** (~55) with Expo Router (file-based routing)
- **TypeScript** (strict mode), path alias `@/` → `src/`
- **pnpm** v10 as package manager
- All state persisted locally via **AsyncStorage** — no database

## Key directories

```
reader/
  src/app/          # Expo Router pages
  src/components/   # UI components
  src/context/      # FeedsContext — single source of truth for feeds + articles
  src/hooks/        # Theme, color scheme
  src/constants/    # Color palette
```

## Running the app

```bash
npx expo run:android  
```

**APK builds** happen automatically via GitHub Actions on push to `main`. Requires `EXPO_TOKEN` repo secret. The APK is published as a GitHub release artifact.

## Storage schema

Three AsyncStorage keys — no migrations exist, so changing key names drops all data:

| Key | Contents |
|-----|----------|
| `rss_feeds_v2` | Array of `Feed` objects |
| `rss_articles_v2` | Array of `Article` objects |
| `rss_read_ids_v2` | Array of article ID strings |

Read state is stored separately from articles to allow fast mark-as-read without rewriting the full article list.

## Non-obvious decisions

- **No backend.** Feed fetching happens on-device. On web, a CORS proxy (`api.allorigins.win`) is used since native platforms can fetch RSS directly. Don't introduce a server unless there's a strong reason.
- **Single context for all state.** `FeedsContext` handles feeds, articles, and read state. `@tanstack/react-query` is installed but intentionally barely used — the app's data needs are simple enough that a QueryClient would add overhead.
- **Background refresh on launch.** The app loads from storage immediately, then silently refreshes all feeds. Don't break this pattern — instant display of cached content is intentional.
- **Articles are capped at 50 per feed** to keep memory reasonable.
- **Portrait-only.** Don't add landscape support.

## Known gaps (don't fix unless asked)

- Theme switching infrastructure is partially wired up but not complete (`use-theme.ts` references a missing `@/constants/theme` file)
- No tests exist
- The README is the default Expo template — it's not project docs
- Article list has no pagination; this is acceptable at current scale

## Pushing Changes

- Before pushing changes:
  - increase the app version
  - run `pnpm install` to update the lock file