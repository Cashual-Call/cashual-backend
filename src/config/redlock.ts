import Redlock from "redlock";
import { redis } from "../lib/redis";

export const redlock = new Redlock([redis as any], {
	retryCount: 1,
});
