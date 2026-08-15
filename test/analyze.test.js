/**
 * The analysis surface: listing prompts, saving your own, running one over the
 * aggregated headlines, and browsing past runs. This is the contract the
 * Phase 3 UI is built against.
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { BUILT_IN_PROMPTS } from "../src/application/analysis/prompts.js";
import { createFakeOpenAI } from "./helpers/fakeOpenAI.js";
import { seededDb, scoredArticle } from "./helpers/db.js";

const buildApp = (openaiClient = createFakeOpenAI(), db = seededDb([scoredArticle()])) =>
  createApp({ openaiClient, db, threshold: 80 });

describe("GET /api/prompts", () => {
  it("lists the built-in analyst personas, seeded from code", async () => {
    const res = await request(buildApp()).get("/api/prompts");

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(BUILT_IN_PROMPTS.length);
    expect(res.body.results.map((p) => p.id)).toContain("michael-burry");
    expect(res.body.results[0]).toMatchObject({
      id: expect.any(String),
      label: expect.any(String),
      description: expect.any(String),
      promptText: expect.any(String),
      isBuiltin: true,
    });
  });
});

describe("POST /api/prompts", () => {
  it("saves a custom prompt and lists it alongside the built-ins", async () => {
    const app = buildApp();

    const created = await request(app)
      .post("/api/prompts")
      .send({
        label: "Commodities desk",
        description: "Energy and metals lens",
        promptText: "You are a commodities desk strategist.",
      });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      id: "commodities-desk",
      label: "Commodities desk",
      isBuiltin: false,
    });

    const list = await request(app).get("/api/prompts");
    expect(list.body.results.map((p) => p.id)).toContain("commodities-desk");
    expect(list.body.results).toHaveLength(BUILT_IN_PROMPTS.length + 1);
  });

  it("gives colliding labels distinct ids", async () => {
    const app = buildApp();
    const body = { label: "My take", promptText: "You are an analyst." };

    const first = await request(app).post("/api/prompts").send(body);
    const second = await request(app).post("/api/prompts").send(body);

    expect(first.body.id).toBe("my-take");
    expect(second.body.id).toBe("my-take-2");
  });

  it("rejects a prompt with no label or no text", async () => {
    const app = buildApp();

    const noLabel = await request(app)
      .post("/api/prompts")
      .send({ promptText: "You are an analyst." });
    expect(noLabel.status).toBe(400);

    const noText = await request(app).post("/api/prompts").send({ label: "Empty" });
    expect(noText.status).toBe(400);
  });

  it("can then be run by id", async () => {
    const openai = createFakeOpenAI({ analysis: "Crude is the tell." });
    const app = buildApp(openai);

    await request(app)
      .post("/api/prompts")
      .send({ label: "Commodities desk", promptText: "You are a commodities strategist." });

    const res = await request(app)
      .post("/api/analyze")
      .send({ promptId: "commodities-desk" });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe("Crude is the tell.");
    expect(openai.analysisCalls[0].messages[0].content).toBe(
      "You are a commodities strategist."
    );
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
    expect(res.body.id).toEqual(expect.any(Number));
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
    const db = seededDb([
      scoredArticle({ url: "https://example.com/1" }),
      scoredArticle({ url: "https://example.com/2" }),
      scoredArticle({ url: "https://example.com/3" }),
    ]);

    const res = await request(buildApp(openai, db))
      .post("/api/analyze")
      .send({ promptId: "macro-analyst" });

    expect(openai.analysisCalls).toHaveLength(1);
    expect(res.body.headlineCount).toBe(3);
  });

  it("accepts a one-off custom prompt without saving it", async () => {
    const openai = createFakeOpenAI({ analysis: "Custom take." });
    const app = buildApp(openai);

    const res = await request(app)
      .post("/api/analyze")
      .send({ customPromptText: "You are a commodities desk strategist." });

    expect(res.status).toBe(200);
    expect(res.body.promptUsed.id).toBeNull();

    const prompts = await request(app).get("/api/prompts");
    expect(prompts.body.results).toHaveLength(BUILT_IN_PROMPTS.length);
  });

  it("honours a headline filter", async () => {
    const openai = createFakeOpenAI();
    const db = seededDb([
      scoredArticle({ url: "https://example.com/t", section: "technology", score: 95 }),
      scoredArticle({ url: "https://example.com/b", section: "business", score: 95 }),
    ]);

    const res = await request(buildApp(openai, db))
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
    const res = await request(buildApp())
      .post("/api/analyze")
      .send({ promptId: "michael-burry", customPromptText: "You are a quant." });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exactly one/i);
  });

  it("404s on an unknown promptId", async () => {
    const res = await request(buildApp())
      .post("/api/analyze")
      .send({ promptId: "warren-buffett" });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Unknown promptId/);
  });

  it("explains itself when there are no headlines to analyze yet", async () => {
    const res = await request(buildApp(createFakeOpenAI(), seededDb()))
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

describe("GET /api/analyses", () => {
  it("records each run so results outlive the response", async () => {
    const app = buildApp(createFakeOpenAI({ analysis: "Short the semis." }));

    const run = await request(app)
      .post("/api/analyze")
      .send({ promptId: "michael-burry" });

    const list = await request(app).get("/api/analyses");

    expect(list.body.num_results).toBe(1);
    expect(list.body.results[0]).toMatchObject({
      id: run.body.id,
      promptId: "michael-burry",
      promptLabel: "Michael Burry",
      result: "Short the semis.",
      headlineCount: 1,
    });
  });

  it("returns a single run by id, with the prompt text used", async () => {
    const app = buildApp();

    const run = await request(app)
      .post("/api/analyze")
      .send({ customPromptText: "You are a commodities desk strategist." });

    const res = await request(app).get(`/api/analyses/${run.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.promptText).toBe("You are a commodities desk strategist.");
    expect(res.body.promptId).toBeNull();
  });

  it("keeps the prompt text used, even after the saved prompt is edited later", async () => {
    // prompt_text_snapshot exists so history reflects what actually ran.
    const app = buildApp();

    await request(app)
      .post("/api/prompts")
      .send({ label: "Desk view", promptText: "Original wording." });

    const run = await request(app)
      .post("/api/analyze")
      .send({ promptId: "desk-view" });

    const stored = await request(app).get(`/api/analyses/${run.body.id}`);
    expect(stored.body.promptText).toBe("Original wording.");
  });

  it("lists newest first and honours limit", async () => {
    const app = buildApp();

    for (const promptId of ["michael-burry", "value-investor", "macro-analyst"]) {
      await request(app).post("/api/analyze").send({ promptId });
    }

    const all = await request(app).get("/api/analyses");
    expect(all.body.num_results).toBe(3);
    expect(all.body.results[0].promptId).toBe("macro-analyst");

    const capped = await request(app).get("/api/analyses?limit=2");
    expect(capped.body.num_results).toBe(2);
  });

  it("404s on an unknown analysis id", async () => {
    const res = await request(buildApp()).get("/api/analyses/9999");

    expect(res.status).toBe(404);
  });
});
