import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import OpenAI from "openai";
import NodeCache from "node-cache";
import { rateLimit } from "express-rate-limit";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Cache configuration
const cache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

// NYT API configuration
const NYT_API_KEY = process.env.NYT_API_KEY;
const NYT_BASE_URL = "https://api.nytimes.com/svc/news/v3/content";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Middleware
app.use(express.json());
app.use(limiter);

const client = new OpenAI({ apiKey: `${OPENAI_API_KEY}` });

// Function to check if article is already processed
const isArticleProcessed = async (articleId) => {
  return cache.has(articleId);
};

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

    console.log(response);

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
  try {
    const response = await axios.get(`${NYT_BASE_URL}/section-list.json`, {
      params: {
        "api-key": NYT_API_KEY,
      },
    });
    res.json(response.data.results.title);
  } catch (error) {
    console.error("Error fetching sections:", error.message);
    res.status(500).json({ error: "Failed to fetch sections" });
  }
});

app.get("/api/articles/:section", async (req, res) => {
  try {
    const { section } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const response = await axios.get(`${NYT_BASE_URL}/all/${section}.json`, {
      params: {
        "api-key": NYT_API_KEY,
        limit,
        offset,
      },
    });

    // Map over the results to select specific properties
    const selectedArticles = response.data.results.map((article) => ({
      title: article.title,
      // abstract: article.abstract,
      url: article.url,
      published_date: article.published_date,
      // section: article.section,
      // des_facet: article.des_facet,
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

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
