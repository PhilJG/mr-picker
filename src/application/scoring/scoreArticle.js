/**
 * Relevance scoring.
 *
 * Every article gets a score. The prompt deliberately contains no threshold
 * and no "stay silent if low" instruction — filtering is the application's
 * job, not the model's. Mixing the two is what produced the old bug where
 * the prompt said 80 and the code checked 75.
 */

export const SCORING_TOOL_NAME = "report_relevance_score";

export const SCORING_TOOL = {
  type: "function",
  function: {
    name: SCORING_TOOL_NAME,
    description:
      "Report how relevant a news article is to the stock market, as a score from 0 to 100.",
    parameters: {
      type: "object",
      properties: {
        score: {
          type: "integer",
          minimum: 0,
          maximum: 100,
          description:
            "0 means no bearing on equity markets at all. 100 means directly and immediately market-moving.",
        },
        rationale: {
          type: "string",
          description:
            "One or two sentences explaining the score, naming any sectors or tickers implicated.",
        },
      },
      required: ["score", "rationale"],
      additionalProperties: false,
    },
  },
};

const SCORING_SYSTEM_PROMPT = [
  "You are a financial news analyst.",
  "For each article you are given, judge how relevant it is to the stock market",
  "and report it using the report_relevance_score tool.",
  "Score every article you are given, however low the score.",
].join(" ");

export const buildScoringPrompt = (article) => {
  const parts = [`Headline: ${article.title}`];
  if (article.abstract) parts.push(`Summary: ${article.abstract}`);
  if (article.section) parts.push(`Section: ${article.section}`);
  return parts.join("\n");
};

export class ScoringError extends Error {
  constructor(message, { cause } = {}) {
    super(message, { cause });
    this.name = "ScoringError";
  }
}

const parseToolResult = (completion) => {
  const toolCall = completion?.choices?.[0]?.message?.tool_calls?.[0];

  if (!toolCall) {
    throw new ScoringError("model returned no tool call");
  }

  let args;
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch (error) {
    throw new ScoringError("model returned unparseable tool arguments", {
      cause: error,
    });
  }

  const score = Number(args.score);
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new ScoringError(`model returned an out-of-range score: ${args.score}`);
  }

  return { score, rationale: String(args.rationale ?? "") };
};

/**
 * @returns an async fn: (article) => {score, rationale, model, scored_at}
 */
export const createScorer = ({ client, model }) => async (article) => {
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SCORING_SYSTEM_PROMPT },
      { role: "user", content: buildScoringPrompt(article) },
    ],
    tools: [SCORING_TOOL],
    // Force the tool so the reply is always structured, never prose we'd
    // have to regex.
    tool_choice: { type: "function", function: { name: SCORING_TOOL_NAME } },
  });

  return {
    ...parseToolResult(completion),
    model,
    scored_at: new Date().toISOString(),
  };
};
