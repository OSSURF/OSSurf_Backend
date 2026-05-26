import { db } from "../db/client";
import { user, tracked_prs, tracked_issues, account } from "../db/schemas";
import { eq, and } from "drizzle-orm";
import axios from "axios";
import { redis, isRedisConnected } from "../lib/redis";

export interface ContributorRanking {
  id: string;
  name: string;
  avatarUrl: string;
  score: number;
  mergedPRs: number;
  openPRs: number;
  issues: number;
  username: string;
  bio?: string | null;
}

interface UserMeta {
  username: string;
  bio: string | null;
  mergedPRs: number;
  openPRs: number;
  issues: number;
  score: number;
}

// Score formula: mergedPRs*10 + openPRs*2 + issues*1
export async function getContributorRankings(): Promise<ContributorRanking[]> {
  // Get all users
  const users = await db.select().from(user);

  // Aggregate stats and metadata in parallel for maximum speed
  const rankings = await Promise.all(
    users.map(async (u) => {
      // Fetch local PRs, Issues and Github Account in parallel (as fallback/reference)
      const [localPrs, localIssues, githubAccount] = await Promise.all([
        db.select().from(tracked_prs).where(eq(tracked_prs.user_id, u.id)),
        db.select().from(tracked_issues).where(eq(tracked_issues.user_id, u.id)),
        db.query.account.findFirst({
          where: and(eq(account.userId, u.id), eq(account.providerId, "github")),
        }),
      ]);

      const localMerged = localPrs.filter((pr) => pr.state === "merged").length;
      const localOpen = localPrs.filter((pr) => pr.state === "open").length;
      const localScore = localMerged * 10 + localOpen * 2 + localIssues.length * 1;

      const cacheKey = `user:meta:${u.id}`;
      let cached: UserMeta | null = null;

      if (isRedisConnected()) {
        try {
          const hit = await redis.get(cacheKey);
          if (hit) {
            cached = JSON.parse(hit) as UserMeta;
          }
        } catch (err) {
          console.error(`Failed to get cached meta for user ${u.id}:`, err);
        }
      }

      let githubUsername = cached?.username || "";
      let githubBio = cached?.bio || null;
      let mergedPRs = cached?.mergedPRs ?? localMerged;
      let openPRs = cached?.openPRs ?? localOpen;
      let issues = cached?.issues ?? localIssues.length;
      let score = cached?.score ?? localScore;

      if (githubAccount?.accountId && !cached) {
        try {
          const headers = {
            "User-Agent": "sourcesurf-backend",
            ...(process.env.GITHUB_TOKEN ? { Authorization: `token ${process.env.GITHUB_TOKEN}` } : {})
          };

          // 1. Fetch main user profile
          const userResponse = await axios.get(`https://api.github.com/user/${githubAccount.accountId}`, { headers });
          githubUsername = userResponse.data.login;
          githubBio = userResponse.data.bio || null;

          if (githubUsername) {
            // 2. Fetch live stats from GitHub Search API
            const searchUrl = "https://api.github.com/search/issues";
            const [prRes, mergedRes, issueRes] = await Promise.all([
              axios.get(`${searchUrl}?q=type:pr+author:${githubUsername}`, { headers }),
              axios.get(`${searchUrl}?q=type:pr+author:${githubUsername}+is:merged`, { headers }),
              axios.get(`${searchUrl}?q=type:issue+author:${githubUsername}`, { headers }),
            ]);

            const totalPRs = prRes.data.total_count;
            mergedPRs = mergedRes.data.total_count;
            openPRs = totalPRs - mergedPRs; // open = total - merged (approx)
            issues = issueRes.data.total_count;
            score = mergedPRs * 10 + openPRs * 2 + issues * 1;

            const meta: UserMeta = {
              username: githubUsername,
              bio: githubBio,
              mergedPRs,
              openPRs,
              issues,
              score,
            };

            if (isRedisConnected()) {
              await redis.set(cacheKey, JSON.stringify(meta), "EX", 6 * 60 * 60).catch(() => {});
            }
          }
        } catch (err) {
          console.error(`Failed to fetch github metadata for user ${u.id}:`, err);
        }
      }

      // If still not resolved from GitHub (e.g. rate limited or credential user), use fallback
      if (!githubUsername) {
        if (localPrs.length > 0) {
          githubUsername = localPrs[0].author;
        } else if (localIssues.length > 0) {
          githubUsername = localIssues[0].author;
        }
      }

      if (!githubUsername) {
        githubUsername = u.name.replace(/\s+/g, "").toLowerCase();
      }

      return {
        id: u.id,
        name: u.name,
        avatarUrl: u.image || "",
        score,
        mergedPRs,
        openPRs,
        issues,
        username: githubUsername,
        bio: githubBio,
      };
    })
  );

  // Sort by score descending
  rankings.sort((a, b) => b.score - a.score);
  return rankings;
}
