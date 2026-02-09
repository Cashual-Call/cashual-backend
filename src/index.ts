import express from "express";
import type { Request } from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { json } from "body-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import "dotenv/config";
import { setupWebSocketHandlers } from "./websocket";
import { pubClient, redis, subClient } from "./lib/redis";
import { prisma } from "./lib/prisma";
import { addRecurringJob, cleanup as matchCleanup } from "./cron/match.cron";
import {
	addRecurringJob as addHeartbeatJob,
	cleanup as heartbeatCleanup,
} from "./cron/heartbeat.cron";
import {
	addRecurringJob as addSubscriptionJob,
	cleanup as subscriptionCleanup,
} from "./cron/subscription.cron";
import { auth } from "./lib/auth";
import { toNodeHandler } from "better-auth/node";
import { errorHandler } from "./utils";
import router from "./routes";
import { instrument } from "@socket.io/admin-ui";
import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";

const app = express();
const httpServer = createServer(app);

const PORT = process.env.PORT || 8080;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const TEST_FRONTEND_URL = process.env.TEST_FRONTEND_URL || "http://localhost:3000";
const RATE_LIMIT_WINDOW_MS =
	Number(process.env.RATE_LIMIT_WINDOW_MS) || 5 * 60 * 1000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 300;

const io = new Server(httpServer, {
	cors: {
		origin: [FRONTEND_URL, TEST_FRONTEND_URL, "https://admin.socket.io"],
		methods: ["GET", "POST"],
		credentials: true,
	},
});

instrument(io, {
	auth: false,
	mode: "development",
});

// Set up Redis adapter for Socket.IO
Promise.all([pubClient, subClient]).then(([pub, sub]) => {
	const adapter = createAdapter(pub, sub);
	io.adapter(adapter as any);
	// Initialize WebSocket handlers after Redis adapter is set up
	setupWebSocketHandlers(io);
});

// Middleware
app.use(
	cors({
		origin: [FRONTEND_URL, TEST_FRONTEND_URL],
		credentials: true,
	}),
);
app.use(helmet());
app.use(morgan("dev"));
app.use(
	rateLimit({
		windowMs: RATE_LIMIT_WINDOW_MS,
		max: RATE_LIMIT_MAX,
		standardHeaders: true,
		legacyHeaders: false,
		store: new RedisStore({
			sendCommand: (...args: string[]) =>
				pubClient.call(...(args as [string, ...string[]])) as Promise<any>,
		}),
	}),
);
app.all("/api/auth/*splat", toNodeHandler(auth));
app.use(
	json({
		verify: (req, _res, buf) => {
			const request = req as Request;
			request.rawBody = buf.toString("utf8");
		},
	}),
);
app.use(express.urlencoded({ extended: true }));
app.use(errorHandler);

// Health check endpoint with detailed system metrics
app.get("/health", async (_, res) => {
	const totalUserCount = await redis.scard("sse:users");

	const uptime = process.uptime();
	const memoryUsage = process.memoryUsage();
	const cpuUsage = process.cpuUsage();

	res.status(200).json({
		timestamp: new Date().toISOString(),
		totalUserCount,
		uptime: {
			seconds: uptime,
			formatted: `${Math.floor(uptime / 3600)}h ${Math.floor(
				(uptime % 3600) / 60,
			)}m ${Math.floor(uptime % 60)}s`,
		},
		memory: {
			total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
			used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
			external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
			rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
		},
		cpu: {
			user: `${Math.round(cpuUsage.user / 1000)}ms`,
			system: `${Math.round(cpuUsage.system / 1000)}ms`,
		},
		environment: process.env.NODE_ENV || "development",
	});
});

app.use(router);

// Start the recurring job
addRecurringJob()
	.then(() => {
		console.log("Recurring job Started...");
	})
	.catch(console.error);

addHeartbeatJob()
	.then(() => {
		console.log("Heartbeat job Started...");
	})
	.catch(console.error);

addSubscriptionJob()
	.then(() => {
		console.log("Subscription check job Started...");
	})
	.catch(console.error);

httpServer.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});

// Handle graceful shutdown
process.on("SIGTERM", async () => {
	console.log("SIGTERM received. Closing HTTP server...");
	await prisma.$disconnect();
	await pubClient.quit();
	await subClient.quit();
	await matchCleanup();
	await heartbeatCleanup();
	await subscriptionCleanup();

	httpServer.close(() => {
		console.log("HTTP server closed");
		process.exit(0);
	});
});
