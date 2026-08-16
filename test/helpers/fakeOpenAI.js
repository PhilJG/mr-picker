/**
 * Hand-written stand-in for the OpenAI v4 client.
 *
 * We inject a fake rather than intercepting OpenAI's HTTP traffic with nock:
 * the SDK's internal request/retry machinery makes wire-level mocking brittle
 * across SDK upgrades, and the transport is not the thing under test.
 *
 * The app makes two different kinds of call, distinguished by whether tools
 * are supplied:
 *   - scoring   (tools + forced tool_choice) -> replies with a tool call
 *   - analysis  (plain chat)                 -> replies with message content
 *
 * @param scorer   {score, rationale} or (promptText, params) => {score, rationale}
 * @param analysis string or (params) => string
 * @param raw      escape hatch: (params) => completion, overriding everything,
 *                 for testing malformed model output
 */
export const createFakeOpenAI = ({
  scorer = { score: 90, rationale: "Directly market moving." },
  analysis = "Here is the analysis.",
  raw,
} = {}) => {
  const calls = [];
  const scoringCalls = [];
  const analysisCalls = [];

  const promptOf = (params) => params.messages[params.messages.length - 1].content;

  return {
    calls,
    scoringCalls,
    analysisCalls,
    get callCount() {
      return calls.length;
    },
    get scoringCount() {
      return scoringCalls.length;
    },
    /** Headline text seen by the scorer, in call order. */
    get scoredPrompts() {
      return scoringCalls.map(promptOf);
    },

    chat: {
      completions: {
        create: async (params) => {
          calls.push(params);

          if (raw) return raw(params);

          if (params.tools) {
            scoringCalls.push(params);
            const result =
              typeof scorer === "function" ? scorer(promptOf(params), params) : scorer;

            return {
              choices: [
                {
                  message: {
                    tool_calls: [
                      {
                        id: `call_${scoringCalls.length}`,
                        type: "function",
                        function: {
                          name: "report_relevance_score",
                          arguments: JSON.stringify(result),
                        },
                      },
                    ],
                  },
                },
              ],
            };
          }

          analysisCalls.push(params);
          return {
            choices: [
              {
                message: {
                  content:
                    typeof analysis === "function" ? analysis(params) : analysis,
                },
              },
            ],
          };
        },
      },
    },
  };
};

/**
 * Build a scorer that maps a headline substring to a score.
 * Anything unmatched gets `fallback`.
 */
export const scoreByHeadline = (scoresBySubstring, fallback = 0) => (prompt) => {
  for (const [needle, score] of Object.entries(scoresBySubstring)) {
    if (prompt.includes(needle)) {
      return { score, rationale: `matched ${needle}` };
    }
  }
  return { score: fallback, rationale: "no match" };
};
