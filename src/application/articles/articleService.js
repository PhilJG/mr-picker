import { mapWithConcurrency } from "../../util/concurrency.js";

/**
 * Fetch a NYT section, score anything not already scored, keep everything,
 * and return only what clears the threshold.
 *
 * Note the ordering: EVERY scored article is saved, including low scorers.
 * The old code only cached articles that passed, so rejected ones were
 * re-sent to the model on every single request. Storing all of them also
 * lets the aggregate view and re-analysis work without re-fetching.
 */
export const createArticleService = ({
  nytClient,
  store,
  scorer,
  threshold,
  concurrency = 5,
  logger = console,
}) => ({
  async getSectionArticles(section, { limit = 100, offset = 0, minScore } = {}) {
    const { status, articles } = await nytClient.fetchTopStories(section);

    const selected = articles.slice(
      Number(offset),
      Number(offset) + Number(limit)
    );

    const unscored = selected.filter((article) => !store.get(article.url));

    await mapWithConcurrency(unscored, concurrency, async (article) => {
      try {
        const scored = await scorer(article);
        store.save({ ...article, ...scored });
      } catch (error) {
        // One bad scoring call shouldn't sink the whole request; the article
        // is simply absent from this response and retried next time.
        logger.error(`Failed to score "${article.title}": ${error.message}`);
      }
    });

    const floor = minScore === undefined ? threshold : Number(minScore);

    const results = selected
      .map((article) => store.get(article.url))
      .filter((article) => article && article.score >= floor);

    return { status, results };
  },
});
