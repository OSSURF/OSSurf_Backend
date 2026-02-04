import { Router } from "express";
import { getProfile } from "../controllers/profile.controller";

const router = Router();

router.get("/:username", getProfile);

export default router;
