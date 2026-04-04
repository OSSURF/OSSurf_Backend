import { Router } from "express";
import { getRankings } from "../controllers/contributors.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.get("/rankings", requireAuth, getRankings);

export default router;
