/**
 * GET /api/prompts and POST /api/analyze — choosing an analysis prompt
 * (built-in persona or your own) and running it over the aggregated
 * headlines. This is the contract the Phase 3 UI is built against.
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createArticleStore } from "../src/data/articleStore.js";
import { BUILT_IN_PROMPTS } from "../src/application/analysis/prompts.js";
import { createFakeOpenAI } from "./helpers/fakeOpenAI.js";

const article = (overrides = {}) => ({
  title: "Chip Maker Warns of Steep Drop in Data Center Orders",
  abstract: "The company cut its quarterly guidance by nearly a third.",
  url: "https://example.com/chip",
  section: "technology",
  published_date: "2026-08-15T06:00:11-04:00",
  score: 91,
  rationale: "Semis guidance cut.",
  ...overrides,
});

const seeded = (articles = [article()]) => {
  const store = createArticleStore({ ttlSeconds: 60 });
  articles.forEach((a) => store.save(a));
  return store;
};

const buildApp = (openaiClient, store = seeded()) =>
  createApp({ openaiClient, store, threshold: 80 });

describe("GET /api/prompts", () => {
  it("lists the built-in analyst personas", async () => {
    const res = await request(buildApp(createFakeOpenAI())).get("/api/prompts");

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(BUILT_IN_PROMPTS.length);
    expect(res.body.results.map((p) => p.id)).toContain("michael-burry");
    expect(res.body.results[0]).toMatchObject({
      id: expect.any(String),
      label: expect.any(String),
      description: expect.any(String),
      promptText: expect.any(String),
    });
  });
});

describe("POST /api/analyze", () => {
  it("runs a built-in prompt over the aggregated headlines", async () => {
    const openai = createFakeOpenAI({ analysis: "Short the semis." });

    const res = await request(buildApp(openai))
      .post("/api/analyze")
      .send({ promptId: "michael-burry" });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe("Short the semis.");
    expect(res.body.promptUsed.id).toBe("michael-burry");
    expect(res.body.headlineCount).toBe(1);
  });

  it("sends the persona as the system prompt and the headlines as the user turn", async () => {
    const openai = createFakeOpenAI();

    await request(buildApp(openai))
      .post("/api/analyze")
      .send({ promptId: "value-investor" });

    const [call] = openai.analysisCalls;
    expect(call.messages[0].role).toBe("system");
    expect(call.messages[0].content).toContain("value investor");
    expect(call.messages[1].content).toContain("Chip Maker Warns");
    expect(call.messages[1].content).toContain("relevance 91");
  });

  it("makes a single call for the whole set, not one per headline", async () => {
    const openai = createFakeOpenAI();
    const store = seeded([
      article({ url: "https://example.com/1" }),
      article({ url: "https://example.com/2" }),
      article({ url: "https://example.com/3" }),
    ]);

    const res = await request(buildApp(openai, store))
      .post("/api/analyze")
      .send({ promptId: "macro-analyst" });

    expect(openai.analysisCalls).toHaveLength(1);
    expect(res.body.headlineCount).toBe(3);
  });

  it("accepts a custom prompt written by the user", async () => {
    const openai = createFakeOpenAI({ analysis: "Custom take." });

    const res = await request(buildApp(openai))
      .post("/api/analyze")
      .send({ customPromptText: "You are a commodities desk strategist." });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe("Custom take.");
    expect(res.body.promptUsed.id).toBeNull();
    expect(openai.analysisCalls[0].messages[0].content).toBe(
      "You are a commodities desk strategist."
    );
  });

  it("honours a headline filter", async () => {
    const openai = createFakeOpenAI();
    const store = seeded([
      article({ url: "https://example.com/t", section: "technology", score: 95 }),
      article({ url: "https://example.com/b", section: "business", score: 95 }),
    ]);

    const res = await request(buildApp(openai, store))
      .post("/api/analyze")
      .send({ promptId: "michael-burry", headlineFilter: { section: "business" } });

    expect(res.body.headlineCount).toBe(1);
    expect(openai.analysisCalls[0].messages[1].content).toContain("business");
  });

  it("rejects a request that supplies neither a promptId nor custom text", async () => {
    const openai = createFakeOpenAI();

    const res = await request(buildApp(openai)).post("/api/analyze").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exactly one/i);
    expect(openai.callCount).toBe(0);
  });

  it("rejects a request that supplies both", async () => {
    const res = await request(buildApp(createFakeOpenAI()))
      .post("/api/analyze")
      .send({ promptId: "michael-burry", customPromptText: "You are a quant." });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exactly one/i);
  });

  it("404s on an unknown promptId", async () => {
    const res = await request(buildApp(createFakeOpenAI()))
      .post("/api/analyze")
      .send({ promptId: "warren-buffett" });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Unknown promptId/);
  });

  it("explains itself when there are no headlines to analyze yet", async () => {
    const app = createApp({
      openaiClient: createFakeOpenAI(),
      store: createArticleStore({ ttlSeconds: 60 }),
      threshold: 80,
    });

    const res = await request(app)
      .post("/api/analyze")
      .send({ promptId: "michael-burry" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No scored headlines/);
  });

  it("returns 500 when the model call itself fails", async () => {
    const openai = createFakeOpenAI({
      analysis: () => {
        throw new Error("upstream down");
      },
    });

    const res = await request(buildApp(openai))
      .post("/api/analyze")
      .send({ promptId: "michael-burry" });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to run analysis" });
  });
});
