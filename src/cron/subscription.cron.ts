import cron, { type ScheduledTask } from "node-cron";
import Redlock, { type Lock } from "redlock";
import { redis } from "../lib/redis";
import { SubscriptionService } from "../service/subscription.service";
import logger from "../config/logger";

// Setup Redlock for distributed locking
const redlock = new Redlock([redis], {
  retryCount: 1,
});

let scheduledTask: ScheduledTask | null = null;

const processSubscriptionCheckJob = async () => {
  const lockKey = "lock:subscription-check-job";
  const lockTtl = 50000; // 50 seconds (longer than job interval)

  let lock: Lock | null = null;
  try {
    lock = await redlock.acquire([lockKey], lockTtl);
  } catch (lockErr) {
    // Lock not acquired, another instance is running the job
    // This is expected in a distributed environment
    return;
  }

  try {
    logger.info("[SubscriptionCron] Running subscription check job", {
      timestamp: new Date().toISOString(),
    });

    await SubscriptionService.checkExpiredSubscriptions();

    logger.info("[SubscriptionCron] Subscription check job processed successfully");
  } catch (err) {
    logger.error("[SubscriptionCron] Error processing subscription check job:", err);
  } finally {
    if (lock) {
      try {
        await lock.release();
      } catch (releaseErr) {
        logger.error("[SubscriptionCron] Error releasing lock:", releaseErr);
      }
    }
  }
};

/**
 * Add recurring subscription check job
 * Runs every hour to check for expired subscriptions
 */
export const addRecurringJob = async () => {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
  try {
    // Run every hour at minute 0
    scheduledTask = cron.schedule("0 * * * *", processSubscriptionCheckJob);
    logger.info("[SubscriptionCron] Recurring job scheduled (every hour)");
  } catch (error) {
    logger.error("[SubscriptionCron] Failed to schedule recurring job:", error);
  }
};

/**
 * Manually trigger a subscription check (for testing)
 */
export async function triggerSubscriptionCheck() {
  try {
    await processSubscriptionCheckJob();
    console.log("Manual subscription check triggered");
  } catch (error) {
    console.error("Failed to trigger manual subscription check:", error);
    throw error;
  }
}

/**
 * Cleanup function for graceful shutdown
 */
export const cleanup = async () => {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
  logger.info("[SubscriptionCron] Cleanup complete");
};

