import { Router } from "express";
import {
  getTrendingList,
  syncTrendingRepos,
} from "../controllers/find-trending.controller";

const router = Router();

router.get("/", getTrendingList);
router.post("/", syncTrendingRepos);

export default router;
