const scoreClass = (score) => {
  if (score >= 90) return "score high";
  if (score >= 80) return "score mid";
  return "score low";
};

/** The pooled, scored headlines an analysis prompt will run against. */
export function HeadlineFeed({ headlines, loading, error, minScore, onMinScore }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>2 · The pool</h2>
        <label className="inline">
          Min score
          <input
            type="number"
            min="0"
            max="100"
            value={minScore}
            onChange={(e) => onMinScore(e.target.value)}
          />
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="hint">Loading…</p>}

      {!loading && headlines.length === 0 && (
        <p className="hint">
          Nothing here yet. Fetch a section above, or lower the minimum score.
        </p>
      )}

      <ul className="headlines">
        {headlines.map((article) => (
          <li key={article.url}>
            <span className={scoreClass(article.score)}>{article.score}</span>
            <div>
              <a href={article.url} target="_blank" rel="noreferrer">
                {article.title}
              </a>
              {article.rationale && (
                <p className="rationale">{article.rationale}</p>
              )}
              <p className="meta">
                {article.section}
                {article.published_date
                  ? ` · ${new Date(article.published_date).toLocaleDateString()}`
                  : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {headlines.length > 0 && (
        <p className="hint">
          {headlines.length} headline{headlines.length === 1 ? "" : "s"} in the
          pool.
        </p>
      )}
    </section>
  );
}
