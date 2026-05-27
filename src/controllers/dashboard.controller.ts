import { Request, Response } from "express";
import { getUserFromLocals } from "@/lib/getUser";
import { prService } from "@/services/tracked-prs.service";
import { issueService } from "@/services/tracked-issues.service";
import { db } from "@/db/client";
import { account, user } from "@/db/schemas/auth";
import { eq, and } from "drizzle-orm";
import axios from "axios";

type Contribution = {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
};

type ContributionsApiResponse = {
  total: Record<string, number>;
  contributions: Contribution[];
};

export const getDashboard = async (req: Request, res: Response) => {
  try {
    const userId = getUserFromLocals(res.locals).id;
    const [trackedPrs, trackedIssues] = await Promise.all([
      prService.getAll(userId),
      issueService.getAll(userId),
    ]);
    const [githubAccount, dbUser] = await Promise.all([
      db.query.account.findFirst({
        where: and(eq(account.userId, userId), eq(account.providerId, "github")),
      }),
      db.query.user.findFirst({
        where: eq(user.id, userId),
      }),
    ]);

    let globalStats = {
      username: dbUser?.githubUsername || null,
      totalPrs: (dbUser?.mergedPRs ?? 0) + (dbUser?.openPRs ?? 0),
      mergedPrs: dbUser?.mergedPRs ?? 0,
      totalIssues: dbUser?.issues ?? 0,
      contributionCalendar: [] as Contribution[],
      contributionTotals: {} as Record<string, number>,
    };

    if (githubAccount?.accessToken) {
      try {
        const headers = {
          Authorization: `Bearer ${githubAccount.accessToken}`,
        };

        // 1. Get User Info
        const { data: githubUser } = await axios.get("https://api.github.com/user", {
          headers,
        });
        globalStats.username = githubUser.login;
        // 2. Search Counts
        const searchUrl = "https://api.github.com/search/issues";
        const [prRes, mergedRes, issueRes] = await Promise.all([
          axios.get(`${searchUrl}?q=type:pr+author:${githubUser.login}`, { headers }),
          axios.get(`${searchUrl}?q=type:pr+author:${githubUser.login}+is:merged`, {
            headers,
          }),
          axios.get(`${searchUrl}?q=type:issue+author:${githubUser.login}`, {
            headers,
          }),
        ]);
        globalStats.totalPrs = prRes.data.total_count;
        globalStats.mergedPrs = mergedRes.data.total_count;
        globalStats.totalIssues = issueRes.data.total_count;

        // Fetch contribution calendar data
        const contributionsRes = await fetch(
          `https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(githubUser.login)}?y=last`,
        );
        if (contributionsRes.ok) {
          const contributionsJson =
            (await contributionsRes.json()) as ContributionsApiResponse;
          globalStats.contributionCalendar = contributionsJson.contributions ?? [];
          globalStats.contributionTotals = contributionsJson.total ?? {};
        }

        // Keep local DB user in sync with latest GitHub stats
        await db
          .update(user)
          .set({
            githubUsername: githubUser.login,
            githubBio: githubUser.bio || dbUser?.githubBio,
            mergedPRs: globalStats.mergedPrs,
            openPRs: globalStats.totalPrs - globalStats.mergedPrs,
            issues: globalStats.totalIssues,
            statsUpdatedAt: new Date(),
          })
          .where(eq(user.id, userId));
      } catch (axError) {
        console.error("GitHub API Error:", axError);
      }
    }

    // Fallback: If no token or token fetch failed, but we have a username,
    // we can still fetch the public contribution calendar
    if (
      globalStats.username &&
      (!globalStats.contributionCalendar || globalStats.contributionCalendar.length === 0)
    ) {
      try {
        const contributionsRes = await fetch(
          `https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(
            globalStats.username
          )}?y=last`
        );
        if (contributionsRes.ok) {
          const contributionsJson =
            (await contributionsRes.json()) as ContributionsApiResponse;
          globalStats.contributionCalendar = contributionsJson.contributions ?? [];
          globalStats.contributionTotals = contributionsJson.total ?? {};
        }
      } catch (calError) {
        console.error("Failed to fetch contribution calendar using fallback:", calError);
      }
    }
    const stats = {
      user: {
        username: globalStats.username,
        totalPrsCreated: globalStats.totalPrs,
        totalPrsMerged: globalStats.mergedPrs,
        totalIssuesCreated: globalStats.totalIssues,
        contributionCalendar: (globalStats as any).contributionCalendar ?? [],
        contributionTotals: (globalStats as any).contributionTotals ?? {},
      },
      tracking: {
        activePrs: trackedPrs.filter((p) => p.state === "open").length,
        activeIssues: trackedIssues.filter((i) => i.state === "open").length,
        totalTracked: trackedPrs.length + trackedIssues.length,
      },
    };
    const recentPrs = trackedPrs
      .sort(
        (a, b) =>
          new Date(b.last_synced_at).getTime() -
          new Date(a.last_synced_at).getTime(),
      )
      .slice(0, 5);
    const recentIssues = trackedIssues
      .sort(
        (a, b) =>
          new Date(b.last_synced_at).getTime() -
          new Date(a.last_synced_at).getTime(),
      )
      .slice(0, 5);
    res.json({ stats, recentPrs, recentIssues });
  } catch (error: any) {
    console.error("Dashboard error:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to fetch dashboard" });
  }
};
