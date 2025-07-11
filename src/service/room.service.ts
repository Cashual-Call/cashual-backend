import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { RoomType } from "@prisma/client";

export default class RoomService {
  private readonly roomType: RoomType = RoomType.CHAT;

  private readonly CACHE_TTL = 60 * 60 * 24;
  private readonly ROOM_KEY_PREFIX = `${this.roomType}_room:`;
  private readonly USER_ROOMS_KEY_PREFIX = `${this.roomType}_rooms:`;
  private readonly LAST_MESSAGE_KEY_PREFIX = "last_message:";

  constructor(roomType: RoomType = RoomType.CHAT) {
    this.roomType = roomType;
  }

  // Helper method to generate Redis key for a chat room
  private getRoomKey(id: string): string {
    return `${this.ROOM_KEY_PREFIX}${id}`;
  }

  // Helper method to generate Redis key for user's chat rooms
  private getUserRoomsKey(userId: string): string {
    return `${this.USER_ROOMS_KEY_PREFIX}${userId}`;
  }

  // Helper method to generate Redis key for the last message in a chat room
  private getLastMessageKey(roomId: string): string {
    return `${this.LAST_MESSAGE_KEY_PREFIX}${roomId}`;
  }

  async getRoomByUserId(userId: string) {
    // Try to get from cache first
    const cachedUserRooms = await redis.get(this.getUserRoomsKey(userId));
  
    if (cachedUserRooms) {
      const room = JSON.parse(cachedUserRooms);
      if(Array.isArray(room) && room.length > 0) {
        return room[0];
      } else {
        return room;
      }
    }
  
    // If not in cache, fetch from database
    const room = await prisma.room.findFirst({
      where: {
        OR: [
          { user1Id: userId },
          { user2Id: userId },
          { anonUser1Id: userId },
          { anonUser2Id: userId },
        ],
        type: this.roomType,
      },
      orderBy: {
        updatedAt: "desc", // Most recently updated rooms first
      },
    });

    // Cache the result
    await redis.set(
      this.getUserRoomsKey(userId),
      JSON.stringify(room),
      "EX",
      this.CACHE_TTL
    );
  
    return room;
  }
  
  // Updated createRoom method with better caching performance
  async createRoom(
    user1Id: string,
    user2Id: string,
    isUser1Anonymous: boolean = true,
    isUser2Anonymous: boolean = true
  ) {
    try {
      const room = await prisma.room.create({
        data: {
          anonUser1Id: user1Id,
          anonUser2Id: user2Id,
          user1Id: isUser1Anonymous ? null : user1Id,
          user2Id: isUser2Anonymous ? null : user2Id,
          type: this.roomType as RoomType,
        },
      });
  
      // Cache the new room
      await redis.set(
        this.getRoomKey(room.id),
        JSON.stringify(room),
        "EX",
        this.CACHE_TTL
      );
  
      // Update user rooms cache by adding the new room to existing cached lists
      await this.updateUserRoomsCache(user1Id, room);
      await this.updateUserRoomsCache(user2Id, room);
  
      return room;
    } catch (error) {
      console.error("Error creating chat room:", error);
      throw error;
    }
  }
  
  // Helper method to update user rooms cache efficiently
  private async updateUserRoomsCache(userId: string, newRoom: any) {
    const cachedUserRooms = await redis.get(this.getUserRoomsKey(userId));
    
    if (cachedUserRooms) {
      // If cache exists, add the new room to the beginning of the list
      let rooms = JSON.parse(cachedUserRooms);
      if(Array.isArray(rooms) && rooms.length > 0) {
        rooms.unshift(newRoom); // Add to beginning since it's the newest
      } else {
        rooms = [newRoom];
      }
      
      await redis.set(
        this.getUserRoomsKey(userId),
        JSON.stringify(rooms),
        "EX",
        this.CACHE_TTL
      );
    }
    // If cache doesn't exist, don't create it here - let getRoomByUserId handle it
  }

  async getRoom(id: string) {
    // Try to get from cache first
    const cachedroom = await redis.get(this.getRoomKey(id));

    if (cachedroom) {
      return JSON.parse(cachedroom);
    }

    // If not in cache, fetch from database
    const room = await prisma.room.findUnique({
      where: {
        id,
      },
    });

    // Cache the result if found
    if (room) {
      await redis.set(
        this.getRoomKey(id),
        JSON.stringify(room),
        "EX",
        this.CACHE_TTL
      );
    }

    return room;
  }

  async getRoomByUsers(user1Id: string, user2Id: string) {
    // For this method, we'll query the database directly as it's a specific lookup
    // that would be inefficient to cache separately
    const room = await prisma.room.findFirst({
      where: {
        OR: [
          { user1Id, user2Id },
          { user1Id: user2Id, user2Id: user1Id },
        ],
      },
    });

    // If found, cache the chat room
    if (room) {
      await redis.set(
        this.getRoomKey(room.id),
        JSON.stringify(room),
        "EX",
        this.CACHE_TTL
      );
    }

    return room;
  }

  // TODO: This is not working as expected
  async getLastMessage(roomId: string) {
    // Try to get from cache first
    const cachedLastMessage = await redis.get(this.getLastMessageKey(roomId));

    if (cachedLastMessage) {
      return JSON.parse(cachedLastMessage);
    }

    // If not in cache, fetch from database
    const lastMessage = await prisma.text.findFirst({
      where: {
        roomId,
      },
      orderBy: {
        sentAt: "desc",
      },
    });

    // Cache the result if found
    if (lastMessage) {
      await redis.set(
        this.getLastMessageKey(roomId),
        JSON.stringify(lastMessage),
        "EX",
        this.CACHE_TTL
      );
    }

    return lastMessage;
  }

  async getMessages(roomId: string, limit: number = 50, cursor?: string) {
    // Try to get from cache first
    const cachedMessages = await redis.get(this.getMessagesKey(roomId));

    if (cachedMessages) {
      return JSON.parse(cachedMessages);
    }

    // If not in cache, fetch from database
    const messages = await prisma.text.findMany({
      where: {
        roomId,
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
        this.getMessagesKey(roomId),
        JSON.stringify(messages),
        "EX",
        this.CACHE_TTL
      );
    }

    return messages;
  }

  private getMessagesKey(roomId: string): string {
    return `chat:messages:${roomId}`;
  }

  // Method to invalidate cache when a new message is added
  async invalidateLastMessageCache(roomId: string) {
    await redis.del(this.getLastMessageKey(roomId));
  }

  // Method to update cache when a message is sent
  async updateLastMessageCache(roomId: string, message: any) {
    await redis.set(
      this.getLastMessageKey(roomId),
      JSON.stringify(message),
      "EX",
      this.CACHE_TTL
    );
  }
}
