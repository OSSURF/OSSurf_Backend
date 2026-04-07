import { redis, isRedisConnected } from "./redis";

/**
 * Wraps an async function with Redis caching.
 * Falls back to the original function if Redis is unavailable.
 *
 * @param key   - Redis cache key
 * @param ttl   - Time-to-live in seconds
 * @param fn    - Async function that produces the data
 * @returns     - Cached or freshly fetched data
 */
export async function cached<T>(
  key: string,
  ttl: number,
  fn: () => Promise<T>,
): Promise<T> {
  if (!isRedisConnected()) {
    return fn();
  }

  try {
    const hit = await redis.get(key);
    if (hit) {
      return JSON.parse(hit) as T;
    }
  } catch {
    // cache read failure — proceed to fetch
  }

  const data = await fn();

  // Write to cache in the background (don't block response)
  try {
    redis.set(key, JSON.stringify(data), "EX", ttl).catch(() => {});
  } catch {
    // ignore cache write errors
  }

  return data;
}

/**
 * Invalidate a specific cache key.
 */
export async function invalidateCache(key: string): Promise<void> {
  if (!isRedisConnected()) return;
  try {
    await redis.del(key);
  } catch {
    // ignore
  }
}

/**
 * Invalidate all keys matching a pattern (e.g. "trending:*").
 * Uses SCAN to avoid blocking Redis.
 */
export async function invalidateCachePattern(pattern: string): Promise<void> {
  if (!isRedisConnected()) return;
  try {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  } catch {
    // ignore
  }
}

/** Cache key builders — centralised to avoid typos */
export const cacheKeys = {
  trending: (period: string, page: number, perPage: number) =>
    `trending:${period}:${page}:${perPage}`,
  gsoc: (page: number, perPage: number) => `gsoc:${page}:${perPage}`,
  discover: (
    language: string,
    sort: string,
    page: number,
    perPage: number,
  ) => `discover:${language || "all"}:${sort}:${page}:${perPage}`,
  findIssues: (
    language: string,
    labels: string,
    page: number,
    perPage: number,
  ) => `findIssues:${language || "all"}:${labels || "none"}:${page}:${perPage}`,
  ycRepos: (page: number, perPage: number) => `yc:${page}:${perPage}`,
  profile: (username: string) => `profile:${username}`,
};

/** TTL constants in seconds */
export const cacheTTL = {
  trending: 15 * 60, // 15 minutes
  gsoc: 6 * 60 * 60, // 6 hours
  discover: 10 * 60, // 10 minutes
  findIssues: 10 * 60, // 10 minutes
  ycRepos: 30 * 60, // 30 minutes
  profile: 10 * 60, // 10 minutes
};
