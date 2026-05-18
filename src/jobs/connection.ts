import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

// BullMQ needs its own connection with maxRetriesPerRequest: null
// (separate from the cache connection in lib/redis.ts)
export const bullConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    if (times > 5) return null;
    return Math.min(times * 200, 2000);
  },
  lazyConnect: true,
});

let connected = false;

bullConnection.on("connect", () => {
  connected = true;
  console.log("BullMQ Redis connected");
});

bullConnection.on("error", (err) => {
  connected = false;
  console.error("BullMQ Redis error:", err.message);
});

bullConnection.on("close", () => {
  connected = false;
});

export const isBullRedisConnected = () => connected;

// Connect on import — non-blocking
bullConnection.connect().catch((err) => {
  console.warn("BullMQ Redis unavailable:", err.message);
});
