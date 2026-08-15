/**
 * Analysis prompts: the built-in personas seeded from code, plus whatever the
 * user writes and saves.
 */
const toPrompt = (row) =>
  row && {
    id: row.id,
    label: row.label,
    description: row.description ?? "",
    promptText: row.prompt_text,
    isBuiltin: Boolean(row.is_builtin),
    createdAt: row.created_at,
  };

const slugify = (label) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "prompt";

export const createPromptsRepo = (db) => {
  const selectAll = db.prepare(
    `SELECT * FROM analysis_prompts ORDER BY is_builtin DESC, created_at ASC, label ASC`
  );
  const selectById = db.prepare(`SELECT * FROM analysis_prompts WHERE id = ?`);
  const exists = db.prepare(`SELECT 1 FROM analysis_prompts WHERE id = ?`);
  const insert = db.prepare(`
    INSERT INTO analysis_prompts (id, label, description, prompt_text, is_builtin, created_at)
    VALUES (@id, @label, @description, @promptText, 0, @createdAt)
  `);
  const deleteCustom = db.prepare(
    `DELETE FROM analysis_prompts WHERE id = ? AND is_builtin = 0`
  );

  /** Readable ids for custom prompts, de-duplicated with a numeric suffix. */
  const uniqueId = (label) => {
    const base = slugify(label);
    if (!exists.get(base)) return base;

    for (let n = 2; ; n += 1) {
      const candidate = `${base}-${n}`;
      if (!exists.get(candidate)) return candidate;
    }
  };

  return {
    list() {
      return selectAll.all().map(toPrompt);
    },

    get(id) {
      return toPrompt(selectById.get(id));
    },

    create({ label, promptText, description = "" }) {
      const id = uniqueId(label);
      insert.run({
        id,
        label,
        description,
        promptText,
        createdAt: new Date().toISOString(),
      });
      return this.get(id);
    },

    /** Built-ins are code-owned and cannot be deleted. */
    remove(id) {
      return deleteCustom.run(id).changes > 0;
    },
  };
};
