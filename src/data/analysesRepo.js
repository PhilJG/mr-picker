/**
 * A record of every analysis run, so results are browsable rather than
 * disappearing with the HTTP response.
 */
const toAnalysis = (row) =>
  row && {
    id: row.id,
    promptId: row.prompt_id,
    promptLabel: row.prompt_label,
    // Snapshot of the text actually used, so later edits to a saved custom
    // prompt don't rewrite the history of what was already run.
    promptText: row.prompt_text_snapshot,
    headlineFilter: row.headline_filter_json
      ? JSON.parse(row.headline_filter_json)
      : {},
    result: row.result_text,
    headlineCount: row.headline_count,
    createdAt: row.created_at,
  };

export const createAnalysesRepo = (db) => {
  const insert = db.prepare(`
    INSERT INTO analyses
      (prompt_id, prompt_label, prompt_text_snapshot, headline_filter_json, result_text, headline_count, created_at)
    VALUES
      (@promptId, @promptLabel, @promptText, @headlineFilterJson, @result, @headlineCount, @createdAt)
  `);

  const selectRecent = db.prepare(
    `SELECT * FROM analyses ORDER BY created_at DESC, id DESC LIMIT ?`
  );
  const selectById = db.prepare(`SELECT * FROM analyses WHERE id = ?`);

  return {
    save({ promptId, promptLabel, promptText, headlineFilter, result, headlineCount }) {
      const info = insert.run({
        promptId: promptId ?? null,
        promptLabel: promptLabel ?? null,
        promptText,
        headlineFilterJson: JSON.stringify(headlineFilter ?? {}),
        result,
        headlineCount: headlineCount ?? null,
        createdAt: new Date().toISOString(),
      });

      return this.get(Number(info.lastInsertRowid));
    },

    list({ limit = 50 } = {}) {
      return selectRecent.all(Number(limit)).map(toAnalysis);
    },

    get(id) {
      return toAnalysis(selectById.get(Number(id)));
    },
  };
};
