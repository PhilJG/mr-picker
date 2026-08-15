/**
 * GET /api/headlines — the "bring the headlines together" step: one
 * cross-section view of everything scored so far.
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createArticleStore } from "../src/data/articleStore.js";
import { createFakeOpenAI, scoreByHeadline } from "./helpers/fakeOpenAI.js";
import { mockNytSection, loadNytFixture } from "./helpers/nyt.js";

const fixture = loadNytFixture("technology");
const [CHIP, CLOUD, SPEAKER] = fixture.results;

const seeded = (articles) => {
  const store = createArticleStore({ ttlSeconds: 60 });
  articles.forEach((article) => store.save(article));
  return store;
};

const article = (overrides) => ({
  title: "t",
  abstract: "a",
  url: `https://example.com/${Math.random()}`,
  section: "business",
  published_date: "2026-08-15T06:00:00-04:00",
  score: 90,
  rationale: "r",
  ...overrides,
});

describe("GET /api/headlines", () => {
  it("is empty before any section has been fetched", async () => {
    const app = createApp({ openaiClient: createFakeOpenAI(), threshold: 80 });

    const res = await request(app).get("/api/headlines");

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
    const app = createApp({ openaiClient: openai, threshold: 80 });

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
    const store = seeded([
      article({ url: "https://example.com/a", score: 82 }),
      article({ url: "https://example.com/b", score: 97 }),
      article({ url: "https://example.com/c", score: 90 }),
    ]);
    const app = createApp({ openaiClient: createFakeOpenAI(), store, threshold: 80 });

    const res = await request(app).get("/api/headlines");

    expect(res.body.results.map((a) => a.score)).toEqual([97, 90, 82]);
  });

  it("applies the default threshold, and lets minScore override it", async () => {
    const store = seeded([
      article({ url: "https://example.com/high", score: 95 }),
      article({ url: "https://example.com/mid", score: 60 }),
      article({ url: "https://example.com/low", score: 10 }),
    ]);
    const app = createApp({ openaiClient: createFakeOpenAI(), store, threshold: 80 });

    const def = await request(app).get("/api/headlines");
    expect(def.body.results.map((a) => a.score)).toEqual([95]);

    const relaxed = await request(app).get("/api/headlines?minScore=50");
    expect(relaxed.body.results.map((a) => a.score)).toEqual([95, 60]);

    const all = await request(app).get("/api/headlines?minScore=0");
    expect(all.body.num_results).toBe(3);
  });

  it("filters by section and honours limit", async () => {
    const store = seeded([
      article({ url: "https://example.com/t1", section: "technology", score: 99 }),
      article({ url: "https://example.com/t2", section: "technology", score: 88 }),
      article({ url: "https://example.com/b1", section: "business", score: 95 }),
    ]);
    const app = createApp({ openaiClient: createFakeOpenAI(), store, threshold: 80 });

    const tech = await request(app).get("/api/headlines?section=technology");
    expect(tech.body.num_results).toBe(2);

    const capped = await request(app).get("/api/headlines?limit=2");
    expect(capped.body.results.map((a) => a.score)).toEqual([99, 95]);
  });
});
