import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { json } from "body-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import session from "express-session";
import "dotenv/config";
import { setupWebSocketHandlers } from "./websocket";
import { pubClient, subClient } from "./lib/redis";
import { prisma } from "./lib/prisma";
import userRouter from "./routes/user.route";
import historyRouter from "./routes/history.route";
import uploadRouter from "./routes/upload.route";
import { addRecurringJob, cleanup as matchCleanup } from "./cron/match.cron";
import { addRecurringJob as addHeartbeatJob, cleanup as heartbeatCleanup } from "./cron/heartbeat.cron";
import { addRecurringJob as addSubscriptionJob, cleanup as subscriptionCleanup } from "./cron/subscription.cron";
import searchRouter from "./routes/search.route";
import heartbeatRouter from "./routes/heartbeat.route";
import paymentRouter from "./routes/payment.route";
import reportRouter from "./routes/report.route";
import { ExpressAdapter } from "@bull-board/express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { messageQueue, matchQueue } from "./lib/queue";
import { auth } from "./lib/auth";
import { toNodeHandler } from "better-auth/node";

const app = express();
const httpServer = createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

const io = new Server(httpServer, {
  cors: {
    origin: [FRONTEND_URL, "https://admin.socket.io"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// instrument(io, {
//   auth: false,
//   mode: (process.env.NODE_ENV as "development" | "production") || "development",
// });

// Set up Redis adapter for Socket.IO
Promise.all([pubClient, subClient]).then(([pub, sub]) => {
  io.adapter(createAdapter(pub, sub));
  // Initialize WebSocket handlers after Redis adapter is set up
  setupWebSocketHandlers(io);
});

// Middleware
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);
app.use(helmet());
app.use(morgan("dev"));
app.all("/api/auth/*splat", toNodeHandler(auth));
app.use(json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Use routes
// app.use("/api/v1/auth", authRouter);

app.use("/api/v1/users", userRouter);
app.use("/api/v1/search", searchRouter);
app.use("/api/v1/history", historyRouter);
app.use("/api/v1/upload", uploadRouter);
app.use("/api/v1/heartbeat", heartbeatRouter);
app.use("/api/v1/payment", paymentRouter);
app.use("/api/v1/reports", reportRouter);

// Bull Board setup
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");
createBullBoard({
  queues: [new BullMQAdapter(messageQueue), new BullMQAdapter(matchQueue)],
  serverAdapter,
});
app.use("/admin/queues", serverAdapter.getRouter());

// Health check endpoint with detailed system metrics
app.get("/health", async (req, res) => {
  const chatTotalUsers = await pubClient.get(`chat:total-users`);
  const callTotalUsers = await pubClient.get(`call:total-users`);
  const totalUserCount = Number(chatTotalUsers) + Number(callTotalUsers);

  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  res.status(200).json({
    timestamp: new Date().toISOString(),
    totalUserCount,
    uptime: {
      seconds: uptime,
      formatted: `${Math.floor(uptime / 3600)}h ${Math.floor(
        (uptime % 3600) / 60
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

// 404 handler - must be after all routes but before error handler
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({
    error: "Not Found",
    message: "The requested resource does not exist",
    path: req.path,
  });
});

app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error(err.stack);
    res.status(500).json({ error: "Something went wrong!" });
  }
);

const PORT = process.env.PORT || 8080;

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
