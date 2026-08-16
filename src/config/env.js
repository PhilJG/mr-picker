import dotenv from "dotenv";

dotenv.config();

const int = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: int(process.env.PORT, 3000),

  nytApiKey: process.env.NYT_API_KEY,

  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",

  /**
   * The single source of truth for "is this article market-relevant enough
   * to surface". Applied in code when reading articles back out of the store
   * — never as an instruction inside the prompt, which is what caused the
   * old 75-in-code / 80-in-prompt mismatch.
   */
  relevanceThreshold: int(process.env.RELEVANCE_THRESHOLD, 80),

  /** How many articles to score concurrently, to stay under rate limits. */
  scoringConcurrency: int(process.env.SCORING_CONCURRENCY, 5),

  /** ":memory:" gives each process a private throwaway database. */
  sqlitePath: process.env.SQLITE_PATH || "data/mr-picker.sqlite",
};

/** Fail fast at boot rather than at the first request. */
export const assertRequiredEnv = () => {
  const missing = ["NYT_API_KEY", "OPENAI_API_KEY"].filter(
    (key) => !process.env[key]
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        "Add them to .env — see README.md."
    );
  }
};
