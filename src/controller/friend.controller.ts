import { Request, Response } from "express";
import { FriendsService } from "../service/friend.service";

export class FriendsController {
  private friendsService: FriendsService;

  constructor() {
    this.friendsService = new FriendsService();
  }

  /**
   * Get friends list for authenticated user
   * GET /api/friends
   */
  getFriendsList = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.username; // Assuming you have authentication middleware that sets req.user

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      const friends = await this.friendsService.getFriendsList(userId);

      res.status(200).json({
        success: true,
        data: friends,
        count: friends.length,
      });
    } catch (error) {
      console.error("Error getting friends list:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Send friend request
   * POST /api/friends/:friendId
   */
  sendFriendRequest = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.username;
      const { friendId } = req.params;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      if (!friendId) {
        res.status(400).json({
          success: false,
          message: "Friend ID is required",
        });
        return;
      }

      const newFriend = await this.friendsService.sendFriendRequest(
        userId,
        friendId
      );

      res.status(201).json({
        success: true,
        message: "Friend request sent successfully",
        data: newFriend,
      });
    } catch (error) {
      console.error("Error sending friend request:", error);

      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          res.status(404).json({
            success: false,
            message: error.message,
          });
          return;
        }

        if (
          error.message.includes("already exists") ||
          error.message.includes("yourself")
        ) {
          res.status(400).json({
            success: false,
            message: error.message,
          });
          return;
        }
      }

      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Remove friend
   * DELETE /api/friends/:friendId
   */
  removeFriend = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.username;
      const { friendId } = req.params;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      if (!friendId) {
        res.status(400).json({
          success: false,
          message: "Friend ID is required",
        });
        return;
      }

      const result = await this.friendsService.removeFriend(userId, friendId);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      console.error("Error removing friend:", error);

      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({
          success: false,
          message: error.message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Check friendship status
   * GET /api/friends/:friendId/status
   */
  checkFriendshipStatus = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const userId = req.user?.username;
      const { friendId } = req.params;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      if (!friendId) {
        res.status(400).json({
          success: false,
          message: "Friend ID is required",
        });
        return;
      }

      const areFriends = await this.friendsService.areFriends(userId, friendId);

      res.status(200).json({
        success: true,
        data: {
          areFriends,
          userId,
          friendId,
        },
      });
    } catch (error) {
      console.error("Error checking friendship status:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Get friend suggestions
   * GET /api/friends/suggestions
   */
  getFriendSuggestions = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.username;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      const suggestions = await this.friendsService.getFriendSuggestions(
        userId,
        limit
      );

      res.status(200).json({
        success: true,
        data: suggestions,
        count: suggestions.length,
      });
    } catch (error) {
      console.error("Error getting friend suggestions:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
}
