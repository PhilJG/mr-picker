/**
 * Refresh NYT cassettes from the live Top Stories API.
 *
 * Fixtures under test/fixtures/nyt/ are replayed by the test suite so tests
 * never touch the network. Run this when you want them to reflect the real API
 * again (e.g. after an upstream schema change).
 *
 *   node scripts/record-fixtures.js technology business
 *
 * Requires NYT_API_KEY in .env. The key is a query param and is never written
 * to the fixture — only the response body is saved.
 */
import axios from "axios";
import dotenv from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, "..", "test", "fixtures", "nyt");
const NYT_BASE_URL = "https://api.nytimes.com/svc/topstories/v2";

const sections = process.argv.slice(2);

if (sections.length === 0) {
  console.error("Usage: node scripts/record-fixtures.js <section> [...]");
  process.exit(1);
}

if (!process.env.NYT_API_KEY) {
  console.error("NYT_API_KEY is not set (add it to .env).");
  process.exit(1);
}

mkdirSync(FIXTURE_DIR, { recursive: true });

for (const section of sections) {
  try {
    const { data } = await axios.get(`${NYT_BASE_URL}/${section}.json`, {
      params: { "api-key": process.env.NYT_API_KEY },
    });

    const outfile = path.join(FIXTURE_DIR, `${section.replace(/\//g, "-")}.json`);
    writeFileSync(outfile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    console.log(`recorded ${data.results?.length ?? 0} articles -> ${outfile}`);
  } catch (error) {
    console.error(`failed to record "${section}":`, error.message);
    process.exitCode = 1;
  }
}
