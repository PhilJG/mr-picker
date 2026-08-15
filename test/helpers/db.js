import { openDatabase } from "../../src/data/db.js";
import { createArticlesRepo } from "../../src/data/articlesRepo.js";

/** A private in-memory database, optionally pre-loaded with scored articles. */
export const seededDb = (articles = []) => {
  const db = openDatabase({ path: ":memory:" });
  const repo = createArticlesRepo(db);
  articles.forEach((article) => repo.save(article));
  return db;
};

/** Convenience builder for a scored article row. */
export const scoredArticle = (overrides = {}) => ({
  title: "Chip Maker Warns of Steep Drop in Data Center Orders",
  abstract: "The company cut its quarterly guidance by nearly a third.",
  url: "https://example.com/chip",
  section: "technology",
  published_date: "2026-08-15T06:00:11-04:00",
  score: 91,
  rationale: "Semis guidance cut.",
  model: "gpt-4o-mini",
  scored_at: "2026-08-15T10:00:00.000Z",
  ...overrides,
});
