import { Router } from "express";
import { getRankings } from "../controllers/contributors.controller";

const router = Router();

router.get("/rankings", getRankings);

export default router;

