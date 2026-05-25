import { redis, isRedisConnected } from "../lib/redis";
import { db } from "../db/client";
import { repos } from "../db/schemas/repos";
import { trending_repos } from "../db/schemas/trending";
import { eq, desc } from "drizzle-orm";

export interface TrendingRepo {
  id: number;
  github_id: number | null;
  owner: string;
  repo_name: string;
  full_name: string;
  url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  stars_earned: number;
  period: string;
}

export const getTrendingRepos = async (
  period: string,
): Promise<TrendingRepo[]> => {
  const cacheKey = `trending:${period}`;
  if (isRedisConnected()) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as TrendingRepo[];
    } catch {
    }
  }

  const result = await db
    .select({
      id: repos.id,
      github_id: repos.github_id,
      owner: repos.owner,
      repo_name: repos.repo_name,
      full_name: repos.full_name,
      url: repos.url,
      description: repos.description,
      language: repos.language,
      stargazers_count: repos.stargazers_count,
      forks_count: repos.forks_count,
      stars_earned: trending_repos.stars_earned,
      period: trending_repos.period,
    })
    .from(trending_repos)
    .innerJoin(repos, eq(trending_repos.repo_id, repos.id))
    .where(eq(trending_repos.period, period))
    .orderBy(desc(trending_repos.stars_earned));

  const data: TrendingRepo[] = result;

  if (isRedisConnected()) {
    redis.set(cacheKey, JSON.stringify(data), "EX", 15 * 60).catch(() => { });
  }

  return data;
};

