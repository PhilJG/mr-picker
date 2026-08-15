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
    articleStore.js          get/save/all/count over scored articles

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
```

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
  client and a pre-seeded store; no module mocking, no live network.
- **`articleStore` is the swap seam.** Phase 2 replaces its body with SQLite
  without touching the services above it.

## Testing

Vitest + supertest, with nock in lockdown: an un-cassetted HTTP request fails the
test instead of hitting a real API. `test/helpers/fakeOpenAI.js` distinguishes
scoring calls (tools present → replies with a tool call) from analysis calls
(replies with content), so one fake serves both paths.

## Known gaps

- Storage is in-memory, so everything is lost on restart (Phase 2: SQLite).
- Custom prompts are accepted but not saved (Phase 2).
- Analysis results are returned but not recorded (Phase 2).
- No UI (Phase 3).
- Industry classification and stock selection from the roadmap are unbuilt.
