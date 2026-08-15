import NodeCache from "node-cache";

/**
 * Storage seam for scored articles.
 *
 * Phase 1 keeps this in memory. Phase 2 swaps the body for SQLite without
 * changing this interface, so nothing above the data layer has to move:
 *
 *   get(url)      -> scored article | undefined
 *   save(article) -> the saved article
 *   all()         -> every scored article currently held
 *   count()       -> how many are held
 */
export const createArticleStore = ({ ttlSeconds = 3600 } = {}) => {
  const cache = new NodeCache({ stdTTL: ttlSeconds });

  return {
    get(url) {
      return cache.get(url);
    },

    save(article) {
      cache.set(article.url, article);
      return article;
    },

    all() {
      return cache.keys().map((key) => cache.get(key)).filter(Boolean);
    },

    count() {
      return cache.keys().length;
    },
  };
};
