import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp, NYT_SECTIONS } from "../app.js";
import { createFakeOpenAI } from "./helpers/fakeOpenAI.js";

const buildApp = () =>
  createApp({ openaiClient: createFakeOpenAI("Score: 90") });

describe("GET /api/sections", () => {
  it("returns the full hardcoded NYT section list", async () => {
    const res = await request(buildApp()).get("/api/sections");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(NYT_SECTIONS);
  });

  it("includes the sections the UI will depend on", async () => {
    const res = await request(buildApp()).get("/api/sections");

    expect(res.body).toEqual(
      expect.arrayContaining(["business", "technology", "politics", "world"])
    );
    expect(res.body).toHaveLength(26);
  });
});
