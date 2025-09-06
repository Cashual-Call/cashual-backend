import cron, { type ScheduledTask } from "node-cron";
import Redlock from "redlock";
import { redis } from "../lib/redis";
import { MatchService } from "../service/match.service";
import logger from "../config/logger";

const matchServiceChat = new MatchService("chat");
const matchServiceCall = new MatchService("call");

// Setup Redlock for distributed locking
const redlock = new Redlock([redis], {
  retryCount: 1, 
});

let scheduledTask: ScheduledTask | null = null;

const processMatchJob = async () => {
  const lockKey = "lock:match-job";
  const lockTtl = 1900;

  try {
    const lock = await redlock.acquire([lockKey], lockTtl);
    try {
      logger.info("[MatchCron] Running match job at", new Date().toISOString());
      
      // Clean up inactive users first (users inactive for more than 30 seconds)
      const chatInactiveCount = await matchServiceChat.cleanupInactiveUsers(30000);
      const callInactiveCount = await matchServiceCall.cleanupInactiveUsers(30000);
      
      if (chatInactiveCount > 0 || callInactiveCount > 0) {
        logger.info(`[MatchCron] Cleaned up inactive users - Chat: ${chatInactiveCount}, Call: ${callInactiveCount}`);
      }
      
      // Then perform matching
      await matchServiceChat.bestMatch();
      await matchServiceCall.bestMatch();
      logger.info("[MatchCron] Match job processed successfully");
    } catch (err) {
      console.error("[MatchCron] Error processing match job:", err);
    } finally {
      await lock.release();
    }
  } catch (lockErr) {
    // Lock not acquired, another instance is running the job
    // This is expected in a distributed environment
    // Optionally log: console.log("[MatchCron] Lock not acquired, skipping this run.");
  }
};

// Add a recurring job that runs every 2 seconds
export const addRecurringJob = async () => {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
  try {
    scheduledTask = cron.schedule("*/2 * * * * *", processMatchJob);
  } catch (error) {
    logger.error("[addRecurringJob] Failed to schedule recurring job:", error);
  }
};

export const cleanup = async () => {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
  await redis.quit();
};
