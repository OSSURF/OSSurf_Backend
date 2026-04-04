import { db } from "../db/client";
import { user, tracked_prs, tracked_issues } from "../db/schemas";
import { eq } from "drizzle-orm";

export interface ContributorRanking {
  id: string;
  name: string;
  avatarUrl: string;
  score: number;
  mergedPRs: number;
  openPRs: number;
  issues: number;
}

// Score formula: mergedPRs*10 + openPRs*2 + issues*1
export async function getContributorRankings(): Promise<ContributorRanking[]> {
  // Get all users
  const users = await db.select().from(user);

  // For each user, aggregate their PRs and issues
  const rankings: ContributorRanking[] = [];
  for (const u of users) {
    // PRs
    const prs = await db
      .select()
      .from(tracked_prs)
      .where(eq(tracked_prs.user_id, u.id));
    const mergedPRs = prs.filter((pr) => pr.state === "merged").length;
    const openPRs = prs.filter((pr) => pr.state === "open").length;

    // Issues
    const issues = await db
      .select()
      .from(tracked_issues)
      .where(eq(tracked_issues.user_id, u.id));

    const score = mergedPRs * 10 + openPRs * 2 + issues.length * 1;

    rankings.push({
      id: u.id,
      name: u.name,
      avatarUrl: u.image || "",
      score,
      mergedPRs,
      openPRs,
      issues: issues.length,
    });
  }

  // Sort by score descending
  rankings.sort((a, b) => b.score - a.score);
  return rankings;
}
