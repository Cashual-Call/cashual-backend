import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";

export default class ChatRoomService {
  private readonly CACHE_TTL = 60 * 60 * 24;
  private readonly CHAT_ROOM_KEY_PREFIX = "chat_room:";
  private readonly USER_CHAT_ROOMS_KEY_PREFIX = "user_chat_rooms:";
  private readonly LAST_MESSAGE_KEY_PREFIX = "last_message:";

  // Helper method to generate Redis key for a chat room
  private getChatRoomKey(id: string): string {
    return `${this.CHAT_ROOM_KEY_PREFIX}${id}`;
  }

  // Helper method to generate Redis key for user's chat rooms
  private getUserChatRoomsKey(userId: string): string {
    return `${this.USER_CHAT_ROOMS_KEY_PREFIX}${userId}`;
  }

  // Helper method to generate Redis key for the last message in a chat room
  private getLastMessageKey(chatRoomId: string): string {
    return `${this.LAST_MESSAGE_KEY_PREFIX}${chatRoomId}`;
  }

  async createChatRoom(userId1: string, userId2: string) {
    const chatRoom = await prisma.chatRoom.create({
      data: {
        userId1,
        userId2,
      },
    });

    // Cache the new chat room
    await redis.set(
      this.getChatRoomKey(chatRoom.id),
      JSON.stringify(chatRoom),
      "EX",
      this.CACHE_TTL
    );

    // Invalidate user chat rooms cache for both users
    await redis.del(this.getUserChatRoomsKey(userId1));
    await redis.del(this.getUserChatRoomsKey(userId2));

    return chatRoom;
  }

  async getChatRoom(id: string) {
    // Try to get from cache first
    const cachedChatRoom = await redis.get(this.getChatRoomKey(id));
    
    if (cachedChatRoom) {
      return JSON.parse(cachedChatRoom);
    }

    // If not in cache, fetch from database
    const chatRoom = await prisma.chatRoom.findUnique({
      where: {
        id,
      },
    });

    // Cache the result if found
    if (chatRoom) {
      await redis.set(
        this.getChatRoomKey(id),
        JSON.stringify(chatRoom),
        "EX",
        this.CACHE_TTL
      );
    }

    return chatRoom;
  }

  async getChatRoomByUserId(userId: string) {
    // Try to get from cache first
    const cachedChatRooms = await redis.get(this.getUserChatRoomsKey(userId));
    
    if (cachedChatRooms) {
      return JSON.parse(cachedChatRooms);
    }

    // If not in cache, fetch from database
    const chatRooms = await prisma.chatRoom.findMany({
      where: {
        OR: [{ userId1: userId }, { userId2: userId }],
      },
    });

    // Cache the result
    await redis.set(
      this.getUserChatRoomsKey(userId),
      JSON.stringify(chatRooms),
      "EX",
      this.CACHE_TTL
    );

    return chatRooms;
  }

  async getChatRoomByUsers(userId1: string, userId2: string) {
    // For this method, we'll query the database directly as it's a specific lookup
    // that would be inefficient to cache separately
    const chatRoom = await prisma.chatRoom.findFirst({
      where: {
        OR: [
          { userId1, userId2 },
          { userId1: userId2, userId2: userId1 }
        ]
      },
    });

    // If found, cache the chat room
    if (chatRoom) {
      await redis.set(
        this.getChatRoomKey(chatRoom.id),
        JSON.stringify(chatRoom),
        "EX",
        this.CACHE_TTL
      );
    }

    return chatRoom;
  }

  // TODO: This is not working as expected
  async getLastMessage(chatRoomId: string) {
    // Try to get from cache first
    const cachedLastMessage = await redis.get(this.getLastMessageKey(chatRoomId));
    
    if (cachedLastMessage) {
      return JSON.parse(cachedLastMessage);
    }

    // If not in cache, fetch from database
    const lastMessage = await prisma.text.findFirst({
      where: {
        chatRoomId,
      },
      orderBy: {
        sentAt: "desc",
      },
    });

    // Cache the result if found
    if (lastMessage) {
      await redis.set(
        this.getLastMessageKey(chatRoomId),
        JSON.stringify(lastMessage),
        "EX",
        this.CACHE_TTL
      );
    }

    return lastMessage;
  }

  async getMessages(chatRoomId: string, limit: number = 50, cursor?: string) {
    // Try to get from cache first
    const cachedMessages = await redis.get(this.getMessagesKey(chatRoomId));
    
    if (cachedMessages) {
      return JSON.parse(cachedMessages);
    }

    // If not in cache, fetch from database
    const messages = await prisma.text.findMany({
      where: {
        chatRoomId,
      },
      orderBy: {
        sentAt: "desc",
      },
      take: limit,
      ...(cursor && {
        cursor: {
          id: cursor,
        },
        skip: 1,
      }),
    });

    // Cache the result if found
    if (messages.length > 0) {
      await redis.set(
        this.getMessagesKey(chatRoomId),
        JSON.stringify(messages),
        "EX",
        this.CACHE_TTL
      );
    }

    return messages;
  }

  private getMessagesKey(chatRoomId: string): string {
    return `chat:messages:${chatRoomId}`;
  }

  // Method to invalidate cache when a new message is added
  async invalidateLastMessageCache(chatRoomId: string) {
    await redis.del(this.getLastMessageKey(chatRoomId));
  }

  // Method to update cache when a message is sent
  async updateLastMessageCache(chatRoomId: string, message: any) {
    await redis.set(
      this.getLastMessageKey(chatRoomId),
      JSON.stringify(message),
      "EX",
      this.CACHE_TTL
    );
  }
}