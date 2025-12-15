import { Socket } from "socket.io";
import { pubClient, redis, subClient } from "../../lib/redis";
import { sendMessageSchema, Message } from "../../validation/chat.validation";
import { ChatEvent } from "../../config/websocket";
import ChatDBService from "../../service/chat-db.service";
import { RoomStateService } from "../../service/room-state.service";
import { RedisHash } from "../../config/redis-hash";
import { FriendsService } from "../../service/friend.service";

export class ChatReceiverController {
	private chatDBService: ChatDBService;
	private roomStateService: RoomStateService;
	private friendsService: FriendsService;
	private socket: Socket;

	private roomId: string;
	private senderId: string;
	private receiverId: string;

	constructor(
		socket: Socket,
		roomId: string,
		senderId: string,
		receiverId: string,
	) {
		this.socket = socket;

		this.chatDBService = new ChatDBService();
		this.roomStateService = new RoomStateService();
		this.friendsService = new FriendsService();
		this.roomId = roomId;
		this.senderId = senderId;
		this.receiverId = receiverId;

		this.joinRoom = this.joinRoom.bind(this);
		this.leaveRoom = this.leaveRoom.bind(this);
		this.chatMessage = this.chatMessage.bind(this);
		this.disconnect = this.disconnect.bind(this);
		this.userTyping = this.userTyping.bind(this);
		this.userStoppedTyping = this.userStoppedTyping.bind(this);
		this.userDisconnected = this.userDisconnected.bind(this);
		this.userConnected = this.userConnected.bind(this);
	}

	async joinRoom() {
		try {
			// Join the room
			this.socket.join(this.roomId);

			// Ensure room state is initialized (fallback for rooms not created via match service)
			const roomStateExists = await redis.exists(`room:${this.roomId}`);
			if (!roomStateExists) {
				console.log(`Room state not found for ${this.roomId}, initializing...`);
				await this.roomStateService.initializeRoomState(
					this.roomId,
					"chat",
					this.senderId,
					this.receiverId,
				);
			}

			// Add socket to room in Redis
			await redis.sadd(`chat:rooms:${this.roomId}`, this.socket.id);

			// Add room to socket's room list
			await redis.sadd(`chat:socket:${this.socket.id}:rooms`, this.roomId);

			// Publish join event
			const joinEvent: RoomEvent = {
				type: "join",
				roomId: this.roomId,
				clientId: this.socket.id,
				username: this.senderId,
				timestamp: new Date().toISOString(),
			};

			await pubClient.publish(RedisHash.CHAT_ROOMS, JSON.stringify(joinEvent));

			// Emit joined event to the client
			this.socket.emit(ChatEvent.USER_JOINED, {
				timestamp: joinEvent.timestamp,
			});

			// Get room history if needed
			const roomHistory = await this.chatDBService.getMessages(this.roomId);
			if (roomHistory.length > 0) {
				this.socket.emit("roomHistory", roomHistory);
			}

			console.log(
				`Client ${this.socket.id} (${this.senderId}) joined room ${this.roomId}`,
			);
		} catch (error) {
			console.error(`Error joining room ${this.roomId}:`, error);
			this.socket.emit(ChatEvent.ERROR, "Failed to join room");
		}
	}

	async leaveRoom() {
		try {
			// Leave the room
			this.socket.leave(this.roomId);

			// Remove user from room in Redis
			await redis.srem(`chat:rooms:${this.roomId}`, this.socket.id);

			// Remove room from socket's room list
			await redis.srem(`chat:socket:${this.socket.id}:rooms`, this.roomId);

			// Publish leave event
			const leaveEvent: RoomEvent = {
				type: "leave",
				roomId: this.roomId,
				clientId: this.socket.id,
				username: this.senderId,
				timestamp: new Date().toISOString(),
			};

			await pubClient.publish(RedisHash.CHAT_ROOMS, JSON.stringify(leaveEvent));

			// Emit left event to the client
			this.socket.emit(ChatEvent.USER_LEFT, {
				roomId: this.roomId,
				timestamp: leaveEvent.timestamp,
			});

			console.log(
				`Client ${this.socket.id} (${this.senderId}) left room ${this.roomId}`,
			);
		} catch (error) {
			console.error(`Error leaving room ${this.roomId}:`, error);
			this.socket.emit(ChatEvent.ERROR, "Failed to leave room");
		}
	}

