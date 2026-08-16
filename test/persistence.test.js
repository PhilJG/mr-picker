/**
 * The point of Phase 2: state outlives the process.
 *
 * These use a real file on disk rather than :memory:, because the whole
 * question is whether closing and reopening the database keeps the data.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/data/db.js";
import { createArticlesRepo } from "../src/data/articlesRepo.js";
import { createFakeOpenAI } from "./helpers/fakeOpenAI.js";
import { scoredArticle } from "./helpers/db.js";
import { mockNytSection } from "./helpers/nyt.js";

let dir;
let dbPath;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "mr-picker-test-"));
  dbPath = path.join(dir, "test.sqlite");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Simulates a server restart: a brand new app over the same file. */
const bootApp = (openaiClient = createFakeOpenAI()) =>
  createApp({
    openaiClient,
    db: openDatabase({ path: dbPath }),
    threshold: 80,
  });

describe("persistence across restarts", () => {
  it("creates the database file and schema on first boot", () => {
    expect(existsSync(dbPath)).toBe(false);

    const db = openDatabase({ path: dbPath });

    expect(existsSync(dbPath)).toBe(true);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row) => row.name);
    expect(tables).toEqual(
      expect.arrayContaining(["articles", "analysis_prompts", "analyses"])
    );
    db.close();
  });

  it("re-seeds built-in prompts idempotently, without duplicating them", () => {
    const first = openDatabase({ path: dbPath });
    const countOf = (db) =>
      db.prepare("SELECT COUNT(*) AS n FROM analysis_prompts").get().n;
    const initial = countOf(first);
    first.close();

    const second = openDatabase({ path: dbPath });
    expect(countOf(second)).toBe(initial);
    second.close();
  });

  it("keeps scored articles after the process restarts", async () => {
    const openai = createFakeOpenAI({ scorer: { score: 92, rationale: "ok" } });
    const first = bootApp(openai);

    mockNytSection("technology");
    const before = await request(first).get("/api/articles/technology");
    expect(before.body.num_results).toBe(3);
    first.locals.db.close();

    // Fresh app, same file, and crucially no NYT cassette registered — if the
    // articles didn't persist, this request has nothing to serve.
    const second = bootApp(openai);
    const after = await request(second).get("/api/headlines");

    expect(after.body.num_results).toBe(3);
    expect(openai.scoringCount).toBe(3); // nothing was re-scored
    second.locals.db.close();
  });

  it("keeps custom prompts after a restart", async () => {
    const first = bootApp();
    await request(first)
      .post("/api/prompts")
      .send({ label: "Desk view", promptText: "You are a desk strategist." });
    first.locals.db.close();

    const second = bootApp();
    const res = await request(second).get("/api/prompts");

    const saved = res.body.results.find((p) => p.id === "desk-view");
    expect(saved).toMatchObject({
      label: "Desk view",
      promptText: "You are a desk strategist.",
      isBuiltin: false,
    });
    second.locals.db.close();
  });

  it("keeps past analyses after a restart", async () => {
    const db = openDatabase({ path: dbPath });
    createArticlesRepo(db).save(scoredArticle());
    db.close();

    const first = bootApp(createFakeOpenAI({ analysis: "Short the semis." }));
    const run = await request(first)
      .post("/api/analyze")
      .send({ promptId: "michael-burry" });
    first.locals.db.close();

    const second = bootApp();
    const res = await request(second).get(`/api/analyses/${run.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.result).toBe("Short the semis.");
    second.locals.db.close();
  });

  it("does not re-score an article seen in a previous run", async () => {
    const openai = createFakeOpenAI();

    const first = bootApp(openai);
    mockNytSection("technology");
    await request(first).get("/api/articles/technology");
    expect(openai.scoringCount).toBe(3);
    first.locals.db.close();

    const second = bootApp(openai);
    mockNytSection("technology");
    const res = await request(second).get("/api/articles/technology");

    expect(openai.scoringCount).toBe(3); // the model is not paid twice
    expect(res.body.num_results).toBe(3);
    second.locals.db.close();
  });
});
