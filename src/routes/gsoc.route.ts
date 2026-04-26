import { Router } from "express";
import { findGSOC } from "../controllers/find-gsoc.controller";

const router = Router();

router.get("/", findGSOC);

export default router;
