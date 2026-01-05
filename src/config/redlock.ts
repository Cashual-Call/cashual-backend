import Redlock from "redlock";
import { redis } from "../lib/redis";

export const redlock = new Redlock([redis as any], {
	retryCount: 3,
	retryDelay: 200, // 200ms delay between retries
	retryJitter: 100, // Add jitter to prevent thundering herd
});
