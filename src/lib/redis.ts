import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 3) return null; // stop retrying
    return Math.min(times * 200, 2000);
  },
  lazyConnect: true,
});

let connected = false;

redis.on("connect", () => {
  connected = true;
  console.log("Redis connected");
});

redis.on("error", (err) => {
  connected = false;
  console.error("Redis connection error:", err.message);
});

redis.on("close", () => {
  connected = false;
});

export const isRedisConnected = () => 
  connected || redis.status === "ready" || redis.status === "connect";

// Connect on import — non-blocking
redis.connect().catch((err) => {
  console.warn("Redis unavailable, caching disabled:", err.message);
});
