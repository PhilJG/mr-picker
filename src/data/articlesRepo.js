/**
 * Scored-article storage, backed by SQLite.
 *
 * Implements the store interface the application layer depends on
 * (get / save / all / count / findHeadlines), so services never see SQL.
 */
export const createArticlesRepo = (db) => {
  const upsert = db.prepare(`
    INSERT INTO articles (url, section, title, abstract, published_date, score, rationale, model, scored_at)
    VALUES (@url, @section, @title, @abstract, @published_date, @score, @rationale, @model, @scored_at)
    ON CONFLICT(url) DO UPDATE SET
      section        = excluded.section,
      title          = excluded.title,
      abstract       = excluded.abstract,
      published_date = excluded.published_date,
      score          = excluded.score,
      rationale      = excluded.rationale,
      model          = excluded.model,
      scored_at      = excluded.scored_at
  `);

  const selectByUrl = db.prepare(`SELECT * FROM articles WHERE url = ?`);
  const selectAll = db.prepare(`SELECT * FROM articles`);
  const countAll = db.prepare(`SELECT COUNT(*) AS n FROM articles`);

  return {
    get(url) {
      return selectByUrl.get(url) ?? undefined;
    },

    save(article) {
      upsert.run({
        url: article.url,
        section: article.section ?? "",
        title: article.title,
        abstract: article.abstract ?? null,
        published_date: article.published_date ?? null,
        score: article.score ?? null,
        rationale: article.rationale ?? null,
        model: article.model ?? null,
        scored_at: article.scored_at ?? null,
      });
      return article;
    },

    all() {
      return selectAll.all();
    },

    count() {
      return countAll.get().n;
    },

    /** Filtering happens in SQL rather than by pulling every row into JS. */
    findHeadlines({ minScore = 0, section, since, limit } = {}) {
      const clauses = ["score IS NOT NULL", "score >= @minScore"];
      const params = { minScore: Number(minScore) };

      if (section) {
        clauses.push("section = @section");
        params.section = section;
      }

      if (since) {
        clauses.push("published_date >= @since");
        params.since = since;
      }

      let sql =
        `SELECT * FROM articles WHERE ${clauses.join(" AND ")} ` +
        `ORDER BY score DESC, published_date DESC`;

      if (limit !== undefined && limit !== "") {
        sql += " LIMIT @limit";
        params.limit = Number(limit);
      }

      return db.prepare(sql).all(params);
    },
  };
};
