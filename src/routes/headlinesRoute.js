import { Router } from "express";

export const createHeadlinesRoute = ({ aggregateService }) => {
  const router = Router();

  /** Every scored headline gathered so far, across all fetched sections. */
  router.get("/api/headlines", (req, res) => {
    const { minScore, section, since, limit } = req.query;
    const results = aggregateService.getHeadlines({
      minScore,
      section,
      since,
      limit,
    });

    res.json({ num_results: results.length, results });
  });

  return router;
};
