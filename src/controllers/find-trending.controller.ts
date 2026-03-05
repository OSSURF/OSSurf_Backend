import { Request, Response } from "express";
import { getTrendingRepos } from "../services/trending.service";
import { cached, cacheKeys, cacheTTL } from "../lib/cache";

export const getTrendingList = async (req: Request, res: Response) => {
  const period = (req.query.period as string) || "daily";
  try {
    const trending_repos = await cached(
      cacheKeys.trending(period),
      cacheTTL.trending,
      () => getTrendingRepos(period),
    );
    return res.json({ data: trending_repos });
  } catch (err) {
    console.error("Fetch trending error:", err);
    return res.status(500).json({ error: "Failed to fetch trending repos" });
  }
};
