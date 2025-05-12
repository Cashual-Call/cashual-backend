import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import bodyParser from "body-parser";
import session from "express-session";
import "dotenv/config";
import authRouter from "./routes/auth.route";
import { setupWebSocketHandlers } from "./websocket";
import { pubClient, subClient } from "./lib/redis";
import { prisma } from "./lib/prisma";
import { validateResponse } from "./middleware/validate.middleware";
import userRouter from "./routes/user.route";
const app = express();
const httpServer = createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

const io = new Server(httpServer, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Set up Redis adapter for Socket.IO
Promise.all([pubClient, subClient]).then(([pub, sub]) => {
  io.adapter(createAdapter(pub, sub));
  // Initialize WebSocket handlers after Redis adapter is set up
  setupWebSocketHandlers(io, pub);
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
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
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
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/users", userRouter);

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

httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received. Closing HTTP server...");
  await prisma.$disconnect();
  await pubClient.quit();
  await subClient.quit();
  httpServer.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});
