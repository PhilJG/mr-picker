import { describe, it, expect, afterEach } from "vitest";
import { assertRequiredEnv } from "../src/config/env.js";

const original = { ...process.env };

afterEach(() => {
  process.env.NYT_API_KEY = original.NYT_API_KEY;
  process.env.OPENAI_API_KEY = original.OPENAI_API_KEY;
});

describe("assertRequiredEnv", () => {
  it("passes when both keys are present", () => {
    expect(() => assertRequiredEnv()).not.toThrow();
  });

  it("names every missing key so boot fails before the first request", () => {
    delete process.env.NYT_API_KEY;
    delete process.env.OPENAI_API_KEY;

    expect(() => assertRequiredEnv()).toThrow(/NYT_API_KEY, OPENAI_API_KEY/);
  });

  it("names just the one that is missing", () => {
    delete process.env.OPENAI_API_KEY;

    expect(() => assertRequiredEnv()).toThrow(/Missing required environment variable\(s\): OPENAI_API_KEY/);
  });
});
