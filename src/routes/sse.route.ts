import { Router } from "express";
import { verifyToken } from "../middleware/auth.middleware";
import { redis } from "../lib/redis";
import { NotificationService } from "../service/notification.service";

const router = Router();
const SSE_USERS_SET = "sse:users";
const SSE_USER_CONNECTIONS = "sse:user:connections";
const SSE_CHANNEL_PREFIX = "sse:user:";

router.get("/events", verifyToken, async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const userId = req.user?.id;
  const username = req.user?.username || req.user?.name;

  if (!userId) {
    return;
  }

  const connectionCount = await redis.hincrby(SSE_USER_CONNECTIONS, userId, 1);
  if (connectionCount === 1) {
    await redis.sadd(SSE_USERS_SET, userId);
  }

  res.write(
    `event: ping\n` +
      `data: ${JSON.stringify({
        total_users: await redis.scard(SSE_USERS_SET),
        user: userId,
        username,
      })}\n\n`
  );

  const channel = `${SSE_CHANNEL_PREFIX}${userId}`;
  const subscriber = redis.duplicate();

  subscriber.on("message", (messageChannel, message) => {
    if (messageChannel !== channel) return;
    try {
      const payload = JSON.parse(message);
      res.write(`event: notification\n` + `data: ${JSON.stringify(payload)}\n\n`);
    } catch (error) {
      console.error("Failed to parse SSE notification:", error);
    }
  });

  await subscriber.subscribe(channel);

  await NotificationService.sendUnsentNotifications(userId);

  req.on("close", async () => {
    const remaining = await redis.hincrby(SSE_USER_CONNECTIONS, userId, -1);
    if (remaining <= 0) {
      await redis.hdel(SSE_USER_CONNECTIONS, userId);
      await redis.srem(SSE_USERS_SET, userId);
    }
    try {
      await subscriber.unsubscribe(channel);
    } finally {
      await subscriber.quit();
    }
  });
});

export default router;
