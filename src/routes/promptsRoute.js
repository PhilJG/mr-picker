import { Router } from "express";

export const createPromptsRoute = ({ analysisService }) => {
  const router = Router();

  router.get("/api/prompts", (req, res) => {
    res.json({ results: analysisService.listPrompts() });
  });

  return router;
};
