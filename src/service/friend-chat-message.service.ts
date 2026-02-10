import { randomUUID } from "node:crypto";
import { redis } from "../lib/redis";

const FRIEND_CHAT_KEY_PREFIX = "friend_chat:room:";
const MAX_MESSAGES_PER_ROOM = 500;

export type FriendChatMessageType =
	| "text"
	| "image"
	| "gif"
	| "audio"
	| "video"
	| "file";

export interface FriendChatMessage {
	id: string;
	content: string;
	senderId: string;
	receiverId: string;
	senderUsername: string;
	receiverUsername: string;
	roomId: string;
	username: string;
	type: FriendChatMessageType;
	avatarUrl: string;
	timestamp: string;
}

export class FriendChatMessageService {
	private getRoomMessagesKey(roomId: string) {
		return `${FRIEND_CHAT_KEY_PREFIX}${roomId}:messages`;
	}

	async getMessages(roomId: string, limit = 100): Promise<FriendChatMessage[]> {
		const safeLimit = Math.max(1, Math.min(limit, MAX_MESSAGES_PER_ROOM));
		const key = this.getRoomMessagesKey(roomId);
		const rawMessages = await redis.lrange(key, -safeLimit, -1);

		return rawMessages
			.map((item) => {
				try {
					return JSON.parse(item) as FriendChatMessage;
				} catch {
					return null;
				}
			})
			.filter((item): item is FriendChatMessage => item !== null);
	}

	async addMessage(
		message: Omit<FriendChatMessage, "id" | "timestamp">,
	): Promise<FriendChatMessage> {
		const storedMessage: FriendChatMessage = {
			...message,
			id: randomUUID(),
			timestamp: new Date().toISOString(),
		};

		const key = this.getRoomMessagesKey(message.roomId);
		await redis
			.multi()
			.rpush(key, JSON.stringify(storedMessage))
			.ltrim(key, -MAX_MESSAGES_PER_ROOM, -1)
			.exec();

		return storedMessage;
	}
}
