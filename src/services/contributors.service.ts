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

interface UserMeta {
  username: string;
  bio: string | null;
}
const userMetaCache = new Map<string, UserMeta>();

export async function getContributorRankings(): Promise<ContributorRanking[]> {
  const users = await db.select().from(user);


  const [allPRs, allIssues, allAccounts] = await Promise.all([
    db.select().from(tracked_prs),
    db.select().from(tracked_issues),
    db.select().from(account).where(eq(account.providerId, "github")),
  ]);


  const prsByUser = new Map<string, typeof tracked_prs.$inferSelect[]>();
  for (const pr of allPRs) {
    let list = prsByUser.get(pr.user_id);
    if (!list) {
      list = [];
      prsByUser.set(pr.user_id, list);
    }
    list.push(pr);
  }

  const issuesByUser = new Map<string, typeof tracked_issues.$inferSelect[]>();
  for (const issue of allIssues) {
    let list = issuesByUser.get(issue.user_id);
    if (!list) {
      list = [];
      issuesByUser.set(issue.user_id, list);
    }
    list.push(issue);
  }

  const accountsByUser = new Map<string, typeof account.$inferSelect>();
  for (const acc of allAccounts) {
    accountsByUser.set(acc.userId, acc);
  }


  const rankings = await Promise.all(
    users.map(async (u) => {
      const prs = prsByUser.get(u.id) || [];
      const issues = issuesByUser.get(u.id) || [];
      const githubAccount = accountsByUser.get(u.id);

      const mergedPRs = prs.filter((pr) => pr.state === "merged").length;
      const openPRs = prs.filter((pr) => pr.state === "open").length;
      const score = mergedPRs * 10 + openPRs * 2 + issues.length * 1;

      let githubUsername = "";
      let githubBio: string | null = null;

      if (userMetaCache.has(u.id)) {
        const cachedMeta = userMetaCache.get(u.id)!;
        githubUsername = cachedMeta.username;
        githubBio = cachedMeta.bio;
      } else {
        if (githubAccount?.accountId) {
          try {
            const response = await axios.get(`https://api.github.com/user/${githubAccount.accountId}`, {
              headers: {
                "User-Agent": "sourcesurf-backend",
                ...(process.env.GITHUB_TOKEN ? { Authorization: `token ${process.env.GITHUB_TOKEN}` } : {})
              }
            });
            githubUsername = response.data.login;
            githubBio = response.data.bio || null;
            if (githubUsername) {
              userMetaCache.set(u.id, { username: githubUsername, bio: githubBio });
            }
          } catch (err) {
            console.error(`Failed to fetch github metadata for user ${u.id}:`, err);
          }
        }

        if (!githubUsername) {
          if (prs.length > 0) {
            githubUsername = prs[0].author;
          } else if (issues.length > 0) {
            githubUsername = issues[0].author;
          }
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
        issues: issues.length,
        username: githubUsername,
        bio: githubBio,
      };
    })
  );

  rankings.sort((a, b) => b.score - a.score);
  return rankings;
}

