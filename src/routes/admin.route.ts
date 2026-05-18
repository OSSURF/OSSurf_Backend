import { Router } from "express";
import { trendingQueue } from "../jobs/queue";

const router = Router();

// Manual trigger — POST /api/admin/jobs/trending
router.post("/jobs/trending", async (req, res) => {
  const secret = process.env.ADMIN_SECRET;
  const providedSecret = req.headers["x-admin-secret"];

  if (!secret || providedSecret !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const period = req.body.period || "daily";
  if (!["daily", "weekly", "monthly"].includes(period)) {
    res.status(400).json({ error: "Invalid period. Use: daily, weekly, monthly" });
    return;
  }

  try {
    const job = await trendingQueue.add("scrape-trending", { period });
    res.json({ jobId: job.id, period, status: "enqueued" });
  } catch (err) {
    console.error("Failed to enqueue job:", err);
    res.status(500).json({ error: "Failed to enqueue job" });
  }
});

// Check job status — GET /api/admin/jobs/:jobId
router.get("/jobs/:jobId", async (req, res) => {
  try {
    const job = await trendingQueue.getJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const state = await job.getState();
    res.json({
      jobId: job.id,
      name: job.name,
      data: job.data,
      state,
      progress: job.progress,
      result: job.returnvalue,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
    });
  } catch (err) {
    console.error("Failed to get job status:", err);
    res.status(500).json({ error: "Failed to get job status" });
  }
});

export default router;
