# Codebase overview

Reference for how Mr Picker fits together. Keep this current — it's the map you
hand an LLM (or yourself, in three months) before asking for changes.

## What it does

1. Fetches a section of NYT Top Stories.
2. Asks an LLM to score each article 0–100 on stock-market relevance.
3. Stores every scored article and returns the ones over the threshold.
4. Pools scored headlines across sections into one view.
5. Runs a user-chosen analyst persona — built-in or custom — over that pool.

## Layers

Data flows one direction: **data → application → routes**. Nothing in `data/`
knows about HTTP; nothing in `routes/` knows about axios or the OpenAI SDK.

```
src/
  server.js                  bootstrap: validate env, listen
  app.js                     composition root: builds every dependency, wires routes

  config/env.js              env parsing + the single RELEVANCE_THRESHOLD
                             assertRequiredEnv() fails boot, not the first request

  data/
    sections.js              the NYT section list (no live endpoint publishes it)
    nytClient.js             fetchTopStories(section) -> normalized articles
    db.js                    opens SQLite, creates schema, seeds built-in prompts
    articlesRepo.js          get/save/all/count/findHeadlines over scored articles
    promptsRepo.js           built-in + user-saved analysis prompts
    analysesRepo.js          a record of every analysis run

  application/
    scoring/
      openaiClient.js        client factory (injectable)
      scoreArticle.js        SCORING_TOOL schema + createScorer()
    articles/
      articleService.js      fetch -> score what's new -> store all -> filter on read
      aggregateService.js    cross-section pool, sorted by score
    analysis/
      prompts.js             built-in analyst personas
      analyzeService.js      resolve prompt, render headlines, one model call

  routes/                    thin HTTP handlers, one file per endpoint
  util/concurrency.js        bounded parallelism for scoring calls

ui/                          React + Vite SPA, its own package
  src/api.js                 relative-path fetch wrapper
  src/hooks.js               useResource: fetch on mount + manual reload
  src/App.jsx                holds shared state (minScore, selected prompt)
  src/components/            SectionFetcher, HeadlineFeed, PromptPicker,
                             AnalysisRunner, AnalysisHistory
```

## UI

Four steps down the page, matching the flow: gather headlines (fetch and score
a section) -> review the pool -> pick an analyst -> run it, with history below.

- **Vite proxy, not CORS.** `/api` is proxied to the API in dev, so the UI uses
  same-origin relative paths that behave identically if Express ever serves the
  built bundle. `API_TARGET` overrides the target port.
- **Plain fetch + a small `useResource` hook, not react-query.** No background
  refetch, cross-tab invalidation, or optimistic updates are needed here.
- **Fetching a section is an explicit button**, because it is the only action
  that spends money on model calls.
- Tests (`cd ui && npm test`) mount the real app under jsdom against a stubbed
  `fetch`, so the request paths and bodies the UI sends are asserted too.

## Request flow

`GET /api/articles/technology`

```
articlesRoute            validates the section against sections.js -> 400 if unknown
  articleService         fetches via nytClient, slices by limit/offset
    scoreArticle         one forced tool call per unscored article, max 5 in flight
    articleStore.save    EVERY scored article is stored, whatever the score
  articleService         reads back, keeps score >= threshold
articlesRoute            { status, num_results, results }
```

`POST /api/analyze`

```
analyzeRoute             body: promptId XOR customPromptText, optional headlineFilter
  analyzeService         resolves the prompt (404 on unknown id, 400 if both/neither)
    aggregateService     pulls the filtered headline pool from the store
  analyzeService         ONE model call: persona as system, headline list as user turn
analyzeRoute             { result, promptUsed, headlineCount, headlineFilter }
```

## External dependencies

- **NYT Top Stories API v2** — `https://api.nytimes.com/svc/topstories/v2/{section}.json`,
  key passed as an `api-key` query param. Replayed from cassettes in tests.
- **OpenAI** — chat completions. Two distinct uses:
  - *scoring*: forced tool call, structured `{score, rationale}`, one per article
  - *analysis*: plain completion, one per run, sees the whole headline pool

## Design decisions worth knowing

- **The threshold lives in exactly one place** (`config.relevanceThreshold`) and is
  applied when reading articles out of the store. It is deliberately absent from
  the prompt. The original code told the model "don't respond below 80" *and*
  filtered at `>= 75` in code — two disagreeing thresholds, one of them enforced
  by a model instruction that could simply be ignored.
- **Scores come back as tool calls, not prose.** The original regex-scraped
  `Score: NN` out of free text; any formatting the regex missed made the article
  silently vanish.
- **Low scorers are stored too.** Only caching passing articles meant rejected
  ones were re-sent to the model on every request, costing money for a result
  already known. Storing everything is also what makes the aggregate view and
  re-analysis possible without re-fetching.
- **Everything is injected through `createApp`.** Tests substitute a fake OpenAI
  client and a pre-seeded in-memory database; no module mocking, no live network.
- **The repos are the swap seam.** Services depend on `get/save/findHeadlines`,
  not on SQL. Moving to Postgres later means rewriting `data/*Repo.js` and
  nothing above it.
- **No cache in front of SQLite.** better-sqlite3 is synchronous and local, so
  reads are microseconds; a cache would add a second source of truth to keep in
  sync, and a second store implementation free to drift from the real one.
- **`prompt_text_snapshot`** records the prompt text that actually ran, so
  editing a saved prompt later doesn't rewrite the history of past analyses.
- **Built-in prompts are code-owned.** They're upserted on every boot, but the
  upsert is guarded by `is_builtin = 1`, so user prompts are never touched.

## Data

SQLite via better-sqlite3, at `SQLITE_PATH` (default `data/mr-picker.sqlite`).
Schema is created idempotently on boot — no migration framework until there's
an actual second migration to run.

| Table | Holds |
| --- | --- |
| `articles` | one row per URL: the article, its score, rationale, and which model scored it |
| `analysis_prompts` | built-in personas (seeded from code) and user-saved prompts |
| `analyses` | every run: prompt snapshot, filter, result, headline count |

## Testing

Vitest + supertest, with nock in lockdown: an un-cassetted HTTP request fails the
test instead of hitting a real API. `test/helpers/fakeOpenAI.js` distinguishes
scoring calls (tools present → replies with a tool call) from analysis calls
(replies with content), so one fake serves both paths.

## Known gaps

- Articles accumulate forever; `since` filters the pool but nothing prunes it.
- Express does not serve the built UI bundle; the two run as separate processes.
- Industry classification and stock selection from the roadmap are unbuilt.
