import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { BUILT_IN_PROMPTS } from "../application/analysis/prompts.js";

/**
 * Schema is created idempotently on every boot. At this scale (one user, one
 * file) that beats a migration framework — introduce one only when there is
 * an actual second migration to run.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS articles (
  url            TEXT PRIMARY KEY,
  section        TEXT NOT NULL,
  title          TEXT NOT NULL,
  abstract       TEXT,
  published_date TEXT,
  score          INTEGER,
  rationale      TEXT,
  model          TEXT,
  scored_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_articles_score   ON articles(score DESC);
CREATE INDEX IF NOT EXISTS idx_articles_section ON articles(section);

CREATE TABLE IF NOT EXISTS analysis_prompts (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT,
  prompt_text TEXT NOT NULL,
  is_builtin  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analyses (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_id            TEXT REFERENCES analysis_prompts(id),
  prompt_label         TEXT,
  prompt_text_snapshot TEXT NOT NULL,
  headline_filter_json TEXT,
  result_text          TEXT NOT NULL,
  headline_count       INTEGER,
  created_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analyses_created ON analyses(created_at DESC);
`;

/**
 * Built-in prompts live in code, so code wins on every boot — but only for
 * rows flagged is_builtin. A user's own prompts are never touched.
 */
const seedBuiltInPrompts = (db) => {
  const upsert = db.prepare(`
    INSERT INTO analysis_prompts (id, label, description, prompt_text, is_builtin, created_at)
    VALUES (@id, @label, @description, @promptText, 1, @createdAt)
    ON CONFLICT(id) DO UPDATE SET
      label       = excluded.label,
      description = excluded.description,
      prompt_text = excluded.prompt_text
    WHERE analysis_prompts.is_builtin = 1
  `);

  const createdAt = new Date().toISOString();
  const seed = db.transaction((prompts) => {
    for (const prompt of prompts) upsert.run({ ...prompt, createdAt });
  });

  seed(BUILT_IN_PROMPTS);
};

export const openDatabase = ({ path: dbPath = ":memory:" } = {}) => {
  if (dbPath !== ":memory:") {
    mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  }

  const db = new Database(dbPath);

  if (dbPath !== ":memory:") db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(SCHEMA);
  seedBuiltInPrompts(db);

  return db;
};
