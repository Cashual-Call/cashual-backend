import { v4 as uuidv4 } from "uuid";
import { generateToken } from "../middleware/socket.middleware";
import { redis } from "../lib/redis";

export class AvailableUserService {
  private searchType: string;

  constructor(searchType: string) {
    this.searchType = searchType;
  }
  // Passing 2 Different JWT for 2 different users
  async startSession(user1: string, user2: string) {
    const roomId = uuidv4();
    const userOneJWT = generateToken({
      senderId: user1,
      receiverId: user2,
      roomId,
    });

    const userTwoJWT = generateToken({
      senderId: user2,
      receiverId: user1,
      roomId,
    });

    return { userOneJWT, userTwoJWT };
  }

  async addUser(userId: string, interests: string[]) {
    const pipeline = redis.pipeline();

    // Add user to main available users set
    pipeline.sadd(`users:${this.searchType}`, userId);

    // Add user to each interest-based set
    for (const interest of interests) {
      pipeline.sadd(`interest:${this.searchType}:${interest}`, userId);
    }

    // Store user's interests as a sorted set (for efficient retrieval)
    pipeline.del(`user_interests:${this.searchType}:${userId}`);
    for (let i = 0; i < interests.length; i++) {
      pipeline.zadd(
        `user_interests:${this.searchType}:${userId}`,
        i,
        interests[i]
      );
    }

    await pipeline.exec();
    return userId;
  }

  async removeUser(userId: string) {
    const pipeline = redis.pipeline();

    // Get user's interests first
    const interests = await redis.zrange(
      `user_interests:${this.searchType}:${userId}`,
      0,
      -1
    );

    // Remove user from main set
    pipeline.srem(`users:${this.searchType}`, userId);

    // Remove user from all interest sets
    for (const interest of interests) {
      pipeline.srem(`interest:${this.searchType}:${interest}`, userId);
    }

    // Remove user's interest data
    pipeline.del(`user_interests:${this.searchType}:${userId}`);

    await pipeline.exec();
  }

  async getAvailableUsers(): Promise<
    { userId: string; interests: string[] }[]
  > {
    const userIds = await redis.smembers(`users:${this.searchType}`);

    if (userIds.length === 0) return [];

    const pipeline = redis.pipeline();
    for (const userId of userIds) {
      pipeline.zrange(`user_interests:${this.searchType}:${userId}`, 0, -1);
    }

    const results = await pipeline.exec();
    if (!results) return [];

    return userIds.map((userId, index) => ({
      userId,
      interests: (results[index][1] as string[]) || [],
    }));
  }

  async getUsersByInterest(interest: string): Promise<string[]> {
    return redis.smembers(`interest:${this.searchType}:${interest}`);
  }

  async getUsersByInterests(
    interests: string[],
    operation: "AND" | "OR" = "OR"
  ): Promise<string[]> {
    if (interests.length === 0) return [];

    const keys = interests.map(
      (interest) => `interest:${this.searchType}:${interest}`
    );

    if (operation === "AND") {
      // Users who have ALL specified interests
      return redis.sinter(...keys);
    } else {
      // Users who have ANY of the specified interests
      return redis.sunion(...keys);
    }
  }

  async getCommonInterests(
    userId1: string,
    userId2: string
  ): Promise<string[]> {
    const key1 = `user_interests:${this.searchType}:${userId1}`;
    const key2 = `user_interests:${this.searchType}:${userId2}`;

    // Use temporary key for intersection
    const tempKey = `temp:common:${Date.now()}:${Math.random()}`;

    await redis.zinterstore(tempKey, 2, key1, key2);
    const common = await redis.zrange(tempKey, 0, -1);
    await redis.del(tempKey);

    return common;
  }

  async getUserInterests(userId: string): Promise<string[]> {
    return redis.zrange(
      `user_interests:${this.searchType}:${userId}`,
      0,
      -1
    );
  }

  async getInterestStats(): Promise<{ interest: string; userCount: number }[]> {
    // Get all interest keys
    const keys = await redis.keys(`interest:${this.searchType}:*`);

    if (keys.length === 0) return [];

    const pipeline = redis.pipeline();
    for (const key of keys) {
      pipeline.scard(key);
    }

    const results = await pipeline.exec();

    if (!results) return [];

    return keys.map((key, index) => ({
      interest: key.split(":").pop()!,
      userCount: (results[index][1] as number) || 0,
    }));
  }

  async cleanupEmptyInterests(): Promise<number> {
    const keys = await redis.keys(`interest:${this.searchType}:*`);
    let deletedCount = 0;

    const pipeline = redis.pipeline();
    for (const key of keys) {
      const count = await redis.scard(key);
      if (count === 0) {
        pipeline.del(key);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      await pipeline.exec();
    }

    return deletedCount;
  }

  async updateUserInterests(
    userId: string,
    newInterests: string[]
  ): Promise<void> {
    // Get current interests
    const currentInterests = await this.getUserInterests(userId);

    const pipeline = redis.pipeline();

    // Remove user from old interest sets
    for (const interest of currentInterests) {
      pipeline.srem(`interest:${this.searchType}:${interest}`, userId);
    }

    // Add user to new interest sets
    for (const interest of newInterests) {
      pipeline.sadd(`interest:${this.searchType}:${interest}`, userId);
    }

    // Update user's interests
    pipeline.del(`user_interests:${this.searchType}:${userId}`);
    for (let i = 0; i < newInterests.length; i++) {
      pipeline.zadd(
        `user_interests:${this.searchType}:${userId}`,
        i,
        newInterests[i]
      );
    }

    await pipeline.exec();
  }
}
