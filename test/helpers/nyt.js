import nock from "nock";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, "..", "fixtures", "nyt");

export const NYT_HOST = "https://api.nytimes.com";

/** Load a recorded NYT Top Stories payload ("cassette") from disk. */
export const loadNytFixture = (section) =>
  JSON.parse(
    readFileSync(path.join(FIXTURE_DIR, `${section}.json`), "utf8")
  );

/**
 * Replay a recorded NYT section response.
 *
 * `.query(true)` matches any query string, so the api-key never has to be
 * baked into (or scrubbed out of) a committed fixture.
 */
export const mockNytSection = (section, payload = loadNytFixture(section)) =>
  nock(NYT_HOST)
    .get(`/svc/topstories/v2/${section}.json`)
    .query(true)
    .reply(200, payload);

/** Simulate an upstream NYT failure. */
export const mockNytFailure = (section, status = 500) =>
  nock(NYT_HOST)
    .get(`/svc/topstories/v2/${section}.json`)
    .query(true)
    .reply(status, { fault: { faultstring: "upstream exploded" } });
