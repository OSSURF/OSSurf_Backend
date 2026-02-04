import { linkTopicsToRepo } from "../services/tags.service";
import { Request, Response } from "express";
import { octokit } from "../lib/github";
import { WebHookPayload } from "@/types/types";
import { RepoSchema } from "@/types/schema";
import { upsertRepo } from "@/services/repos.service";
import {
  clearOldTrending,
  updateTrendingRepos,
} from "@/services/trending.service";
import dotenv from "dotenv";

dotenv.config();

export const getTrendingRepos = async (req: Request, res: Response) => {
  const { repoList, category } = req.body as WebHookPayload;

  const secretHeaders = req.get("x-admin-secret");
  const expectedSecret = process.env.ADMIN_SECRET;

  if (!secretHeaders || secretHeaders !== expectedSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!repoList || repoList.length === 0) {
    return res.status(200).json({ message: "No repos to process" });
  }

  try {
    const validResults: { item: (typeof repoList)[0]; full: any }[] = [];

    for (const item of repoList) {
      try {
        console.log(`Fetching ${item.owner}/${item.repo}`);
        const { data: full } = await octokit.rest.repos.get({
          owner: item.owner,
          repo: item.repo,
        });
        validResults.push({ item, full });
      } catch (err) {
        console.error(`Failed to fetch ${item.owner}/${item.repo}:`, err);
      }
    }

    if (validResults.length === 0) {
      return res
        .status(500)
        .json({ error: "Failed to fetch any repository data" });
    }

    // 2. Clear old trending data
    await clearOldTrending(category);

    // 3. Update database
    for (const { item, full } of validResults) {
      try {
        const rawData = {
          github_id: full.id,
          owner: full.owner.login,
          repo_name: full.name,
          full_name: full.full_name,
          url: full.html_url,
          description: full.description ?? null,
          language: full.language ?? null,
          stargazers_count: full.stargazers_count,
          forks_count: full.forks_count,
          watchers_count: full.watchers_count,
          open_issues_count: full.open_issues_count,
          created_at: full.created_at,
          updated_at: full.updated_at,
          last_synced_at: new Date(),
        };

        const validatedData = RepoSchema.parse(rawData);
        const repoId = await upsertRepo(validatedData);

        await linkTopicsToRepo(repoId, full.topics || []);

        console.log(`Updating trending for ${repoId} category ${category}`);
        await updateTrendingRepos(repoId, category, item.stars_earned);
        console.log(`Updated trending for ${repoId}`);
      } catch (err) {
        console.error(`Failed to sync ${full.full_name}:`, err);
      }
    }

    return res.json({ success: true, processed: validResults.length });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
