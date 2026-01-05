import { Server, Socket, Namespace } from "socket.io";
import { redis, subClient } from "../lib/redis";
import { ChatReceiverController } from "../controller/chat/chat-reciever.controller";
import { ChatEvent } from "../config/websocket";
import { verifyToken } from "../middleware/socket.middleware";
import { ChatEmitterController } from "../controller/chat/chat-emitter.controller";
import { FriendsService } from "../service/friend.service";
import { NotificationService } from "../service/notification.service";

/**
 * Sets up chat handlers for a Socket.IO server with Redis adapter for horizontal scaling
 * @param io The Socket.IO server instance
 */
export function setupChatHandlers(io: Server) {
	// Set up the chat namespace
	const chatNamespace = io.of("/chat");

	// Initialize the emitter controller which handles Redis pub/sub
	const chatEmitterController = new ChatEmitterController(chatNamespace);
	chatEmitterController.initializeSubscriptions();

	// Handle Redis reconnection
	subClient.on("reconnect", () => {
		console.log(
			"Redis subscription client reconnected, reinitializing subscriptions",
		);
		chatEmitterController.reinitializeSubscriptions();
	});

	subClient.on("error", (error) => {
		console.error("Redis subscription client error:", error);
	});

	// Initialize friends service and notification service
	const friendsService = new FriendsService();
	const notificationService = new NotificationService();

	chatNamespace.on("connection", async (socket: Socket) => {
		const authToken = socket.handshake.auth.token;

		const {
			roomId,
			senderId,
			receiverId,
			senderUsername = "",
			receiverUsername = "",
		} = authToken
			? verifyToken(authToken)
			: {
					// Default to "general" room - a public room where all unauthenticated users can chat
					roomId: "general",
					senderId: socket.id, // TODO: chanage,
					receiverId: "global",
					senderUsername: "",
					receiverUsername: "",
				};

		// Validate roomId is not empty
		if (!roomId || roomId.trim() === "") {
			console.error("Connection rejected: invalid roomId", {
				socketId: socket.id,
				authToken: !!authToken,
			});
			socket.emit(ChatEvent.ERROR, "Invalid room configuration");
			socket.disconnect(true);
			return;
		}

		console.log(
			`New chat connection: socket=${socket.id}, room=${roomId}, sender=${senderId}, receiver=${receiverId}`,
		);

		const chatRecieverController = new ChatReceiverController(
			socket,
			roomId,
			senderId,
			receiverId,
		);

		chatRecieverController.joinRoom();

		// Join a chat room
		// socket.on(ChatEvent.JOIN, () => chatRecieverController.joinRoom());

		// Leave a chat room
		socket.on(ChatEvent.LEAVE, () => chatRecieverController.leaveRoom());

		// Handle new messages
		socket.on(ChatEvent.MESSAGE, async (data: ChatMessage) =>
			chatRecieverController.chatMessage(data, {
				senderUsername,
				receiverUsername,
				roomId,
				senderId,
				receiverId,
			}),
		);

		// Handle disconnection
		socket.on(ChatEvent.DISCONNECT, () => {
			chatRecieverController.disconnect();
		});

		// Handle user typing
		socket.on(ChatEvent.USER_EVENT, (data: { eventType: string }) =>
			chatRecieverController.userEvent(data),
		);

		// Handle custom room events - emit to other users in the same room
		socket.on("emit_to_room", (data: { eventName: string; payload: any }) =>
			chatRecieverController.emitToRoom(data.eventName, data.payload),
		);

		// Handle custom room broadcasts - emit to all users including sender
		socket.on(
			"broadcast_to_room",
			(data: { eventName: string; payload: any }) =>
				chatRecieverController.broadcastToRoom(data.eventName, data.payload),
		);
	});
}
