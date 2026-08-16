/**
 * The "bring the headlines together" step: one cross-section view of every
 * scored article, which is what an analysis prompt then runs against.
 *
 * Applies the default threshold and delegates the query to the store, so the
 * filtering runs in SQL rather than pulling every row into memory.
 */
export const createAggregateService = ({ store, threshold }) => ({
  getHeadlines({ minScore, section, since, limit } = {}) {
    return store.findHeadlines({
      minScore: minScore === undefined || minScore === "" ? threshold : minScore,
      section,
      since,
      limit,
    });
  },
});
