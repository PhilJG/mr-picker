/**
 * GET /api/headlines — the "bring the headlines together" step: one
 * cross-section view of everything scored so far.
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createFakeOpenAI, scoreByHeadline } from "./helpers/fakeOpenAI.js";
import { seededDb, scoredArticle } from "./helpers/db.js";
import { mockNytSection, loadNytFixture } from "./helpers/nyt.js";

const fixture = loadNytFixture("technology");
const [CHIP] = fixture.results;

const buildApp = (db, openaiClient = createFakeOpenAI()) =>
  createApp({ openaiClient, db, threshold: 80 });

describe("GET /api/headlines", () => {
  it("is empty before any section has been fetched", async () => {
    const res = await request(buildApp(seededDb())).get("/api/headlines");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ num_results: 0, results: [] });
  });

  it("aggregates articles scored across different sections", async () => {
    const openai = createFakeOpenAI({
      scorer: scoreByHeadline({
        "Chip Maker": 95,
        "Antitrust Inquiry": 85,
        "Smart Speaker": 5,
      }),
    });
    const app = buildApp(seededDb(), openai);

    mockNytSection("technology");
    await request(app).get("/api/articles/technology");

    mockNytSection("business", {
      ...fixture,
      results: [{ ...CHIP, section: "business", url: "https://example.com/biz-1" }],
    });
    await request(app).get("/api/articles/business");

    const res = await request(app).get("/api/headlines");

    expect(res.body.num_results).toBe(3);
    expect(new Set(res.body.results.map((a) => a.section))).toEqual(
      new Set(["technology", "business"])
    );
  });

  it("sorts by score descending", async () => {
    const db = seededDb([
      scoredArticle({ url: "https://example.com/a", score: 82 }),
      scoredArticle({ url: "https://example.com/b", score: 97 }),
      scoredArticle({ url: "https://example.com/c", score: 90 }),
    ]);

    const res = await request(buildApp(db)).get("/api/headlines");

    expect(res.body.results.map((a) => a.score)).toEqual([97, 90, 82]);
  });

  it("applies the default threshold, and lets minScore override it", async () => {
    const db = seededDb([
      scoredArticle({ url: "https://example.com/high", score: 95 }),
      scoredArticle({ url: "https://example.com/mid", score: 60 }),
      scoredArticle({ url: "https://example.com/low", score: 10 }),
    ]);
    const app = buildApp(db);

    const def = await request(app).get("/api/headlines");
    expect(def.body.results.map((a) => a.score)).toEqual([95]);

    const relaxed = await request(app).get("/api/headlines?minScore=50");
    expect(relaxed.body.results.map((a) => a.score)).toEqual([95, 60]);

    const all = await request(app).get("/api/headlines?minScore=0");
    expect(all.body.num_results).toBe(3);
  });

  it("filters by section and honours limit", async () => {
    const db = seededDb([
      scoredArticle({ url: "https://example.com/t1", section: "technology", score: 99 }),
      scoredArticle({ url: "https://example.com/t2", section: "technology", score: 88 }),
      scoredArticle({ url: "https://example.com/b1", section: "business", score: 95 }),
    ]);
    const app = buildApp(db);

    const tech = await request(app).get("/api/headlines?section=technology");
    expect(tech.body.num_results).toBe(2);

    const capped = await request(app).get("/api/headlines?limit=2");
    expect(capped.body.results.map((a) => a.score)).toEqual([99, 95]);
  });

  it("filters by publication date with since", async () => {
    const db = seededDb([
      scoredArticle({
        url: "https://example.com/today",
        published_date: "2026-08-15T06:00:00-04:00",
        score: 95,
      }),
      scoredArticle({
        url: "https://example.com/old",
        published_date: "2026-07-01T06:00:00-04:00",
        score: 96,
      }),
    ]);

    const res = await request(buildApp(db)).get("/api/headlines?since=2026-08-01");

    expect(res.body.results.map((a) => a.url)).toEqual([
      "https://example.com/today",
    ]);
  });
});
