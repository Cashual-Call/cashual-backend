import { Router, RequestHandler } from "express";
import { UserController } from "../controller/user.controller";
import { validateResponse } from "../middleware/validate.middleware";
import friendRouter from "./friend.route";
import notificationRouter from "./notification.route";

const userController = new UserController();

const router = Router();

router.get("/avatars", userController.getAvailableAvatars as RequestHandler);
router.get(
  "/check-username",
  userController.checkUsernameAvailability as RequestHandler
);
router.get("/user-id", userController.getUserId as RequestHandler);
router.post("/user-id", userController.verifyUserId as RequestHandler);

router.get("/points", userController.getPoints as RequestHandler);
router.get("/points-by-date", userController.getUserPointsByDate as RequestHandler);
router.get("/rankings", validateResponse, userController.getRankings as RequestHandler);

router.use("/friends", friendRouter);
router.use("/notifications", notificationRouter);

// Create a new user
// router.post("/", createUser as RequestHandler);

// // Get all users
// router.get("/", getAllUsers as RequestHandler);

// // Get user by ID
// router.get("/:id", getUserById as RequestHandler);

// // Update user
// router.put("/:id", updateUser as RequestHandler);

// // Delete user
// router.delete("/:id", deleteUser as RequestHandler);

// // Ban/Unban user
// router.patch("/:id/ban", toggleBanUser as RequestHandler);

// Get available avatars

export default router;
