import { Router } from "express";
import { AnalysisError } from "../application/analysis/analyzeService.js";

export const createAnalyzeRoute = ({ analysisService, logger = console }) => {
  const router = Router();

  router.post("/api/analyze", async (req, res) => {
    const { promptId, customPromptText, headlineFilter } = req.body ?? {};

    try {
      const analysis = await analysisService.run({
        promptId,
        customPromptText,
        headlineFilter,
      });

      res.json(analysis);
    } catch (error) {
      if (error instanceof AnalysisError) {
        return res.status(error.status).json({ error: error.message });
      }

      logger.error("Error running analysis:", error.message);
      res.status(500).json({ error: "Failed to run analysis" });
    }
  });

  return router;
};
