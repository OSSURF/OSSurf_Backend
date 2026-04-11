import { Request, Response } from "express";
import { db } from "../db/client";
import { repos } from "../db/schemas/repos";
import { trending_repos } from "../db/schemas/trending";
import { eq } from "drizzle-orm";
import { octokit } from "../lib/github";

export const handleTrendingWebhook = async (req: Request, res: Response): Promise<void> => {
  const secret = process.env.ADMIN_SECRET;
  const providedSecret = req.headers["x-admin-secret"];

  if (!secret || providedSecret !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { repoList, category } = req.body;
  
  if (!repoList || !category || !Array.isArray(repoList)) {
    res.status(400).json({ error: "Invalid payload format" });
    return;
  }

  console.log(`Received webhook for ${category} with ${repoList.length} repos`);

  try {
    const period = category; // 'daily', 'weekly', etc.
    
    // Clear old trending_repos for this period
    await db.delete(trending_repos).where(eq(trending_repos.period, period));

    for (const item of repoList) {
      const { owner, repo, stars_earned } = item;
      const full_name = `${owner}/${repo}`;

      try {
        // Fetch repo from GitHub to get github_id and full metadata
        const githubRes = await octokit.repos.get({ owner, repo });
        const data = githubRes.data;

        // Upsert directly into repos table
        const [inserted] = await db.insert(repos).values({
          github_id: data.id,
          owner: data.owner.login,
          repo_name: data.name,
          full_name: data.full_name,
          url: data.html_url,
          description: data.description,
          language: data.language,
          stargazers_count: data.stargazers_count,
          forks_count: data.forks_count,
          watchers_count: data.watchers_count || 0,
          open_issues_count: data.open_issues_count || 0,
          updated_at: new Date(data.updated_at),
          last_synced_at: new Date(),
        })
        .onConflictDoUpdate({
          target: repos.github_id,
          set: {
            stargazers_count: data.stargazers_count,
            forks_count: data.forks_count,
            watchers_count: data.watchers_count || 0,
            open_issues_count: data.open_issues_count || 0,
            updated_at: new Date(data.updated_at),
            last_synced_at: new Date(),
            description: data.description,
          }
        }).returning({ id: repos.id });

        // Insert into trending
        await db.insert(trending_repos).values({
          repo_id: inserted.id,
          period: period,
          stars_earned: stars_earned || 0,
          created_at: new Date()
        });

      } catch (err) {
        console.error(`Error processing ${full_name}:`, (err as Error).message);
      }
    }

    res.status(200).json({ success: true, message: `Successfully synced ${repoList.length} ${category} trending repos` });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({ error: "Internal server error processing webhook" });
  }
};
