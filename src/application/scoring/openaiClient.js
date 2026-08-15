import OpenAI from "openai";

/**
 * Factory so callers (and tests) control which client the app talks to.
 * Tests inject a fake instead of mocking the SDK's HTTP transport.
 */
export const createOpenAiClient = (apiKey) => new OpenAI({ apiKey });
