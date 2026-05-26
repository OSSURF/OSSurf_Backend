import { db } from "../db/client";
import { user, tracked_prs, tracked_issues, account } from "../db/schemas";
import { eq, and } from "drizzle-orm";
import axios from "axios";

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

// Background stats refresh function
async function refreshUserStats(
  userId: string,
  githubAccountId: string,
  localMerged: number,
  localOpen: number,
  localIssuesCount: number
) {
  try {
    const headers = {
      "User-Agent": "sourcesurf-backend",
      ...(process.env.GITHUB_TOKEN ? { Authorization: `token ${process.env.GITHUB_TOKEN}` } : {})
    };

    // 1. Fetch main user profile
    const userResponse = await axios.get(`https://api.github.com/user/${githubAccountId}`, { headers });
    const githubUsername = userResponse.data.login;
    const githubBio = userResponse.data.bio || null;

    if (githubUsername) {
      // 2. Fetch live stats from GitHub Search API
      const searchUrl = "https://api.github.com/search/issues";
      const [prRes, mergedRes, issueRes] = await Promise.all([
        axios.get(`${searchUrl}?q=type:pr+author:${githubUsername}`, { headers }),
        axios.get(`${searchUrl}?q=type:pr+author:${githubUsername}+is:merged`, { headers }),
        axios.get(`${searchUrl}?q=type:issue+author:${githubUsername}`, { headers }),
      ]);

      const totalPRs = prRes.data.total_count;
      const mergedPRs = mergedRes.data.total_count;
      const openPRs = totalPRs - mergedPRs; // open = total - merged (approx)
      const issues = issueRes.data.total_count;
      const score = mergedPRs * 10 + openPRs * 2 + issues * 1;

      // Update user record in DB
      await db
        .update(user)
        .set({
          githubUsername,
          githubBio,
          mergedPRs,
          openPRs,
          issues,
          score,
          statsUpdatedAt: new Date(),
        })
        .where(eq(user.id, userId));
    }
  } catch (err) {
    console.error(`Failed to refresh github stats for user ${userId} in background:`, err);
  }
}

// Score formula: mergedPRs*10 + openPRs*2 + issues*1
export async function getContributorRankings(): Promise<ContributorRanking[]> {
  // Get all users from DB
  const users = await db.select().from(user);

  const rankings = await Promise.all(
    users.map(async (u) => {
      // Fetch local PRs, Issues and Github Account in parallel (as fallbacks/checks)
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

      // Check if stats need to be refreshed
      const cacheExpiryMs = 24 * 60 * 60 * 1000; // 24 hours
      const isStale = u.statsUpdatedAt
        ? new Date().getTime() - new Date(u.statsUpdatedAt).getTime() > cacheExpiryMs
        : true;

      // If stale and has GitHub connected, trigger background refresh asynchronously (do not await)
      if (githubAccount?.accountId && isStale) {
        refreshUserStats(u.id, githubAccount.accountId, localMerged, localOpen, localIssues.length);
      }

      // Return the current database state immediately
      let githubUsername = u.githubUsername || "";
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
        score: u.score || localScore,
        mergedPRs: u.mergedPRs || localMerged,
        openPRs: u.openPRs || localOpen,
        issues: u.issues || localIssues.length,
        username: githubUsername,
        bio: u.githubBio,
      };
    })
  );

  // Sort by score descending
  rankings.sort((a, b) => b.score - a.score);
  return rankings;
}
