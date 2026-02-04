import { Router } from 'express';
import { getYcRepos } from "@/controllers/find-yc.controller";

const router = Router();

router.get('/', getYcRepos);

export default router;
