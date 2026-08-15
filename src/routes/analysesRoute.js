import { Router } from "express";
import { AnalysisError } from "../application/analysis/analyzeService.js";

export const createAnalysesRoute = ({ analysisService, logger = console }) => {
  const router = Router();

  router.get("/api/analyses", (req, res) => {
    const results = analysisService.listAnalyses({ limit: req.query.limit });
    res.json({ num_results: results.length, results });
  });

  router.get("/api/analyses/:id", (req, res) => {
    try {
      res.json(analysisService.getAnalysis(req.params.id));
    } catch (error) {
      if (error instanceof AnalysisError) {
        return res.status(error.status).json({ error: error.message });
      }

      logger.error("Error fetching analysis:", error.message);
      res.status(500).json({ error: "Failed to fetch analysis" });
    }
  });

  return router;
};
