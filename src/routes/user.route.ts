import { Router, RequestHandler } from "express";
import { UserController } from "../controller/user.controller";
import { validateResponse } from "../middleware/validate.middleware";
import friendRouter from "./friend.route";
import notificationRouter from "./notification.route";
import { verifyToken } from "../middleware/auth.middleware";

const userController = new UserController();

const router = Router();

router.get("/avatars", userController.getAvailableAvatars as RequestHandler);

router.get("/points", userController.getPoints as RequestHandler);
router.get(
	"/points-by-date",
	verifyToken,
	userController.getUserPointsByDate as RequestHandler,
);
router.get(
	"/rankings",
	validateResponse,
	userController.getRankings as RequestHandler,
);
router.get(
	"/lucky-winner",
	validateResponse,
	userController.getLuckyWinner as RequestHandler,
);
router.use("/rankings", userController.getRankings as RequestHandler);

router.use("/friends", friendRouter);
router.use("/notifications", notificationRouter);

export default router;