	async chatMessage(
		data: any,
		chatData: {
			senderUsername: string;
			receiverUsername: string;
			roomId: string;
			senderId: string;
			receiverId: string;
		},
	) {
		try {
			// Validate roomId exists and matches
			if (!this.roomId || this.roomId.trim() === "") {
				console.error("Cannot send message: roomId is missing or empty");
				this.socket.emit(ChatEvent.ERROR, "Invalid room");
				return;
			}

			if (chatData.roomId !== this.roomId) {
				console.warn(
					`RoomId mismatch: chatData.roomId=${chatData.roomId}, this.roomId=${this.roomId}`,
				);
				// Use this.roomId as the source of truth
				chatData.roomId = this.roomId;
			}

			const validatedData = sendMessageSchema.parse({
				...data,
				roomId: this.roomId,
				senderId: this.senderId,
			});

			// Check if user has permission to send message
			// const isUserInRoom = await redis.sismember(
			//   `chat:rooms:${this.roomId}`,
			//   this.socket.id
			// );

			// TODO: Remove CMTS
			// if (!isUserInRoom) {
			//   this.socket.emit(ChatEvent.ERROR, "You are not in this room");
			//   return;
			// }

			// Create the complete message object - use this.roomId as source of truth
			const message: Message = {
				content: validatedData.content,
				senderId: chatData.senderId,
				receiverId: chatData.receiverId,
				senderUsername: chatData.senderUsername,
				receiverUsername: chatData.receiverUsername,
				roomId: this.roomId, // Use this.roomId instead of chatData.roomId
				username: chatData.senderUsername || chatData.senderId,
				type: validatedData.type,
				avatarUrl: "",
				timestamp: new Date().toISOString(),
			};

			console.log(
				`[ChatReceiver] Processing message from ${this.senderId} in room ${this.roomId}`,
				{ content: message.content, type: message.type },
			);

			// "general" is a special public room where all users can chat
			// For general room, we store messages as global (no receiver needed)
			// For all other rooms, we store the full sender-receiver relationship
			const messageObj =
				this.roomId !== "general"
					? await this.chatDBService.addMessage(
							message.content,
							message.senderId,
							message.receiverId,
							message.roomId,
						)
					: await this.chatDBService.addGlobalMessage(
							message.content,
							message.senderId,
						);

			// Add message ID to room history
			await redis.lpush(`chat:room:${this.roomId}:messages`, messageObj.id);
			await redis.ltrim(`chat:room:${this.roomId}:messages`, 0, 99); // Keep last 100 messages

			// Publish message to Redis for broadcasting to all users in the room
			console.log(
				`[ChatReceiver] Publishing message to Redis channel: ${RedisHash.CHAT_MESSAGES}`,
			);
			await pubClient.publish(RedisHash.CHAT_MESSAGES, JSON.stringify(message));

			// Acknowledge message received
			this.socket.emit(ChatEvent.MESSAGE_SENT, {
				id: messageObj.id,
				timestamp: messageObj.timestamp,
			});
		} catch (error) {
			console.error("Error sending message:", error);
			this.socket.emit(ChatEvent.ERROR, "Failed to send message");
		}
	}

	async disconnect() {
		try {
			console.log(
				`Chat client disconnected: ${this.socket.id} (${this.senderId})`,
			);

			// Get all rooms this socket was in
			const rooms = await redis.smembers(`chat:socket:${this.socket.id}:rooms`);

			// Leave all rooms
			for (const roomId of rooms) {
				// Remove socket from room
				await redis.srem(`chat:rooms:${roomId}`, this.socket.id);

				// Publish leave event
				const leaveEvent: RoomEvent = {
					type: "leave",
					roomId,
					clientId: this.socket.id,
					username: this.senderId,
					timestamp: new Date().toISOString(),
				};

				await pubClient.publish(
					RedisHash.CHAT_ROOMS,
					JSON.stringify(leaveEvent),
				);
			}

			// Clean up socket data
			await redis.del(`chat:socket:${this.socket.id}:rooms`);
			await redis.hdel(`chat:users`, this.socket.id);
		} catch (error) {
			console.error("Error handling disconnect:", error);
		}
	}

	async userTyping() {
		try {
			await redis.sadd(`chat:rooms:${this.roomId}:typing`, this.socket.id);

			// Publish typing event
			await pubClient.publish(
				RedisHash.CHAT_ROOMS,
				JSON.stringify({
					type: "typing",
					roomId: this.roomId,
					clientId: this.socket.id,
					username: this.senderId,
					timestamp: new Date().toISOString(),
				}),
			);
		} catch (error) {
			console.error("Error handling user typing:", error);
		}
	}

