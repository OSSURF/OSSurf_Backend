import { YcRepoService } from "@/services/yc-repos.service";
import { Request, Response } from "express";
import { cached, cacheKeys, cacheTTL } from "../lib/cache";

export const getYcRepos = async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.perPage) || 30;
  const offset = (page - 1) * limit;

  try {
    const { data, total } = await cached(
      cacheKeys.ycRepos(page, limit),
      cacheTTL.ycRepos,
      () => YcRepoService(limit, offset),
    );

    const totalPages = Math.ceil(total / limit);

    res.json({
      page,
      perPage: limit,
      total,
      totalPages,
      data,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    });
  } catch (e: any) {
    console.error("Error fetching Yc repos: ", e);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
