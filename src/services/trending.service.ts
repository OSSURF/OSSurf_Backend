import { redis, isRedisConnected } from "../lib/redis";
const SCRAPER_API_URL =
  process.env.SCRAPER_API_URL || "http://localhost:8008/api";

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
  // Try cache first
  if (isRedisConnected()) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        // ignore parse error, fallback to fetch
      }
    }
  }

  const url = `${SCRAPER_API_URL}/trending?period=${encodeURIComponent(period)}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `Scraper API returned ${response.status}: ${response.statusText}`,
    );
  }

  const data: TrendingRepo[] = await response.json();

  // Cache result for 10 minutes
  if (isRedisConnected()) {
    await redis.set(cacheKey, JSON.stringify(data), "EX", 600);
  }

  return data;
};
