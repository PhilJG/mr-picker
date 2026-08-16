import { Router } from "express";
import { getSections } from "../data/sections.js";

export const createSectionsRoute = () => {
  const router = Router();

  router.get("/api/sections", (req, res) => {
    res.json(getSections());
  });

  return router;
};
