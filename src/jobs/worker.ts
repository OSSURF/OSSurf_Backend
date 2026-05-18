import { Worker, Job } from "bullmq";
import { bullConnection } from "./connection";
import axios from "axios";
import { db } from "../db/client";
import { repos } from "../db/schemas/repos";
import { trending_repos } from "../db/schemas/trending";
import { eq } from "drizzle-orm";
import { octokit } from "../lib/github";
import { invalidateCachePattern } from "../lib/cache";

const SCRAPER_URL = process.env.SCRAPER_URL || "http://localhost:8000";

interface ScrapeTrendingData {
  period: "daily" | "weekly" | "monthly";
}

async function processTrendingJob(job: Job<ScrapeTrendingData>) {
  const { period } = job.data;

  console.log(`Calling scraper for period: ${period}`);
  await job.updateProgress(10);

  const { data } = await axios.get(`${SCRAPER_URL}/scrape`, {
    params: { period },
    timeout: 30_000,
  });

  const scrapedRepos = data.repos;
  console.log(` Received ${scrapedRepos.length} repos from scraper`);
  await job.updateProgress(20);

  // Clear old trending entries for this period
  await db.delete(trending_repos).where(eq(trending_repos.period, period));
  await job.updateProgress(30);

  // Upsert each repo
  let processed = 0;
  for (const item of scrapedRepos) {
    const { owner, repo, stars_earned } = item;
    const full_name = `${owner}/${repo}`;

    try {
      // Fetch full metadata from GitHub API
      const githubRes = await octokit.repos.get({ owner, repo });
      const ghData = githubRes.data;

      // Upsert into repos table
      const [inserted] = await db
        .insert(repos)
        .values({
          github_id: ghData.id,
          owner: ghData.owner.login,
          repo_name: ghData.name,
          full_name: ghData.full_name,
          url: ghData.html_url,
          description: ghData.description,
          language: ghData.language,
          stargazers_count: ghData.stargazers_count,
          forks_count: ghData.forks_count,
          watchers_count: ghData.watchers_count || 0,
          open_issues_count: ghData.open_issues_count || 0,
          updated_at: new Date(ghData.updated_at),
          last_synced_at: new Date(),
        })
        .onConflictDoUpdate({
          target: repos.github_id,
          set: {
            stargazers_count: ghData.stargazers_count,
            forks_count: ghData.forks_count,
            watchers_count: ghData.watchers_count || 0,
            open_issues_count: ghData.open_issues_count || 0,
            updated_at: new Date(ghData.updated_at),
            last_synced_at: new Date(),
            description: ghData.description,
          },
        })
        .returning({ id: repos.id });

      // Upsert into trending_repos (uses unique index on repo_id + period)
      await db.insert(trending_repos).values({
        repo_id: inserted.id,
        period: period,
        stars_earned: stars_earned || 0,
        created_at: new Date(),
      }).onConflictDoUpdate({
        target: [trending_repos.repo_id, trending_repos.period],
        set: {
          stars_earned: stars_earned || 0,
          created_at: new Date(),
        },
      });

      processed++;
    } catch (err) {
      console.error(`Error processing ${full_name}:`, (err as Error).message);
    }

    // Update progress proportionally (30% to 90%)
    const progress = 30 + Math.round((processed / scrapedRepos.length) * 60);
    await job.updateProgress(progress);
  }

  // Invalidate trending cache
  await invalidateCachePattern("trending:*");
  await job.updateProgress(100);

  console.log(`Processed ${processed}/${scrapedRepos.length} repos for ${period}`);
  return { period, total: scrapedRepos.length, processed };
}

export const trendingWorker = new Worker<ScrapeTrendingData>(
  "trending",
  processTrendingJob,
  {
    connection: bullConnection,
    concurrency: 1, // one scrape at a time
  },
);

trendingWorker.on("completed", (job, result) => {
  console.log(`Job ${job.id} completed:`, result);
});

trendingWorker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});

trendingWorker.on("error", (err) => {
  console.error("Worker error:", err.message);
});
