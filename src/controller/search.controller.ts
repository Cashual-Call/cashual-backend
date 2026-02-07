import { Request, Response } from "express";
import { MatchService } from "../service/match.service";
import { generateToken } from "../middleware/socket.middleware";
import { verifyUserId } from "../utils/user-id";
import { RoomStateService } from "../service/room-state.service";
import RoomService from "../service/room.service";
import { NotificationPriority, NotificationType, RoomType } from "../generated/client";
import { NotificationService } from "../service/notification.service";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { v4 as uuidv4 } from "uuid";

export class SearchController {
	private matchService: MatchService;
	private roomService: RoomService;
	private roomStateService: RoomStateService;

	constructor(searchType: string) {
		this.matchService = new MatchService(searchType);
		this.roomService = new RoomService(RoomType.CHAT);
		this.roomStateService = new RoomStateService();

		this.startSearch = this.startSearch.bind(this);
		this.stopSearch = this.stopSearch.bind(this);
		this.heartbeat = this.heartbeat.bind(this);
		this.createPublicRoom = this.createPublicRoom.bind(this);
		this.startDirectChat = this.startDirectChat.bind(this);
		this.acceptDirectChat = this.acceptDirectChat.bind(this);
	}

	async startSearch(req: Request, res: Response) {
		const result = await this.matchService.addUser(
			req.user?.id || "",
			req.user?.username || req.user?.name || "",
			[],
		);

		res.status(200).json({ message: "Search started", data: { user: result } });
		return;
	}

	async stopSearch(req: Request, res: Response) {
		const userId = req.user?.id || "";

		if (!userId) {
			throw new Error("User ID is required");
		}

		await this.matchService.removeUser(userId);

		res.status(200).json({ message: "Search stopped" });
		return;
	}

	async heartbeat(req: Request, res: Response) {
		const { userId } = req.params;

		if (!userId) {
			throw new Error("User ID is required");
		}

		const user = await verifyUserId(userId);

		if (!user) {
			throw new Error("User is Not Validated");
		}

		await this.matchService.updateUserHeartbeat(userId);

		res.status(200).json({ message: "Heartbeat updated" });
		return;
	}

	async createPublicRoom(req: Request, res: Response) {
		const data = {
			senderId: req.user?.username || req.user?.name || "",
			receiverId: "public-room",
			roomId: "general",
		};
		const jwt = generateToken(data);

		res.status(200).json({
			message: "Public room Token created",
			data: {
				jwt,
				data,
			},
		});
		return;
	}

	async startDirectChat(req: Request, res: Response) {
		const userId = req.user?.id as string;
		const { target } = req.body || {};

		if (!userId) {
			return res.status(401).json({ message: "Unauthorized" });
		}

		if (!target || typeof target !== "string") {
			return res.status(400).json({ message: "Target user is required" });
		}

		const currentUser = await prisma.user.findUnique({
			where: { id: userId },
		});

		if (!currentUser) {
			return res.status(401).json({ message: "Unauthorized" });
		}

		const targetUser = await prisma.user.findFirst({
			where: {
				OR: [
					{ id: target },
					{ username: target },
					{ displayUsername: target },
					{ name: target },
				],
			},
		});

		if (!targetUser) {
			return res.status(404).json({ message: "User not found" });
		}

		if (targetUser.id === currentUser.id) {
			return res.status(400).json({ message: "Cannot chat with yourself" });
		}

		const senderUsername =
			currentUser.displayUsername ||
			currentUser.username ||
			currentUser.name ||
			currentUser.id;

		const requestId = uuidv4();
		const requestPayload = {
			id: requestId,
			requesterId: currentUser.id,
			requesterUsername: senderUsername,
			targetId: targetUser.id,
			createdAt: new Date().toISOString(),
		};

		await redis.set(
			`chat:direct_request:${requestId}`,
			JSON.stringify(requestPayload),
			"EX",
			60 * 10,
		);

		await NotificationService.createNotification(
			targetUser.id,
			"New chat request",
			`${senderUsername} wants to chat with you.`,
			NotificationType.NEW_MESSAGE,
			NotificationPriority.NORMAL,
			{
				type: "chat_request",
				requestId,
				requester: {
					id: currentUser.id,
					username: senderUsername,
					avatarUrl: currentUser.avatarUrl,
					name: currentUser.name,
					isPro: currentUser.isPro,
				},
			},
		);

		return res.status(200).json({
			message: "Chat request sent",
			data: {
				requestId,
			},
		});
	}

	async acceptDirectChat(req: Request, res: Response) {
		const userId = req.user?.id as string;
		const { requestId } = req.body || {};

		if (!userId) {
			return res.status(401).json({ message: "Unauthorized" });
		}

		if (!requestId || typeof requestId !== "string") {
			return res.status(400).json({ message: "Request ID is required" });
		}

		const raw = await redis.get(`chat:direct_request:${requestId}`);
		if (!raw) {
			return res.status(404).json({ message: "Chat request not found" });
		}

		const requestData = JSON.parse(raw) as {
			requesterId: string;
			targetId: string;
		};

		if (requestData.targetId !== userId) {
			return res.status(403).json({ message: "Not authorized" });
		}

		const [currentUser, requesterUser] = await Promise.all([
			prisma.user.findUnique({ where: { id: userId } }),
			prisma.user.findUnique({ where: { id: requestData.requesterId } }),
		]);

		if (!currentUser || !requesterUser) {
			return res.status(404).json({ message: "User not found" });
		}

		let room = await this.roomService.getRoomByUsers(
			currentUser.id,
			requesterUser.id,
		);

		if (!room) {
			room = await this.roomService.createRoom(
				currentUser.id,
				requesterUser.id,
				currentUser.id,
				requesterUser.id,
			);
			await this.roomStateService.initializeRoomState(
				room.id,
				"chat",
				currentUser.id,
				requesterUser.id,
			);
		}

		const currentUsername =
			currentUser.displayUsername ||
			currentUser.username ||
			currentUser.name ||
			currentUser.id;
		const requesterUsername =
			requesterUser.displayUsername ||
			requesterUser.username ||
			requesterUser.name ||
			requesterUser.id;

		const tokenForCurrent = generateToken({
			senderId: currentUser.id,
			receiverId: requesterUser.id,
			roomId: room.id,
			senderUsername: currentUsername,
			receiverUsername: requesterUsername,
		});

		const tokenForRequester = generateToken({
			senderId: requesterUser.id,
			receiverId: currentUser.id,
			roomId: room.id,
			senderUsername: requesterUsername,
			receiverUsername: currentUsername,
		});

		await redis.del(`chat:direct_request:${requestId}`);

		await NotificationService.createNotification(
			requesterUser.id,
			"Chat accepted",
			`${currentUsername} accepted your chat request.`,
			NotificationType.MATCH_FOUND,
			NotificationPriority.HIGH,
			{
				roomId: room.id,
				token: tokenForRequester,
				type: "chat",
				user: currentUser,
			},
		);

		return res.status(200).json({
			message: "Chat started",
			data: {
				roomId: room.id,
				token: tokenForCurrent,
				user: requesterUser,
			},
		});
	}

	async getStatus(req: Request, res: Response) {
		const { userId } = req.params;

		if (!userId) {
			throw new Error("User ID is required");
		}

		const user = await verifyUserId(userId);
	}
}
