import cron, { type ScheduledTask } from "node-cron";
import Redlock from "redlock";
import { redis } from "../lib/redis";
import { RoomStateService } from "../service/room-state.service";
import logger from "../config/logger";

const roomStateService = new RoomStateService();

// Setup Redlock for distributed locking
const redlock = new Redlock([redis], {
  retryCount: 1, 
});

let scheduledTask: ScheduledTask | null = null;

const processHeartbeatJob = async () => {
  const lockKey = "lock:heartbeat-job";
  const lockTtl = 28000; // 28 seconds lock TTL for 30 second interval

  try {
    const lock = await redlock.acquire([lockKey], lockTtl);
    try {
      logger.info("[HeartbeatCron] Running heartbeat job at", new Date().toISOString());
      await roomStateService.makeDisconnect();
      await roomStateService.removeDisconnectedUsers();
      logger.info("[HeartbeatCron] Heartbeat job processed successfully");
    } catch (err) {
      logger.error("[HeartbeatCron] Error processing heartbeat job:", err);
    } finally {
      await lock.release();
    }
  } catch (lockErr) {
    // Lock not acquired, another instance is running the job
    // This is expected in a distributed environment
    // Optionally log: console.log("[HeartbeatCron] Lock not acquired, skipping this run.");
  }
};

export const addRecurringJob = async () => {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
  try {
    scheduledTask = cron.schedule("*/10 * * * * *", processHeartbeatJob);
    logger.info("[HeartbeatCron] Heartbeat cron job scheduled successfully");
  } catch (error) {
    logger.error("[addRecurringJob] Failed to schedule heartbeat recurring job:", error);
  }
};

export const cleanup = async () => {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info("[HeartbeatCron] Heartbeat cron job stopped");
  }
};

export const heartbeatCron = processHeartbeatJob;