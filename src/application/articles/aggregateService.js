/**
 * The "bring the headlines together" step: one cross-section view of every
 * scored article, which is what an analysis prompt then runs against.
 *
 * Reads through the store interface only, so Phase 2's SQLite swap needs no
 * change here.
 */
export const createAggregateService = ({ store, threshold }) => ({
  getHeadlines({ minScore, section, limit } = {}) {
    const floor = minScore === undefined ? threshold : Number(minScore);

    let headlines = store
      .all()
      .filter((article) => typeof article.score === "number")
      .filter((article) => article.score >= floor);

    if (section) {
      headlines = headlines.filter((article) => article.section === section);
    }

    headlines.sort(
      (a, b) =>
        b.score - a.score ||
        String(b.published_date ?? "").localeCompare(
          String(a.published_date ?? "")
        )
    );

    return limit === undefined ? headlines : headlines.slice(0, Number(limit));
  },
});
