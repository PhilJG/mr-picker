import express from "express";
import { rateLimit } from "express-rate-limit";

import { config } from "./config/env.js";
import { openDatabase } from "./data/db.js";
import { createNytClient } from "./data/nytClient.js";
import { createArticlesRepo } from "./data/articlesRepo.js";
import { createPromptsRepo } from "./data/promptsRepo.js";
import { createAnalysesRepo } from "./data/analysesRepo.js";
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
import { createAnalysesRoute } from "./routes/analysesRoute.js";

/**
 * Composition root: every dependency is built here and passed down, so tests
 * can substitute a fake model client and an in-memory database.
 */
export const createApp = ({
  openaiClient,
  nytClient,
  db = openDatabase({ path: config.sqlitePath }),
  nytApiKey = config.nytApiKey,
  openaiApiKey = config.openaiApiKey,
  model = config.openaiModel,
  threshold = config.relevanceThreshold,
  concurrency = config.scoringConcurrency,
  logger = console,
} = {}) => {
  const app = express();

  const client = openaiClient ?? createOpenAiClient(openaiApiKey);
  const nyt = nytClient ?? createNytClient({ apiKey: nytApiKey });

  const articlesRepo = createArticlesRepo(db);
  const promptsRepo = createPromptsRepo(db);
  const analysesRepo = createAnalysesRepo(db);

  const articleService = createArticleService({
    nytClient: nyt,
    store: articlesRepo,
    scorer: createScorer({ client, model }),
    threshold,
    concurrency,
    logger,
  });

  const aggregateService = createAggregateService({
    store: articlesRepo,
    threshold,
  });

  const analysisService = createAnalysisService({
    client,
    model,
    aggregateService,
    promptsRepo,
    analysesRepo,
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
  app.use(createPromptsRoute({ analysisService, logger }));
  app.use(createAnalyzeRoute({ analysisService, logger }));
  app.use(createAnalysesRoute({ analysisService, logger }));

  // Exposed for tests and for a future graceful shutdown.
  app.locals.db = db;

  return app;
};

export default createApp;
