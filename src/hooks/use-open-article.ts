import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback } from "react";

import { Article } from "@/context/FeedsContext";

export function useOpenArticle() {
  const router = useRouter();
  return useCallback(
    (article: Article) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (article.url) {
        router.push({ pathname: "/article", params: { id: article.id } });
      }
    },
    [router]
  );
}
