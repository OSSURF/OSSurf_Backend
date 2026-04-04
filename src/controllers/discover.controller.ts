import { Request, Response } from "express";
import { octokit } from "../lib/github";
import { cached, cacheKeys, cacheTTL } from "../lib/cache";

export const getDiscoverRepos = async (req: Request, res: Response) => {
  const language = req.query.language ? String(req.query.language) : undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(req.query.perPage) || 30));
  const requestedSort = req.query.sort ? String(req.query.sort) : "stars";
  const sort = requestedSort === "forks" ? "forks" : "stars";

  let q = "stars:>100";
  if (language) {
    q += ` language:${language}`;
  }

  try {
    const data = await cached(
      cacheKeys.discover(language || "", sort, page, perPage),
      cacheTTL.discover,
      async () => {
        const { data } = await octokit.rest.search.repos({
          q,
          sort,
          order: "desc",
          per_page: perPage,
          page,
        });
        return data;
      },
    );

    const total = Math.min(data.total_count ?? 0, 1000);
    const totalPages = Math.max(1, Math.ceil(total / perPage));

    res.set("Cache-Control", "public, s-maxage=600, stale-while-revalidate");
    res.json({
      ...data,
      total,
      page,
      perPage,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    });
  } catch (error: any) {
    console.error("GitHub API Error:", error.message);
    const status = error.status || 500;
    res.status(status).json({
      error: "Github API error",
      status,
      details: error.message,
    });
  }
};
