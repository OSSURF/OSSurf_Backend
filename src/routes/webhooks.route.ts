import { Router } from "express";
import { handleTrendingWebhook } from "../controllers/webhooks.controller";

const router = Router();


router.post("/trending", handleTrendingWebhook);

export default router;
