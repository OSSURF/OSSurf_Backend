import { Router } from "express";
import { getTrendingList } from "../controllers/find-trending.controller";

const router = Router();

router.get("/", getTrendingList);

export default router;
