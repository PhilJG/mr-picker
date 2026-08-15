/**
 * Characterization tests for GET /api/articles/:section.
 *
 * These lock in CURRENT behavior so the Phase 1 refactor can be verified as
 * behavior-preserving. Cases tagged KNOWN BUG capture behavior that is
 * deliberately wrong today and is scheduled to change in Phase 1 — when it
 * does, those assertions get rewritten, not deleted.
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { createFakeOpenAI, scoreByHeadline } from "./helpers/fakeOpenAI.js";
import { mockNytSection, mockNytFailure, loadNytFixture } from "./helpers/nyt.js";

const fixture = loadNytFixture("technology");
const [CHIP, CLOUD, SPEAKER] = fixture.results;

describe("GET /api/articles/:section", () => {
  it("returns every article whose score clears the threshold", async () => {
    mockNytSection("technology");
    const openai = createFakeOpenAI("Score: 90 — highly market relevant.");

    const res = await request(createApp({ openaiClient: openai })).get(
      "/api/articles/technology"
    );

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("OK");
    expect(res.body.num_results).toBe(3);
    expect(res.body.results).toHaveLength(3);
    expect(openai.callCount).toBe(3);
  });

  it("returns only title, url, published_date and analysis for each article", async () => {
    mockNytSection("technology");
    const openai = createFakeOpenAI("Score: 90 — highly market relevant.");

    const res = await request(createApp({ openaiClient: openai })).get(
      "/api/articles/technology"
    );

    expect(res.body.results[0]).toEqual({
      title: CHIP.title,
      url: CHIP.url,
      published_date: CHIP.published_date,
      analysis: "Score: 90 — highly market relevant.",
    });
    // KNOWN BUG: abstract is fetched from NYT then discarded before scoring,
    // so the model only ever sees the headline. Phase 1 passes it through.
    expect(res.body.results[0]).not.toHaveProperty("abstract");
  });

  it("sends only the headline to the model, never the abstract", async () => {
    mockNytSection("technology");
    const openai = createFakeOpenAI("Score: 90");

    await request(createApp({ openaiClient: openai })).get(
      "/api/articles/technology"
    );

    const prompt = openai.calls[0].messages[0].content;
    expect(prompt).toContain(CHIP.title);
    expect(prompt).not.toContain(CHIP.abstract);
  });

  it("drops articles that score below the threshold", async () => {
    mockNytSection("technology");
    const openai = createFakeOpenAI(
      scoreByHeadline({
        "Chip Maker": "Score: 95",
        "Antitrust Inquiry": "Score: 88",
        "Smart Speaker": "Score: 10",
      })
    );

    const res = await request(createApp({ openaiClient: openai })).get(
      "/api/articles/technology"
    );

    const urls = res.body.results.map((a) => a.url);
    expect(urls).toContain(CHIP.url);
    expect(urls).toContain(CLOUD.url);
    expect(urls).not.toContain(SPEAKER.url);
    expect(res.body.num_results).toBe(2);
  });

  it("KNOWN BUG: filters at 75 in code although the prompt says 80", async () => {
    // The prompt instructs the model not to respond below 80, but the code
    // independently accepts >= 75 — two thresholds that disagree. Phase 1
    // collapses this to a single configurable RELEVANCE_THRESHOLD.
    mockNytSection("technology");
    const openai = createFakeOpenAI(
      scoreByHeadline({
        "Chip Maker": "Score: 75", // below the prompt's 80, still accepted
        "Antitrust Inquiry": "Score: 74", // one point lower, rejected
        "Smart Speaker": "Score: 0",
      })
    );

    const res = await request(createApp({ openaiClient: openai })).get(
      "/api/articles/technology"
    );

    expect(res.body.results.map((a) => a.url)).toEqual([CHIP.url]);

    const prompt = openai.calls[0].messages[0].content;
    expect(prompt).toContain("if the score is below 80");
  });

  it("KNOWN BUG: silently drops articles when the score cannot be parsed", async () => {
    // Score arrives as free text matched by regex. Any formatting the regex
    // misses means the article vanishes with no error. Phase 1 replaces this
    // with structured tool-calling output.
    mockNytSection("technology");
    const openai = createFakeOpenAI("I'd rate this a strong 95 out of 100.");

    const res = await request(createApp({ openaiClient: openai })).get(
      "/api/articles/technology"
    );

    expect(res.body.num_results).toBe(0);
    expect(res.body.results).toEqual([]);
  });

  it("does not re-score an article it has already cached", async () => {
    const openai = createFakeOpenAI("Score: 90");
    const app = createApp({ openaiClient: openai });

    mockNytSection("technology");
    await request(app).get("/api/articles/technology");
    expect(openai.callCount).toBe(3);

    mockNytSection("technology");
    const res = await request(app).get("/api/articles/technology");

    expect(openai.callCount).toBe(3); // served from cache, no new model calls
    expect(res.body.num_results).toBe(3);
  });

  it("KNOWN BUG: re-scores below-threshold articles on every request", async () => {
    // Only articles that pass the threshold get cached, so rejected ones are
    // re-sent to the model (and re-billed) forever. Phase 1 caches every
    // scored article and applies the threshold at read time instead.
    const openai = createFakeOpenAI(scoreByHeadline({}, "Score: 10"));
    const app = createApp({ openaiClient: openai });

    mockNytSection("technology");
    await request(app).get("/api/articles/technology");
    expect(openai.callCount).toBe(3);

    mockNytSection("technology");
    await request(app).get("/api/articles/technology");
    expect(openai.callCount).toBe(6); // all three scored a second time
  });

  it("applies limit and offset before scoring", async () => {
    mockNytSection("technology");
    const openai = createFakeOpenAI("Score: 90");

    const res = await request(createApp({ openaiClient: openai })).get(
      "/api/articles/technology?limit=1&offset=1"
    );

    expect(openai.callCount).toBe(1);
    expect(res.body.results.map((a) => a.url)).toEqual([CLOUD.url]);
  });

  it("keeps serving other articles when one model call fails", async () => {
    mockNytSection("technology");
    const openai = createFakeOpenAI((params) => {
      if (params.messages[0].content.includes("Chip Maker")) {
        throw new Error("rate limited");
      }
      return "Score: 90";
    });

    const res = await request(createApp({ openaiClient: openai })).get(
      "/api/articles/technology"
    );

    expect(res.status).toBe(200);
    expect(res.body.num_results).toBe(2);
    expect(res.body.results.map((a) => a.url)).not.toContain(CHIP.url);
  });

  it("returns 500 when the NYT request fails", async () => {
    mockNytFailure("technology");
    const openai = createFakeOpenAI("Score: 90");

    const res = await request(createApp({ openaiClient: openai })).get(
      "/api/articles/technology"
    );

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to fetch articles" });
    expect(openai.callCount).toBe(0);
  });
});
