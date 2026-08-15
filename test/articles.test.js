/**
 * GET /api/articles/:section
 *
 * Descended from the Phase 0 characterization tests. Cases that were tagged
 * KNOWN BUG there are now asserted the other way round — they document the
 * fixes rather than the defects.
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createFakeOpenAI, scoreByHeadline } from "./helpers/fakeOpenAI.js";
import { mockNytSection, mockNytFailure, loadNytFixture } from "./helpers/nyt.js";

const fixture = loadNytFixture("technology");
const [CHIP, CLOUD, SPEAKER] = fixture.results;

// Always pin the threshold rather than inheriting a developer's local .env.
const buildApp = (openaiClient, overrides = {}) =>
  createApp({ openaiClient, threshold: 80, ...overrides });

describe("GET /api/articles/:section", () => {
  it("returns every article whose score clears the threshold", async () => {
    mockNytSection("technology");
    const openai = createFakeOpenAI({ scorer: { score: 90, rationale: "ok" } });

    const res = await request(buildApp(openai)).get("/api/articles/technology");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("OK");
    expect(res.body.num_results).toBe(3);
    expect(openai.scoringCount).toBe(3);
  });

  it("returns a structured score and rationale per article", async () => {
    mockNytSection("technology");
    const openai = createFakeOpenAI({
      scorer: { score: 91, rationale: "Semis guidance cut." },
    });

    const res = await request(buildApp(openai)).get("/api/articles/technology");

    expect(res.body.results[0]).toMatchObject({
      title: CHIP.title,
      url: CHIP.url,
      abstract: CHIP.abstract,
      section: "technology",
      published_date: CHIP.published_date,
      score: 91,
      rationale: "Semis guidance cut.",
    });
    // The old free-text `analysis` blob is gone in favour of typed fields.
    expect(res.body.results[0]).not.toHaveProperty("analysis");
    expect(res.body.results[0].scored_at).toEqual(expect.any(String));
  });

  it("FIXED: sends the abstract to the model, not just the headline", async () => {
    mockNytSection("technology");
    const openai = createFakeOpenAI();

    await request(buildApp(openai)).get("/api/articles/technology");

    const prompt = openai.scoredPrompts.find((p) => p.includes(CHIP.title));
    expect(prompt).toContain(CHIP.title);
    expect(prompt).toContain(CHIP.abstract);
  });

  it("FIXED: uses one threshold, and the prompt carries no threshold at all", async () => {
    // Previously the prompt said "below 80, don't respond" while the code
    // filtered at >= 75. Now the model always scores and only the app filters.
    mockNytSection("technology");
    const openai = createFakeOpenAI({
      scorer: scoreByHeadline({
        "Chip Maker": 80, // exactly at the threshold -> kept
        "Antitrust Inquiry": 79, // one point under -> dropped
        "Smart Speaker": 5,
      }),
    });

    const res = await request(buildApp(openai)).get("/api/articles/technology");

    expect(res.body.results.map((a) => a.url)).toEqual([CHIP.url]);

    for (const prompt of openai.scoredPrompts) {
      expect(prompt).not.toMatch(/\b(75|80)\b/);
      expect(prompt.toLowerCase()).not.toContain("don't give a response");
    }
  });

  it("honours a per-request minScore override", async () => {
    mockNytSection("technology");
    const openai = createFakeOpenAI({
      scorer: scoreByHeadline({
        "Chip Maker": 90,
        "Antitrust Inquiry": 60,
        "Smart Speaker": 5,
      }),
    });

    const res = await request(buildApp(openai)).get(
      "/api/articles/technology?minScore=50"
    );

    expect(res.body.results.map((a) => a.url)).toEqual([CHIP.url, CLOUD.url]);
  });

  it("FIXED: caches low scorers too, so they are never re-billed", async () => {
    // The old code only cached articles that passed the threshold, so
    // rejected ones went back to the model on every single request.
    const openai = createFakeOpenAI({ scorer: { score: 10, rationale: "noise" } });
    const app = buildApp(openai);

    mockNytSection("technology");
    await request(app).get("/api/articles/technology");
    expect(openai.scoringCount).toBe(3);

    mockNytSection("technology");
    const res = await request(app).get("/api/articles/technology");

    expect(openai.scoringCount).toBe(3); // no re-scoring
    expect(res.body.num_results).toBe(0); // still filtered out of the response
  });

  it("does not re-score an article it already holds", async () => {
    const openai = createFakeOpenAI();
    const app = buildApp(openai);

    mockNytSection("technology");
    await request(app).get("/api/articles/technology");
    mockNytSection("technology");
    const res = await request(app).get("/api/articles/technology");

    expect(openai.scoringCount).toBe(3);
    expect(res.body.num_results).toBe(3);
  });

  it("applies limit and offset before scoring", async () => {
    mockNytSection("technology");
    const openai = createFakeOpenAI();

    const res = await request(buildApp(openai)).get(
      "/api/articles/technology?limit=1&offset=1"
    );

    expect(openai.scoringCount).toBe(1);
    expect(res.body.results.map((a) => a.url)).toEqual([CLOUD.url]);
  });

  it("keeps serving other articles when one scoring call fails", async () => {
    mockNytSection("technology");
    const openai = createFakeOpenAI({
      scorer: (prompt) => {
        if (prompt.includes("Chip Maker")) throw new Error("rate limited");
        return { score: 90, rationale: "ok" };
      },
    });

    const res = await request(buildApp(openai)).get("/api/articles/technology");

    expect(res.status).toBe(200);
    expect(res.body.num_results).toBe(2);
    expect(res.body.results.map((a) => a.url)).not.toContain(CHIP.url);
  });

  it("drops an article when the model returns no tool call", async () => {
    mockNytSection("technology");
    const openai = createFakeOpenAI({
      raw: () => ({ choices: [{ message: { content: "I'd say about 95." } }] }),
    });

    const res = await request(buildApp(openai)).get("/api/articles/technology");

    expect(res.status).toBe(200);
    expect(res.body.num_results).toBe(0);
  });

  it("rejects an out-of-range score instead of trusting it", async () => {
    mockNytSection("technology");
    const openai = createFakeOpenAI({ scorer: { score: 5000, rationale: "x" } });

    const res = await request(buildApp(openai)).get("/api/articles/technology");

    expect(res.body.num_results).toBe(0);
  });

  it("returns 400 for a section the NYT does not publish", async () => {
    const openai = createFakeOpenAI();

    const res = await request(buildApp(openai)).get("/api/articles/bananas");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown section/);
    expect(openai.callCount).toBe(0);
  });

  it("FIXED: resolves section names containing a slash", async () => {
    // "books/review" is in the section list but a plain :section param never
    // matched it, so the endpoint was unreachable for that section.
    mockNytSection("books/review", fixture);
    const openai = createFakeOpenAI();

    const res = await request(buildApp(openai)).get("/api/articles/books/review");

    expect(res.status).toBe(200);
    expect(res.body.num_results).toBe(3);
  });

  it("returns 500 when the NYT request fails", async () => {
    mockNytFailure("technology");
    const openai = createFakeOpenAI();

    const res = await request(buildApp(openai)).get("/api/articles/technology");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to fetch articles" });
    expect(openai.callCount).toBe(0);
  });
});