	async userStoppedTyping() {
		try {
			await redis.srem(`chat:rooms:${this.roomId}:typing`, this.socket.id);

			// Publish stopped typing event
			await pubClient.publish(
				RedisHash.CHAT_ROOMS,
				JSON.stringify({
					type: "stopped_typing",
					roomId: this.roomId,
					clientId: this.socket.id,
					username: this.senderId,
					timestamp: new Date().toISOString(),
				}),
			);
		} catch (error) {
			console.error("Error handling user stopped typing:", error);
		}
	}

	async userDisconnected() {
		try {
			await redis.srem(`chat:rooms:${this.roomId}:typing`, this.socket.id);

			// Publish disconnected event
			await pubClient.publish(
				RedisHash.CHAT_ROOMS,
				JSON.stringify({
					type: "disconnected",
					roomId: this.roomId,
					clientId: this.socket.id,
					username: this.senderId,
					timestamp: new Date().toISOString(),
				}),
			);
		} catch (error) {
			console.error("Error handling user disconnected:", error);
		}
	}

	async userConnected() {
		try {
			// Add user to connected users set
			await redis.sadd(`chat:rooms:${this.roomId}:connected`, this.socket.id);

			// Publish connected event
			await pubClient.publish(
				RedisHash.CHAT_ROOMS,
				JSON.stringify({
					type: "connected",
					roomId: this.roomId,
					clientId: this.socket.id,
					username: this.senderId,
					timestamp: new Date().toISOString(),
				}),
			);
		} catch (error) {
			console.error("Error handling user connected:", error);
		}
	}

	async friendRequest(data: { friendUsername: string }) {
		try {
			const result = await this.friendsService.sendFriendRequest(
				this.senderId,
				data.friendUsername,
			);

			this.socket.to(this.roomId).emit(ChatEvent.FRIEND_REQUEST, {
				result,
			});
		} catch (error) {
			console.error("Error sending friend request:", error);
			this.socket.emit(
				ChatEvent.ERROR,
				error instanceof Error
					? error.message
					: "Failed to send friend request",
			);
		}
	}

	async userEvent(data: { eventType: string; payload?: any }) {
		try {
			const event = {
				type: data.eventType,
				userId: this.senderId,
				username: this.senderId,
				roomId: this.roomId,
				payload: data.payload,
				timestamp: new Date().toISOString(),
			};

			// Notify other users in the room
			this.socket.to(this.roomId).emit(ChatEvent.USER_EVENT, event);

			// Publish user event to Redis
			await pubClient.publish(
				RedisHash.CHAT_ROOMS,
				JSON.stringify({
					...event,
					clientId: this.socket.id,
				}),
			);

			console.log(`User event: ${data.eventType} from ${this.senderId}`);
		} catch (error) {
			console.error("Error handling user event:", error);
			this.socket.emit(ChatEvent.ERROR, "Failed to process user event");
		}
	}

	/**
	 * Emit a custom event to all users in the current room (except sender)
	 * @param eventName - The name of the custom event
	 * @param data - The payload to send with the event
	 */
	async emitToRoom(eventName: string, data: any) {
		try {
			const event = {
				eventName,
				data,
				senderId: this.senderId,
				roomId: this.roomId,
				timestamp: new Date().toISOString(),
			};

			// Emit to all users in the room except the sender
			this.socket.to(this.roomId).emit(eventName, event);

			console.log(`Custom event '${eventName}' emitted to room ${this.roomId}`);
		} catch (error) {
			console.error(`Error emitting custom event '${eventName}':`, error);
			this.socket.emit(ChatEvent.ERROR, `Failed to emit event: ${eventName}`);
		}
	}

	/**
	 * Emit a custom event to all users in the current room (including sender)
	 * @param eventName - The name of the custom event
	 * @param data - The payload to send with the event
	 */
	async broadcastToRoom(eventName: string, data: any) {
		try {
			const event = {
				eventName,
				data,
				senderId: this.senderId,
				roomId: this.roomId,
				timestamp: new Date().toISOString(),
			};

			// Emit to all users in the room including the sender
			this.socket.emit(eventName, event);
			this.socket.to(this.roomId).emit(eventName, event);

			console.log(
				`Custom event '${eventName}' broadcasted to room ${this.roomId}`,
			);
		} catch (error) {
			console.error(`Error broadcasting custom event '${eventName}':`, error);
			this.socket.emit(
				ChatEvent.ERROR,
				`Failed to broadcast event: ${eventName}`,
			);
		}
	}
}
