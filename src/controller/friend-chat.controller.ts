import { FriendChatService } from "../service/friend-chat.service";
import { FriendsService } from "../service/friend.service";
import { Request, Response } from "express";
import { NotificationService } from "../service/notification.service";
import { NotificationPriority, NotificationType } from "../generated/client";
import { prisma } from "../lib/prisma";

export class FriendChatController {
	private friendChatService: FriendChatService;
	private friendsService: FriendsService;

	constructor(searchType: "chat" | "call") {
		this.friendChatService = new FriendChatService(searchType);
		this.friendsService = new FriendsService();
	}

	/*
	 * at first create a room for the two users
	 * then create a token for the two users
	 * then return the token to the frontend
	 * send a notification to the other user
	 */
	startChat = async (req: Request, res: Response) => {
		const { friend } = req.params;
		const userId = req.user?.id as string;

		if (!userId) {
			return res.status(401).json({ message: "Unauthorized" });
		}

		const friendUser = await prisma.user.findFirst({
			where: {
				OR: [
					{ id: friend },
					{ username: friend },
					{ displayUsername: friend },
				],
			},
		});

		if (!friendUser) {
			return res.status(404).json({ message: "User not found" });
		}

		const friendData = await this.friendsService.areFriends(
			userId,
			friendUser.id,
			true,
		);

		if (
			!friendData.areFriends ||
			friendData.status !== "accepted" ||
			!friendData.user ||
			!friendData.friend
		) {
			return res
				.status(403)
				.json({ message: "Friendship not accepted" });
		}

		const { token1, token2, roomId } = await this.friendChatService.startChat(
			friendData.user,
			friendData.friend,
		);

		// Only send notification if friend has a username (required for notification system)
		if (friendData.friend.username) {
			await NotificationService.createNotification(
				friendData.friend.id,
				"Started Chat with " + friendData.user.displayUsername,
				"You have started a chat with " + friendData.user.displayUsername,
				NotificationType.NEW_MESSAGE,
				NotificationPriority.NORMAL,
			);
		}

		res.status(200).json({
			message: "Chat started",
			data: { token: token1, roomId },
		});
	};
}
