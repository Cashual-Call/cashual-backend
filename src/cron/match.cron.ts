import cron, { type ScheduledTask } from "node-cron";
import { redis } from "../lib/redis";
import { MatchService } from "../service/match.service";
import logger from "../config/logger";
import { redlock } from "../config/redlock";
import type { Lock } from "redlock";

const matchServiceChat = new MatchService("chat");
const matchServiceCall = new MatchService("call");

let scheduledTask: ScheduledTask | null = null;

const processMatchJob = async () => {
	const lockKey = "lock:match-job";
	const lockTtl = 1900;

	let lock: Lock | null = null;
	try {
		lock = await redlock.acquire([lockKey], lockTtl);
	} catch (lockErr) {
		// Lock not acquired, another instance is running the job
		// This is expected in a distributed environment
		// Optionally log: logger.info("[MatchCron] Lock not acquired, skipping this run.");
		return;
	}

	try {
		// logger.info("[MatchCron] Running match job at", { service: "cashual-backend", timestamp: new Date().toISOString() });

		// Fix any Redis data type inconsistencies first
		await matchServiceChat.availableUserService.cleanupDataTypeInconsistencies();
		await matchServiceCall.availableUserService.cleanupDataTypeInconsistencies();

		// Clean up inactive users (users inactive for more than 30 seconds)
		const chatInactiveCount =
			await matchServiceChat.cleanupInactiveUsers(30000);
		const callInactiveCount =
			await matchServiceCall.cleanupInactiveUsers(30000);

		if (chatInactiveCount > 0 || callInactiveCount > 0) {
			logger.info(
				`[MatchCron] Cleaned up inactive users - Chat: ${chatInactiveCount}, Call: ${callInactiveCount}`,
			);
		}

		// Then perform matching
		await matchServiceChat.bestMatch();
		await matchServiceCall.bestMatch();
		// logger.info("[MatchCron] Match job processed successfully");
	} catch (err) {
		logger.error("[MatchCron] Error processing match job:", err);
	} finally {
		if (lock) {
			try {
				await lock.release();
			} catch (releaseErr) {
				logger.error("[MatchCron] Error releasing lock:", releaseErr);
			}
		}
	}
};

// Add a recurring job that runs every 2 seconds
export const addRecurringJob = async () => {
	if (scheduledTask) {
		scheduledTask.stop();
		scheduledTask = null;
	}
	try {
		scheduledTask = cron.schedule("*/3 * * * * *", processMatchJob);
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
