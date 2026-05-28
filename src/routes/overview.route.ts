import { requireAuth } from "@/middleware/auth.middleware";
import { Router } from "express";
import { getOverview } from "../controllers/overview.controller";

const router = Router();

router.use(requireAuth);

router.get("/", getOverview);

export default router;
