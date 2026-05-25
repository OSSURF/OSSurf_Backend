import { Request, Response } from "express";
import { getTrendingRepos } from "../services/trending.service";
import { cached, cacheKeys, cacheTTL } from "../lib/cache";

export const getTrendingList = async (req: Request, res: Response) => {
  const period = (req.query.period as string) || "daily";
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(req.query.perPage) || 30));

  try {
    const trending_repos = await cached(
      cacheKeys.trending(period, page, perPage),
      cacheTTL.trending,
      async () => {
        const allRepos = await getTrendingRepos(period);
        const start = (page - 1) * perPage;
        return allRepos.slice(start, start + perPage);
      },
    );

    const allRepos = await getTrendingRepos(period);
    const total = allRepos.length;
    const totalPages = Math.ceil(total / perPage);

    return res.json({
      page,
      perPage,
      total,
      totalPages,
      data: trending_repos,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    });
  } catch (err) {
    console.error("Fetch trending error:", err);
    return res.status(500).json({ error: "Failed to fetch trending repos" });
  }
};
