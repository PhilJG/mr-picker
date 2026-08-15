import nock from "nock";
import { beforeAll, afterEach, afterAll } from "vitest";

// Deterministic env for every test run. Real keys are never needed: NYT calls
// are replayed from cassettes and the OpenAI client is injected as a fake.
process.env.NYT_API_KEY = "test-nyt-key";
process.env.OPENAI_API_KEY = "test-openai-key";

beforeAll(() => {
  // Lockdown: any HTTP request that isn't explicitly mocked fails loudly
  // instead of silently hitting the real network (and real API budgets).
  nock.disableNetConnect();
  // supertest binds an ephemeral local port, so loopback must stay open.
  nock.enableNetConnect((host) => /^(127\.0\.0\.1|localhost|\[::1\])/.test(host));
});

afterEach(() => {
  nock.cleanAll();
});

afterAll(() => {
  nock.enableNetConnect();
});
