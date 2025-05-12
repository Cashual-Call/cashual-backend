import Redis from "ioredis";

const pubClient = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
const subClient = pubClient.duplicate();

export { pubClient, subClient };
