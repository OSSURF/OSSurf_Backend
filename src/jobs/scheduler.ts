import { trendingQueue } from "./queue";

export async function registerSchedules() {
  try {
    // Daily trending — twice a day at 00:00 and 12:00 UTC
    await trendingQueue.upsertJobScheduler(
      "trending-daily",
      {
        pattern: "0 0,12 * * *",
      },
      {
        name: "scrape-trending",
        data: { period: "daily" },
      },
    );

    // Weekly trending — every Monday at 01:00 UTC
    await trendingQueue.upsertJobScheduler(
      "trending-weekly",
      {
        pattern: "0 1 * * 1",
      },
      {
        name: "scrape-trending",
        data: { period: "weekly" },
      },
    );

    // Monthly trending — 1st of each month at 02:00 UTC
    await trendingQueue.upsertJobScheduler(
      "trending-monthly",
      {
        pattern: "0 2 1 * *",
      },
      {
        name: "scrape-trending",
        data: { period: "monthly" },
      },
    );

    console.log("BullMQ schedules registered");
  } catch (err) {
    console.error("Failed to register BullMQ schedules:", err);
  }
}
