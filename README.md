# Mr Picker

Pulls headlines from the NYT Top Stories API, has an LLM grade each one 0–100
on relevance to the stock market, gathers the survivors into one pool, and runs
a user-chosen analyst persona over that pool.

## Running Locally

Requires a `.env` file:

```bash
NYT_API_KEY=...          # required
OPENAI_API_KEY=...       # required
PORT=3000                # optional, default 3000
OPENAI_MODEL=gpt-4o-mini # optional, default gpt-4o-mini
RELEVANCE_THRESHOLD=80   # optional, default 80 — the one place the cutoff lives
SCORING_CONCURRENCY=5    # optional, default 5 — parallel scoring calls
CACHE_TTL_SECONDS=3600   # optional, default 3600
```

```bash
npm install
npm start      # node src/server.js
npm run dev    # nodemon src/server.js — restarts on file changes
```

## Testing

```bash
npm test        # vitest, single run
npm run test:watch
```

Tests never touch the network. NYT responses are replayed from cassettes in
`test/fixtures/nyt/`, and the OpenAI client is injected as a fake. Any HTTP
request without a matching cassette fails the test rather than reaching a live
API. To refresh a cassette from the real NYT API:

```bash
npm run record-fixtures technology business
```

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/sections` | The NYT section names you can fetch |
| `GET /api/articles/:section` | Fetch a section, score each article, return those over the threshold. Query: `limit`, `offset`, `minScore` |
| `GET /api/headlines` | Every scored headline gathered so far, across sections. Query: `minScore`, `section`, `limit` |
| `GET /api/prompts` | Built-in analyst personas |
| `POST /api/analyze` | Run a persona (`promptId`) or your own `customPromptText` over the headlines. Optional `headlineFilter` |

```bash
curl http://localhost:3000/api/sections
curl "http://localhost:3000/api/articles/technology?limit=3"
curl http://localhost:3000/api/headlines
curl http://localhost:3000/api/prompts
curl -X POST http://localhost:3000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"promptId":"michael-burry"}'
```

## Architecture

Three layers, described in `docs/codebase-overview.md`:

```
src/
  config/       env + the single relevance threshold
  data/         NYT client, article store, section list
  application/  scoring, aggregation, analysis
  routes/       thin HTTP handlers
```

Scoring uses OpenAI tool calling, so a score arrives as typed JSON rather than
prose that has to be regex-scraped. The threshold is applied in code only —
never as an instruction in the prompt.

## Roadmap

Built:

- [x] Scan and filter the NYT API, scoring each headline for market relevance
- [x] Gather scored headlines into one cross-section pool
- [x] Choose a built-in analyst persona or write your own, and run it

Next:

- [ ] Persist articles, custom prompts, and past analyses to SQLite
- [ ] React + Vite UI over the API
- [ ] Classify which industries an article is relevant to
- [ ] Select stocks based on industry and relevance; look for correlated names
- [ ] Paper-trade on that information

## Technologies and techniques to look into

- **_Alpha Vantage API_** for pulling stock data
- **_Cron job_** running continuously, locally
- **_Investopedia fake trading account_**
- **_NYT Newswire API_** — an up-to-the-minute stream of articles as they are
  published, rather than the Top Stories snapshot used today. Useful for a
  tracker that updates as new articles appear; polling every ~20 minutes is a
  common configuration.
