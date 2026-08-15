import { Router } from "express";
import { isValidSection } from "../data/sections.js";

export const createArticlesRoute = ({ articleService, logger = console }) => {
  const router = Router();

  // ":section(*)" so slashed section names like "books/review" resolve —
  // a plain ":section" never matched them.
  router.get("/api/articles/:section(*)", async (req, res) => {
    const { section } = req.params;

    if (!isValidSection(section)) {
      return res.status(400).json({
        error: `Unknown section "${section}". See GET /api/sections.`,
      });
    }

    try {
      const { limit, offset, minScore } = req.query;
      const { status, results } = await articleService.getSectionArticles(
        section,
        { limit, offset, minScore }
      );

      res.json({ status, num_results: results.length, results });
    } catch (error) {
      logger.error("Error fetching articles:", error.message);
      res.status(500).json({ error: "Failed to fetch articles" });
    }
  });

  return router;
};
