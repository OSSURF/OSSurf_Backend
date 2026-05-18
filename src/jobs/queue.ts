import { Queue } from "bullmq";
import { bullConnection } from "./connection";

export const trendingQueue = new Queue("trending", {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
});
