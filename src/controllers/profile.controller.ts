import { Request, Response } from "express";
import { getUserFromLocals } from "../lib/getUser";
import { db } from "../db/client";
import { octokit } from "../lib/github";
import { eq, and } from "drizzle-orm";
import { account } from "@/db/schemas/auth";
import { Octokit } from "@octokit/rest";

export const getProfile = async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    if (!username) {
      res.status(400).json({ error: "Username is required" });
      return;
    }

    // Fetch user by username (public data)
    const { data: user } = await octokit.rest.users.getByUsername({
      username,
    });

    const profileData = {
      username: user.login,
      user: {
        name: user.name,
        login: user.login,
        avatarUrl: user.avatar_url,
        bio: user.bio,
        followers: user.followers,
        following: user.following,
        createdAt: user.created_at,
        htmlUrl: user.html_url,
      },
    };

    const [
      reposRes,
      commitsRes,
      prsRes,
      mergedPrsRes,
      openPrsRes,
      issuesRes,
      reviewsRes,
    ] = await Promise.all([
      octokit.rest.repos.listForAuthenticatedUser({
        sort: "updated",
        per_page: 100,
        type: "owner",
      }),

      octokit.rest.search.commits({
        q: `author:${profileData.username}`,
        headers: { Accept: "application/vnd.github.cloak-preview" },
      }),

      octokit.rest.search.issuesAndPullRequests({
        q: `author:${profileData.username} type:pr`,
      }),

      octokit.rest.search.issuesAndPullRequests({
        q: `author:${profileData.username} type:pr is:merged`,
      }),

      octokit.rest.search.issuesAndPullRequests({
        q: `author:${profileData.username} type:pr is:open`,
      }),

      octokit.rest.search.issuesAndPullRequests({
        q: `author:${profileData.username} type:issue`,
      }),

      octokit.rest.search.issuesAndPullRequests({
        q: `reviewed-by:${profileData.username} type:pr`,
      }),
    ]);

    const languagesMap: Record<string, number> = {};
    reposRes.data.forEach((repo) => {
      if (repo.language) {
        languagesMap[repo.language] = (languagesMap[repo.language] || 0) + 1;
      }
    });
    const totalPrs = prsRes.data.total_count;
    const mergedPrs = mergedPrsRes.data.total_count;
    const openPrs = openPrsRes.data.total_count;
    const closedPrs = Math.max(0, totalPrs - mergedPrs - openPrs);
    const totalCommits = commitsRes.data.total_count;
    const totalIssues = issuesRes.data.total_count;
    const totalReviews = reviewsRes.data.total_count;

    // Calculate activity history for last 12 months
    const activityHistory = [];
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const monthName = monthNames[date.getMonth()];

      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = new Date(year, month, 0);
      const endDateStr = `${year}-${String(month).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;

      try {
        const monthPrs = await octokit.rest.search.issuesAndPullRequests({
          q: `author:${profileData.username} type:pr created:${startDate}..${endDateStr}`,
          per_page: 1,
        });

        const monthIssues = await octokit.rest.search.issuesAndPullRequests({
          q: `author:${profileData.username} type:issue created:${startDate}..${endDateStr}`,
          per_page: 1,
        });

        activityHistory.push({
          month: monthName,
          prs: monthPrs.data.total_count,
          issues: monthIssues.data.total_count,
        });
      } catch (error) {
        activityHistory.push({
          month: monthName,
          prs: 0,
          issues: 0,
        });
      }
    }

    const topLanguagues = Object.entries(languagesMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([langName, value]) => ({
        langName,
        value,
      }));

    const repsonseData = {
      ...profileData,
      stats: {
        totalCommits: totalCommits,
        totalPrs: totalPrs,
        totalIssues: totalIssues,
        totalReviews: totalReviews,
      },
      graphs: {
        languages: topLanguagues,
        radar: {
          commits: totalCommits,
          prs: totalPrs,
          issues: totalIssues,
          reviews: totalReviews,
        },
        prStats: {
          merged: mergedPrs,
          open: openPrs,
          closed: closedPrs,
        },
        activityHistory: activityHistory,
      },
    };
    res.json(repsonseData);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "Failed to fetch profile" });
  }
};
