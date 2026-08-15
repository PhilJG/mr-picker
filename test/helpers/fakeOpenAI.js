/**
 * Hand-written stand-in for the OpenAI v4 client.
 *
 * We inject a fake rather than intercepting OpenAI's HTTP traffic with nock:
 * the SDK's internal request/retry machinery makes wire-level mocking brittle
 * across SDK upgrades, and the transport is not the thing under test.
 *
 * @param responder Either a fixed completion string, or a function
 *                  (params, callIndex) => string, so a test can vary the
 *                  reply per article (e.g. by reading the headline out of the
 *                  prompt).
 */
export const createFakeOpenAI = (responder) => {
  const calls = [];

  return {
    calls,
    get callCount() {
      return calls.length;
    },
    /** Headlines seen so far, in call order (parsed out of the prompt text). */
    get scoredTitles() {
      return calls.map((params) => {
        const content = params.messages[params.messages.length - 1].content;
        return content.split("Here is the headline: ")[1] ?? content;
      });
    },
    chat: {
      completions: {
        create: async (params) => {
          calls.push(params);
          const content =
            typeof responder === "function"
              ? responder(params, calls.length - 1)
              : responder;
          return { choices: [{ message: { content } }] };
        },
      },
    },
  };
};

/** Builds a responder that maps a headline substring to a score. */
export const scoreByHeadline = (scoresBySubstring, fallback = "Score: 0") => {
  return (params) => {
    const content = params.messages[params.messages.length - 1].content;
    for (const [needle, reply] of Object.entries(scoresBySubstring)) {
      if (content.includes(needle)) return reply;
    }
    return fallback;
  };
};
