import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { useCallback } from "react";

import { Article, useFeeds } from "@/context/FeedsContext";

export function useOpenArticle() {
  const { markAsRead, refreshFeeds } = useFeeds();
  return useCallback(
    async (article: Article) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      markAsRead(article.id);
      if (article.url) {
        await WebBrowser.openBrowserAsync(article.url, { createTask: false });
        refreshFeeds();
      }
    },
    [markAsRead, refreshFeeds]
  );
}
