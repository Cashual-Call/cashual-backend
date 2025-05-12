import { Router, RequestHandler } from "express";
import {
  createUser,
  getUserById,
  getAllUsers,
  updateUser,
  deleteUser,
  toggleBanUser,
  getAvailableAvatars,
  checkUsernameAvailability,
} from "../controller/user.controller";

const router = Router();

router.get("/avatars", getAvailableAvatars as RequestHandler);
router.get("/check-username", checkUsernameAvailability as RequestHandler);

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
