import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { useCallback } from "react";

import { Article, useFeeds } from "@/context/FeedsContext";

export function useOpenArticle() {
  const { markAsRead } = useFeeds();
  return useCallback(
    (article: Article) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      markAsRead(article.id);
      if (article.url) {
        WebBrowser.openBrowserAsync(article.url, { createTask: false });
      }
    },
    [markAsRead]
  );
}
