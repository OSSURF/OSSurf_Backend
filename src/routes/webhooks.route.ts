import { Router } from "express";
import { handleTrendingWebhook } from "../controllers/webhooks.controller";

const router = Router();

// Endpoint matched to the scraper payload format
router.post("/trending", handleTrendingWebhook);

export default router;
