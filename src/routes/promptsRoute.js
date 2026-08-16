import { Router } from "express";
import { AnalysisError } from "../application/analysis/analyzeService.js";

export const createPromptsRoute = ({ analysisService, logger = console }) => {
  const router = Router();

  router.get("/api/prompts", (req, res) => {
    res.json({ results: analysisService.listPrompts() });
  });

  /** Save a custom analysis prompt so it shows up alongside the built-ins. */
  router.post("/api/prompts", (req, res) => {
    const { label, promptText, description } = req.body ?? {};

    try {
      res.status(201).json(
        analysisService.savePrompt({ label, promptText, description })
      );
    } catch (error) {
      if (error instanceof AnalysisError) {
        return res.status(error.status).json({ error: error.message });
      }

      logger.error("Error saving prompt:", error.message);
      res.status(500).json({ error: "Failed to save prompt" });
    }
  });

  return router;
};
