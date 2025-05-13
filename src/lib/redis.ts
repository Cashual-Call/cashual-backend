import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
const pubClient = redis;
const subClient = pubClient.duplicate();

// Log Redis connection status
pubClient.on("connect", () => {
  console.log("Redis publisher client connected");
});

pubClient.on("error", (err) => {
  console.error("Redis publisher client error:", err);
});

subClient.on("connect", () => {
  console.log("Redis subscriber client connected");
});

subClient.on("error", (err) => {
  console.error("Redis subscriber client error:", err);
});

export { redis, pubClient, subClient };
