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

    const userResponse = await axios.get(`https://api.github.com/user/${githubAccountId}`, { headers });
    const githubUsername = userResponse.data.login;
    const githubBio = userResponse.data.bio || null;

    if (githubUsername) {
      const searchUrl = "https://api.github.com/search/issues";
      const [prRes, mergedRes, issueRes] = await Promise.all([
        axios.get(`${searchUrl}?q=type:pr+author:${githubUsername}`, { headers }),
        axios.get(`${searchUrl}?q=type:pr+author:${githubUsername}+is:merged`, { headers }),
        axios.get(`${searchUrl}?q=type:issue+author:${githubUsername}`, { headers }),
      ]);

      const totalPRs = prRes.data.total_count;
      const mergedPRs = mergedRes.data.total_count;
      const openPRs = totalPRs - mergedPRs;
      const issues = issueRes.data.total_count;
      const score = mergedPRs * 10 + openPRs * 2 + issues * 1;

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

export async function getContributorRankings(): Promise<ContributorRanking[]> {
  const users = await db.select().from(user);

  const rankings = await Promise.all(
    users.map(async (u) => {
      const [prs, issues, githubAccount] = await Promise.all([
        db.select().from(tracked_prs).where(eq(tracked_prs.user_id, u.id)),
        db.select().from(tracked_issues).where(eq(tracked_issues.user_id, u.id)),
        db.query.account.findFirst({
          where: and(eq(account.userId, u.id), eq(account.providerId, "github")),
        }),
      ]);

      const localMerged = prs.filter((pr) => pr.state === "merged").length;
      const localOpen = prs.filter((pr) => pr.state === "open").length;
      const localIssues = issues.length;
      // Score always computed from locally tracked data to stay consistent with displayed stats
      const localScore = localMerged * 10 + localOpen * 2 + localIssues * 1;

      const cacheExpiryMs = 24 * 60 * 60 * 1000;
      const isStale = u.statsUpdatedAt
        ? new Date().getTime() - new Date(u.statsUpdatedAt).getTime() > cacheExpiryMs
        : true;

      if (githubAccount?.accountId && isStale) {
        refreshUserStats(u.id, githubAccount.accountId, localMerged, localOpen, localIssues);
      }

      let githubUsername = u.githubUsername || "";
      if (!githubUsername) {
        if (prs.length > 0) {
          githubUsername = prs[0].author;
        } else if (issues.length > 0) {
          githubUsername = issues[0].author;
        }
      }
      if (!githubUsername) {
        githubUsername = u.name.replace(/\s+/g, "").toLowerCase();
      }

      return {
        id: u.id,
        name: u.name,
        avatarUrl: u.image || "",
        score: localScore,
        mergedPRs: localMerged,
        openPRs: localOpen,
        issues: localIssues,
        username: githubUsername,
        bio: u.githubBio,
      };
    })
  );

  rankings.sort((a, b) => b.score - a.score);
  return rankings;
}
