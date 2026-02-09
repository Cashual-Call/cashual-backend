import { Router } from "express";
import { verifyToken } from "../middleware/auth.middleware";
import { redis } from "../lib/redis";
import { NotificationService } from "../service/notification.service";
import { AvailableUserService } from "../service/available-user.service";

const router = Router();
const SSE_CHANNEL_PREFIX = "sse:user:";
const presenceService = new AvailableUserService("presence");

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

  await presenceService.incrementPresence(userId, username || "");

  res.write(
    `event: ping\n` +
      `data: ${JSON.stringify({
        total_users: await presenceService.getUserCount(),
        user: userId,
        username,
      })}\n\n`
  );

  const channel = `${SSE_CHANNEL_PREFIX}${userId}`;
  const subscriber = redis.duplicate();

  subscriber.on("message", (messageChannel: string, message: string) => {
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
    await presenceService.decrementPresence(userId);
    try {
      await subscriber.unsubscribe(channel);
    } finally {
      await subscriber.quit();
    }
  });
});

export default router;
