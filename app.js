import express from "express";
import axios from "axios";
import OpenAI from "openai";
import NodeCache from "node-cache";
import { rateLimit } from "express-rate-limit";

// NYT API configuration
const NYT_BASE_URL = "https://api.nytimes.com/svc/topstories/v2";

// Top Stories API section names (no live endpoint exists to list these)
export const NYT_SECTIONS = [
  "arts", "automobiles", "books/review", "business", "fashion", "food",
  "health", "home", "insider", "magazine", "movies", "nyregion",
  "obituaries", "opinion", "politics", "realestate", "science", "sports",
  "sundayreview", "technology", "theater", "t-magazine", "travel",
  "upshot", "us", "world",
];

/**
 * Build the Express app.
 *
 * Dependencies are injected so tests can supply a fake OpenAI client and an
 * isolated cache instead of reaching out to the real APIs. Env vars are read
 * here rather than at module scope so dotenv.config() runs before we read them.
 */
export const createApp = ({
  openaiClient,
  cache = new NodeCache({ stdTTL: 3600 }), // Cache for 1 hour
  nytApiKey = process.env.NYT_API_KEY,
} = {}) => {
  const app = express();

  const client =
    openaiClient ?? new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  });

  // Middleware
  app.use(express.json());
  app.use(limiter);

  // Function to process a single article
  const processArticle = async (article) => {
    try {
      const completion = await client.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "user",
            content:
              "You are the investor Michael Burry. Review the following article headline and rate a score between 0 and 100 on how relevant this article is to the stock market. Also, as Michael Burry what would you do with this information as an investor which stocks would he buy or sell. But if the score is below 80, then don't give a response. Keep the response brief (2 or 3 sentances only).  Here is the headline: " +
              article.title,
          },
        ],
      });

      const response = completion.choices[0].message.content;
      const scoreMatch = response.match(/(?:Score|Relevance Score):\s*(\d+)/i);

      if (scoreMatch) {
        const score = parseInt(scoreMatch[1]);
        if (score >= 75) {
          article.analysis = response;
          cache.set(article.url, article); // Cache the processed article
          return article;
        }
      }
      return null;
    } catch (error) {
      console.error(
        `Error processing article "${article.title}":`,
        error.message
      );
      return null;
    }
  };

  // Routes
  app.get("/api/sections", async (req, res) => {
    res.json(NYT_SECTIONS);
  });

  app.get("/api/articles/:section", async (req, res) => {
    try {
      const { section } = req.params;
      const { limit = 100, offset = 0 } = req.query;

      const response = await axios.get(`${NYT_BASE_URL}/${section}.json`, {
        params: {
          "api-key": nytApiKey,
        },
      });

      // Map over the results to select specific properties
      const selectedArticles = response.data.results
        .slice(Number(offset), Number(offset) + Number(limit))
        .map((article) => ({
          title: article.title,
          url: article.url,
          published_date: article.published_date,
        }));

      const relevantArticles = [];
      const processingPromises = [];

      // Process articles in parallel with caching
      for (const article of selectedArticles) {
        const cachedArticle = cache.get(article.url);
        if (cachedArticle) {
          relevantArticles.push(cachedArticle);
          continue;
        }

        processingPromises.push(processArticle(article));
      }

      // Wait for all processing to complete
      const processedArticles = await Promise.all(processingPromises);
      const newRelevantArticles = processedArticles.filter(
        (article) => article !== null
      );
      relevantArticles.push(...newRelevantArticles);

      res.json({
        status: response.data.status,
        num_results: relevantArticles.length,
        results: relevantArticles,
      });
    } catch (error) {
      console.error("Error fetching articles:", error.message);
      res.status(500).json({ error: "Failed to fetch articles" });
    }
  });

  return app;
};

export default createApp;
