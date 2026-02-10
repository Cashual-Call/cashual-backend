import { FriendChatService } from "../service/friend-chat.service";
import { FriendsService } from "../service/friend.service";
import { Request, Response } from "express";
import { NotificationService } from "../service/notification.service";
import { NotificationPriority, NotificationType } from "../generated/client";
import { prisma } from "../lib/prisma";
import {
	FriendChatMessageService,
	FriendChatMessageType,
} from "../service/friend-chat-message.service";

export class FriendChatController {
	private friendChatService: FriendChatService;
	private friendsService: FriendsService;
	private friendChatMessageService: FriendChatMessageService;
	private searchType: "chat" | "call";

	constructor(searchType: "chat" | "call") {
		this.searchType = searchType;
		this.friendChatService = new FriendChatService(searchType);
		this.friendsService = new FriendsService();
		this.friendChatMessageService = new FriendChatMessageService();
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
			if (this.searchType === "call") {
				await NotificationService.createNotification(
					friendData.friend.id,
					`Incoming call from ${friendData.user.displayUsername || friendData.user.username || "User"}`,
					"You have an incoming friend call.",
					NotificationType.CALL_INCOMING,
					NotificationPriority.HIGH,
					{
						source: "friend_call_request",
						roomId,
						token: token2,
						type: "/call",
						user: {
							id: friendData.user.id,
							username: friendData.user.username,
							displayUsername: friendData.user.displayUsername,
							name: friendData.user.name,
							image: friendData.user.image,
							avatarUrl: friendData.user.avatarUrl,
							isPro: friendData.user.isPro,
						},
					},
				);
			} else {
				await NotificationService.createNotification(
					friendData.friend.id,
					"Started Chat with " + friendData.user.displayUsername,
					"You have started a chat with " + friendData.user.displayUsername,
					NotificationType.NEW_MESSAGE,
					NotificationPriority.NORMAL,
				);
			}
		}

		res.status(200).json({
			message: "Chat started",
			data: { token: token1, roomId },
		});
	};

	private resolveUserIdentitySet(user: {
		id: string;
		username: string | null;
		displayUsername: string | null;
	}) {
		const set = new Set<string>();
		set.add(user.id);
		if (user.username) {
			set.add(user.username);
		}
		if (user.displayUsername) {
			set.add(user.displayUsername);
		}
		return set;
	}

	private extractFriendRoomParticipants(roomId: string): [string, string] | null {
		const parts = roomId.split("|").map((item) => item.trim());
		if (parts.length !== 2 || !parts[0] || !parts[1]) {
			return null;
		}
		return [parts[0], parts[1]];
	}

	getMessages = async (req: Request, res: Response) => {
		const userId = req.user?.id;
		const { roomId } = req.params;
		const limit = Number(req.query.limit || 100);

		if (!userId) {
			return res.status(401).json({ message: "Unauthorized" });
		}

		const roomParticipants = this.extractFriendRoomParticipants(roomId);
		if (!roomParticipants) {
			return res.status(400).json({ message: "Invalid friend chat room id" });
		}

		const me = await prisma.user.findUnique({
			where: { id: userId },
			select: { id: true, username: true, displayUsername: true },
		});

		if (!me) {
			return res.status(404).json({ message: "User not found" });
		}

		const identitySet = this.resolveUserIdentitySet(me);
		const amParticipant =
			identitySet.has(roomParticipants[0]) || identitySet.has(roomParticipants[1]);
		if (!amParticipant) {
			return res.status(403).json({ message: "You are not part of this room" });
		}

		const data = await this.friendChatMessageService.getMessages(roomId, limit);
		return res.status(200).json({ message: "Messages fetched", data });
	};

	sendMessage = async (req: Request, res: Response) => {
		const userId = req.user?.id;
		const { roomId } = req.params;
		const {
			content,
			type = "text",
		}: { content?: string; type?: FriendChatMessageType } = req.body;

		if (!userId) {
			return res.status(401).json({ message: "Unauthorized" });
		}
		if (!content || typeof content !== "string" || !content.trim()) {
			return res.status(400).json({ message: "Message content is required" });
		}
		const allowedTypes = new Set<FriendChatMessageType>([
			"text",
			"image",
			"gif",
			"audio",
			"video",
			"file",
		]);
		if (!allowedTypes.has(type)) {
			return res.status(400).json({ message: "Invalid message type" });
		}

		const roomParticipants = this.extractFriendRoomParticipants(roomId);
		if (!roomParticipants) {
			return res.status(400).json({ message: "Invalid friend chat room id" });
		}

		const me = await prisma.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				username: true,
				displayUsername: true,
				name: true,
				avatarUrl: true,
				image: true,
			},
		});
		if (!me) {
			return res.status(404).json({ message: "User not found" });
		}

		const identitySet = this.resolveUserIdentitySet(me);
		const participantA = roomParticipants[0];
		const participantB = roomParticipants[1];
		const amA = identitySet.has(participantA);
		const amB = identitySet.has(participantB);

		if (!amA && !amB) {
			return res.status(403).json({ message: "You are not part of this room" });
		}

		const receiverIdentifier = amA ? participantB : participantA;
		const receiver = await prisma.user.findFirst({
			where: {
				OR: [
					{ id: receiverIdentifier },
					{ username: receiverIdentifier },
					{ displayUsername: receiverIdentifier },
				],
			},
			select: {
				id: true,
				username: true,
				displayUsername: true,
				name: true,
				avatarUrl: true,
				image: true,
			},
		});
		if (!receiver) {
			return res.status(404).json({ message: "Receiver not found" });
		}

		const friendship = await this.friendsService.areFriends(userId, receiver.id, true);
		if (!friendship.areFriends || friendship.status !== "accepted") {
			return res.status(403).json({ message: "Friendship not accepted" });
		}

		const senderUsername =
			me.displayUsername || me.username || me.name || me.id || "User";
		const receiverUsername =
			receiver.displayUsername ||
			receiver.username ||
			receiver.name ||
			receiver.id ||
			"User";

		const message = await this.friendChatMessageService.addMessage({
			content: content.trim(),
			senderId: me.id,
			receiverId: receiver.id,
			senderUsername,
			receiverUsername,
			roomId,
			username: senderUsername,
			type,
			avatarUrl: me.avatarUrl || me.image || "",
		});

		await NotificationService.createNotification(
			receiver.id,
			`New message from ${senderUsername}`,
			message.content,
			NotificationType.NEW_MESSAGE,
			NotificationPriority.NORMAL,
			{
				roomId,
				senderId: me.id,
				senderUsername,
				messagePreview: message.content,
				source: "friend_chat",
				message,
				user: {
					id: me.id,
					username: me.username,
					displayUsername: me.displayUsername,
					name: me.name,
					avatarUrl: me.avatarUrl,
					image: me.image,
				},
			},
		);

		return res.status(201).json({ message: "Message sent", data: message });
	};
}
