import type { Article } from "../types";

export function publicArticle(article: Article): Article {
  const { reviewNote: _review, publisherImageUrl: _pendingPhoto, publisherImageCredit: _pendingCredit, ...visible } = article;
  // Full feed text is retained for checking. Readers get the attributed excerpt
  // and generated brief, with a link to the publisher's complete report.
  return article.publisherId && article.aiGenerated ? { ...visible, fullContent: undefined } : visible;
}
