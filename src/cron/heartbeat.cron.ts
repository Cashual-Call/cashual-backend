import cron, { type ScheduledTask } from "node-cron";
import { RoomStateService } from "../service/room-state.service";
import logger from "../config/logger";
import { redlock } from "../config/redlock";

const roomStateService = new RoomStateService();

let scheduledTask: ScheduledTask | null = null;

const processHeartbeatJob = async () => {
	const lockKey = "lock:heartbeat-job";
	const lockTtl = 28000; // 28 seconds lock TTL for 30 second interval

	try {
		const lock = await redlock.acquire([lockKey], lockTtl);
		try {
			logger.info(
				"[HeartbeatCron] Running heartbeat job at",
				new Date().toISOString(),
			);
			await roomStateService.makeDisconnect();
			await roomStateService.removeDisconnectedUsers();
			logger.info("[HeartbeatCron] Heartbeat job processed successfully");
		} catch (err) {
			logger.error("[HeartbeatCron] Error processing heartbeat job:", err);
		} finally {
			try {
				await lock.release();
			} catch (releaseErr: any) {
				// Lock may have expired or already been released
				// Only log if it's not a quorum/expiration error
				if (
					releaseErr?.name !== "ExecutionError" &&
					!releaseErr?.message?.includes("quorum")
				) {
					logger.error("[HeartbeatCron] Error releasing lock:", releaseErr);
				}
				// Silently ignore quorum errors as they typically mean the lock expired
			}
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
		logger.error(
			"[addRecurringJob] Failed to schedule heartbeat recurring job:",
			error,
		);
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
