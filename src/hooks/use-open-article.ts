import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback } from "react";

import { Article, useFeeds } from "@/context/FeedsContext";

export function useOpenArticle() {
  const router = useRouter();
  const { markArticleOpened } = useFeeds();
  return useCallback(
    (article: Article) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (article.url) {
        markArticleOpened(article.id);
        router.push({ pathname: "/article", params: { id: article.id } });
      }
    },
    [router, markArticleOpened]
  );
}
