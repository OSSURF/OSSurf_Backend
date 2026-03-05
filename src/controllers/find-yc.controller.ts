import { YcRepoService } from "@/services/yc-repos.service";
import { Request, Response } from "express";
import { cached, cacheKeys, cacheTTL } from "../lib/cache";

export const getYcRepos = async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = 30;
  const offset = (page - 1) * limit;

  try {
    const data = await cached(cacheKeys.ycRepos(page), cacheTTL.ycRepos, () =>
      YcRepoService(limit, offset),
    );

    res.json({
      page,
      data,
    });
  } catch (e: any) {
    console.error("Error fetching Yc repos: ", e);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
