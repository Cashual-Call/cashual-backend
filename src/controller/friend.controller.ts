import { Request, Response } from "express";
import { FriendsService } from "../service/friend.service";

export class FriendsController {
	private friendsService: FriendsService;

	constructor() {
		this.friendsService = new FriendsService();
	}

	/**
	 * Get friends list for authenticated user (includes accepted and pending)
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

			const allFriends = await this.friendsService.getFriendsList(userId);

			// Separate friends by status
			const accepted = allFriends.filter((f) => f.status === "accepted");
			const pendingSent = allFriends.filter((f) => f.status === "pending_sent");
			const pendingReceived = allFriends.filter(
				(f) => f.status === "pending_received",
			);

			res.status(200).json({
				success: true,
				data: {
					accepted,
					pendingSent,
					pendingReceived,
				},
				count: {
					total: allFriends.length,
					accepted: accepted.length,
					pendingSent: pendingSent.length,
					pendingReceived: pendingReceived.length,
				},
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
				req.user?.id || "",
				friendId || "",
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
	 * Cancel sent friend request
	 * DELETE /api/friends/cancel/:friendId
	 */
	cancelFriendRequest = async (req: Request, res: Response): Promise<void> => {
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
			console.error("Error canceling friend request:", error);

			if (error instanceof Error) {
				if (error.message.includes("not found")) {
					res.status(404).json({
						success: false,
						message: error.message,
					});
					return;
				}

				if (error.message.includes("No pending")) {
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
		res: Response,
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

			const {areFriends, status} = await this.friendsService.areFriends(userId, friendId);

			res.status(200).json({
				success: true,
				data: {
					areFriends,
					userId,
					friendId,
					status,
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
				limit,
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

	/**
	 * Get pending friend requests
	 * GET /api/friends/pending
	 */
	getPendingRequests = async (req: Request, res: Response): Promise<void> => {
		try {
			const userId = req.user?.username;

			if (!userId) {
				res.status(401).json({
					success: false,
					message: "Unauthorized",
				});
				return;
			}

			const requests = await this.friendsService.getPendingRequests(userId);

			res.status(200).json({
				success: true,
				data: requests,
				count: requests.length,
			});
		} catch (error) {
			console.error("Error getting pending requests:", error);
			res.status(500).json({
				success: false,
				message: "Internal server error",
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	};

	/**
	 * Accept friend request
	 * POST /api/friends/accept/:friendshipId
	 */
	acceptFriendRequest = async (req: Request, res: Response): Promise<void> => {
		try {
			const userId = req.user?.username;
			const { friendshipId } = req.params;

			if (!userId) {
				res.status(401).json({
					success: false,
					message: "Unauthorized",
				});
				return;
			}

			if (!friendshipId) {
				res.status(400).json({
					success: false,
					message: "Friendship ID is required",
				});
				return;
			}

			const result =
				await this.friendsService.acceptFriendRequest(friendshipId);

			res.status(200).json({
				success: true,
				message: result.message,
			});
		} catch (error) {
			console.error("Error accepting friend request:", error);

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
	 * Reject friend request
	 * POST /api/friends/reject/:friendshipId
	 */
	rejectFriendRequest = async (req: Request, res: Response): Promise<void> => {
		try {
			const userId = req.user?.username;
			const { friendshipId } = req.params;

			if (!userId) {
				res.status(401).json({
					success: false,
					message: "Unauthorized",
				});
				return;
			}

			if (!friendshipId) {
				res.status(400).json({
					success: false,
					message: "Friendship ID is required",
				});
				return;
			}

			const result =
				await this.friendsService.rejectFriendRequest(friendshipId);

			res.status(200).json({
				success: true,
				message: result.message,
			});
		} catch (error) {
			console.error("Error rejecting friend request:", error);

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
}
