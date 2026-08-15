/**
 * Unit tests for the scorer: the structured-output contract that replaced
 * regex-scraping a score out of prose.
 */
import { describe, it, expect } from "vitest";
import {
  createScorer,
  buildScoringPrompt,
  ScoringError,
  SCORING_TOOL,
  SCORING_TOOL_NAME,
} from "../src/application/scoring/scoreArticle.js";

const ARTICLE = {
  title: "Chip Maker Warns of Steep Drop in Data Center Orders",
  abstract: "The company cut its quarterly guidance by nearly a third.",
  section: "technology",
  url: "https://example.com/chip",
};

const clientReturning = (completion) => ({
  lastParams: null,
  chat: {
    completions: {
      create: async function (params) {
        client.lastParams = params;
        return typeof completion === "function" ? completion(params) : completion;
      },
    },
  },
});

// eslint-disable-next-line no-var
var client;

const toolCompletion = (args) => ({
  choices: [
    {
      message: {
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: SCORING_TOOL_NAME,
              arguments: typeof args === "string" ? args : JSON.stringify(args),
            },
          },
        ],
      },
    },
  ],
});

describe("buildScoringPrompt", () => {
  it("includes headline, abstract and section", () => {
    const prompt = buildScoringPrompt(ARTICLE);

    expect(prompt).toContain(ARTICLE.title);
    expect(prompt).toContain(ARTICLE.abstract);
    expect(prompt).toContain("technology");
  });

  it("omits the abstract line when there isn't one", () => {
    const prompt = buildScoringPrompt({ title: "Bare headline" });

    expect(prompt).toBe("Headline: Bare headline");
  });
});

describe("SCORING_TOOL", () => {
  it("constrains the score to an integer between 0 and 100", () => {
    const { score } = SCORING_TOOL.function.parameters.properties;

    expect(score.type).toBe("integer");
    expect(score.minimum).toBe(0);
    expect(score.maximum).toBe(100);
    expect(SCORING_TOOL.function.parameters.required).toEqual([
      "score",
      "rationale",
    ]);
  });
});

describe("createScorer", () => {
  it("forces the tool call so the reply is never free prose", async () => {
    client = clientReturning(toolCompletion({ score: 88, rationale: "why" }));
    const scorer = createScorer({ client, model: "gpt-4o-mini" });

    await scorer(ARTICLE);

    expect(client.lastParams.tool_choice).toEqual({
      type: "function",
      function: { name: SCORING_TOOL_NAME },
    });
    expect(client.lastParams.model).toBe("gpt-4o-mini");
  });

  it("returns the parsed score, rationale and provenance", async () => {
    client = clientReturning(
      toolCompletion({ score: 88, rationale: "Guidance cut hits semis." })
    );
    const scorer = createScorer({ client, model: "gpt-4o-mini" });

    const result = await scorer(ARTICLE);

    expect(result).toMatchObject({
      score: 88,
      rationale: "Guidance cut hits semis.",
      model: "gpt-4o-mini",
    });
    expect(Date.parse(result.scored_at)).not.toBeNaN();
  });

  it("accepts the boundary scores", async () => {
    for (const score of [0, 100]) {
      client = clientReturning(toolCompletion({ score, rationale: "edge" }));
      const scorer = createScorer({ client, model: "m" });
      await expect(scorer(ARTICLE)).resolves.toMatchObject({ score });
    }
  });

  it("throws when the model answers in prose instead of calling the tool", async () => {
    client = clientReturning({
      choices: [{ message: { content: "I'd say about 95 out of 100." } }],
    });
    const scorer = createScorer({ client, model: "m" });

    await expect(scorer(ARTICLE)).rejects.toThrow(ScoringError);
  });

  it("throws on unparseable tool arguments", async () => {
    client = clientReturning(toolCompletion("{not json"));
    const scorer = createScorer({ client, model: "m" });

    await expect(scorer(ARTICLE)).rejects.toThrow(/unparseable/i);
  });

  it.each([
    ["out of range high", 101],
    ["out of range low", -1],
    ["not an integer", 87.5],
    ["not a number", "very relevant"],
  ])("rejects a score that is %s", async (_label, score) => {
    client = clientReturning(toolCompletion({ score, rationale: "r" }));
    const scorer = createScorer({ client, model: "m" });

    await expect(scorer(ARTICLE)).rejects.toThrow(ScoringError);
  });
});
