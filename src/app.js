import express from "express";
import { rateLimit } from "express-rate-limit";

import { config } from "./config/env.js";
import { createNytClient } from "./data/nytClient.js";
import { createArticleStore } from "./data/articleStore.js";
import { createOpenAiClient } from "./application/scoring/openaiClient.js";
import { createScorer } from "./application/scoring/scoreArticle.js";
import { createArticleService } from "./application/articles/articleService.js";
import { createAggregateService } from "./application/articles/aggregateService.js";
import { createAnalysisService } from "./application/analysis/analyzeService.js";
import { createSectionsRoute } from "./routes/sectionsRoute.js";
import { createArticlesRoute } from "./routes/articlesRoute.js";
import { createHeadlinesRoute } from "./routes/headlinesRoute.js";
import { createPromptsRoute } from "./routes/promptsRoute.js";
import { createAnalyzeRoute } from "./routes/analyzeRoute.js";

/**
 * Composition root: every dependency is built here and passed down, so tests
 * can substitute fakes and Phase 2 can swap the store for SQLite by changing
 * one line.
 */
export const createApp = ({
  openaiClient,
  store,
  nytClient,
  nytApiKey = config.nytApiKey,
  openaiApiKey = config.openaiApiKey,
  model = config.openaiModel,
  threshold = config.relevanceThreshold,
  concurrency = config.scoringConcurrency,
  cacheTtlSeconds = config.cacheTtlSeconds,
  logger = console,
} = {}) => {
  const app = express();

  const client = openaiClient ?? createOpenAiClient(openaiApiKey);
  const articleStore = store ?? createArticleStore({ ttlSeconds: cacheTtlSeconds });
  const nyt = nytClient ?? createNytClient({ apiKey: nytApiKey });

  const articleService = createArticleService({
    nytClient: nyt,
    store: articleStore,
    scorer: createScorer({ client, model }),
    threshold,
    concurrency,
    logger,
  });

  const aggregateService = createAggregateService({
    store: articleStore,
    threshold,
  });

  const analysisService = createAnalysisService({
    client,
    model,
    aggregateService,
  });

  app.use(express.json());
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
    })
  );

  app.use(createSectionsRoute());
  app.use(createArticlesRoute({ articleService, logger }));
  app.use(createHeadlinesRoute({ aggregateService }));
  app.use(createPromptsRoute({ analysisService }));
  app.use(createAnalyzeRoute({ analysisService, logger }));

  return app;
};

export default createApp;
