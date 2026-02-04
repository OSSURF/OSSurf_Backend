import { Request, Response } from "express";
import { db } from "../db/client";
import { trending_repos } from "../db/schemas";
import { getTrendingRepos } from "../services/trending.service";

export const getTrendingList = async (req: Request, res: Response) => {
  const period = (req.query.period as string) || "daily";
  try {

    const trending_repos = await getTrendingRepos(period);
    return res.json({data:trending_repos});

  } catch (err) {
    console.error("Fetch trending error:", err);
    return res.status(500).json({ error: "Failed to fetch trending repos" });
  }
};

export const syncTrendingRepos = async (req: Request, res: Response) => {
  try {
    const adminSecret = req.headers["x-admin-secret"];
    if (adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const { repoList, category } = req.body;

    if (!Array.isArray(repoList) || !category) {
      return res.status(400).json({ error: "Invalid request format" });
    }

    const { repos } = await import("../db/schemas/repos");
    const { upsertRepo } = await import("../services/repos.service");
    const { eq, and } = await import("drizzle-orm");

    let synced = 0;
    let errors = 0;

    for (const item of repoList) {
      try {
        const { owner, repo: repo_name, stars_earned } = item;

        // Fetch repo details from GitHub API
        const ghResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repo_name}`,
          {
            headers: {
              "User-Agent": "SourceSurf-Scraper",
            },
          },
        );

        if (!ghResponse.ok) {
          console.error(`Failed to fetch ${owner}/${repo_name}`);
          errors++;
          continue;
        }

        const ghData = await ghResponse.json();

        // Upsert repo
        const repoId = await upsertRepo({
          github_id: ghData.id,
          owner: ghData.owner.login,
          repo_name: ghData.name,
          full_name: ghData.full_name,
          url: ghData.html_url,
          description: ghData.description,
          language: ghData.language,
          stargazers_count: ghData.stargazers_count,
          forks_count: ghData.forks_count,
          watchers_count: ghData.watchers_count,
          open_issues_count: ghData.open_issues_count,
          created_at: new Date(ghData.created_at),
          updated_at: new Date(ghData.updated_at),
          last_synced_at: new Date(),
        });

        // Upsert trending_repos entry
        await db
          .insert(trending_repos)
          .values({
            repo_id: repoId,
            period: category,
            stars_earned: stars_earned || 0,
          })
          .onConflictDoUpdate({
            target: [trending_repos.repo_id, trending_repos.period],
            set: {
              stars_earned: stars_earned || 0,
              created_at: new Date(),
            },
          });

        synced++;
      } catch (err) {
        console.error(`Error syncing repo:`, err);
        errors++;
      }
    }

    return res.json({
      success: true,
      synced,
      errors,
      total: repoList.length,
    });
  } catch (err) {
    console.error("Sync trending error:", err);
    return res.status(500).json({ error: "Failed to sync trending repos" });
  }
};
