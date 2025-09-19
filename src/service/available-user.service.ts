import { v4 as uuidv4 } from "uuid";
import { generateToken } from "../middleware/socket.middleware";
import { redis } from "../lib/redis";

const USER_TTL = 120;

export class AvailableUserService {
  private searchType: string;

  constructor(searchType: string) {
    this.searchType = searchType;
  }

  // Cleanup method to fix data type inconsistencies
  async cleanupDataTypeInconsistencies() {
    try {
      // Check if the main users key exists and what type it is
      const userKeyType = await redis.type(`users:${this.searchType}`);
      
      if (userKeyType === 'set') {
        console.log(`[${this.searchType}] Converting users key from SET to ZSET`);
        
        // Get all users from the SET
        const users = await redis.smembers(`users:${this.searchType}`);
        
        // Delete the SET key
        await redis.del(`users:${this.searchType}`);
        
        // Recreate as ZSET with current timestamp
        const now = Date.now();
        if (users.length > 0) {
          const pipeline = redis.pipeline();
          for (const userId of users) {
            pipeline.zadd(`users:${this.searchType}`, now, userId);
          }
          await pipeline.exec();
        }
        
        console.log(`[${this.searchType}] Converted ${users.length} users from SET to ZSET`);
      }

      // Check and convert interest keys
      const interestKeys = await redis.keys(`interest:${this.searchType}:*`);
      for (const key of interestKeys) {
        const keyType = await redis.type(key);
        if (keyType === 'set') {
          console.log(`[${this.searchType}] Converting interest key ${key} from SET to ZSET`);
          
          const members = await redis.smembers(key);
          await redis.del(key);
          
          if (members.length > 0) {
            const now = Date.now();
            const pipeline = redis.pipeline();
            for (const member of members) {
              pipeline.zadd(key, now, member);
            }
            await pipeline.exec();
          }
        }
      }
      
    } catch (error) {
      console.error(`[${this.searchType}] Error during cleanup:`, error);
    }
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

  async addUser(userId: string, username = "", interests: string[] = []) {
    const now = Date.now();
    const tsScore = now; // use ms score to be precise, but we compare with Date.now() as ms
    const userHashKey = `user:${this.searchType}:${userId}`;
    const usersZKey = `users:${this.searchType}`; // now a ZSET (score = timestamp)
    const userInterestsKey = `user_interests:${this.searchType}:${userId}`;

    // 1) If username provided, check for collisions and remove old user with same username
    if (username) {
      const existingUserIds = await redis.smembers(`users:${this.searchType}:index:username:${username}`);
      for (const existingUserId of existingUserIds) {
        if (existingUserId !== userId) {
          // remove old duplicate
          await this.removeUser(existingUserId);
          break;
        }
      }
    }

    const pipeline = redis.pipeline();

    // 2) Add to master users ZSET (score = timestamp). We'll use ZSET so we can remove old members by score later.
    pipeline.zadd(usersZKey, tsScore, userId);

    // 3) Maintain a small username->userId index (optional but helps finding collisions fast). Keep it as a SET and expire.
    if (username) {
      pipeline.sadd(`users:${this.searchType}:index:username:${username}`, userId);
      pipeline.expire(`users:${this.searchType}:index:username:${username}`, USER_TTL);
    }

    // 4) Create / update user hash and set TTL on the hash
    pipeline.hset(userHashKey, "username", username || "");
    pipeline.hset(userHashKey, "timestamp", String(now));
    pipeline.expire(userHashKey, USER_TTL);

    // 5) For each interest, add to interest ZSET (score = timestamp). This lets us prune stale members later.
    for (const interest of interests) {
      const interestZKey = `interest:${this.searchType}:${interest}`; // ZSET
      pipeline.zadd(interestZKey, tsScore, userId);
      pipeline.expire(interestZKey, USER_TTL + 30); // small cushion
    }

    // 6) Store user's interests as a ZSET (so it can expire) and set TTL
    pipeline.del(userInterestsKey);
    for (let i = 0; i < interests.length; i++) {
      pipeline.zadd(userInterestsKey, i, interests[i]);
    }
    pipeline.expire(userInterestsKey, USER_TTL);

    // 7) Exec pipeline
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

    // Remove user from main ZSET (not SET)
    pipeline.zrem(`users:${this.searchType}`, userId);
    pipeline.del(`user:${this.searchType}:${userId}`);

    // Remove user from all interest ZSETs (not SETs)
    for (const interest of interests) {
      pipeline.zrem(`interest:${this.searchType}:${interest}`, userId);
    }

    // Remove user's interest data
    pipeline.del(`user_interests:${this.searchType}:${userId}`);

    await pipeline.exec();
  }

  async updateUserHeartbeat(userId: string) {
    // Update the user's last heartbeat timestamp
    await redis.hset(`user:${this.searchType}:${userId}`, "lastHeartbeat", Date.now().toString());
  }

  async cleanupInactiveUsers(timeoutMs: number = 30000) { // 30 seconds timeout
    const currentTime = Date.now();
    const availableUserIds = await redis.zrange(`users:${this.searchType}`, 0, -1);
    const inactiveUsers: string[] = [];

    for (const userId of availableUserIds) {
      const lastHeartbeat = await redis.hget(`user:${this.searchType}:${userId}`, "lastHeartbeat");
      const timestamp = await redis.hget(`user:${this.searchType}:${userId}`, "timestamp");
      
      // Use lastHeartbeat if available, otherwise fall back to timestamp
      const lastActivity = lastHeartbeat ? parseInt(lastHeartbeat) : (timestamp ? parseInt(timestamp) : 0);
      
      if (currentTime - lastActivity > timeoutMs) {
        inactiveUsers.push(userId);
      }
    }

    // Remove inactive users
    for (const userId of inactiveUsers) {
      console.log(`[${this.searchType}] Removing inactive user: ${userId}`);
      await this.removeUser(userId);
    }

    return inactiveUsers.length;
  }

  async getAvailableUsers(): Promise<
    { userId: string; interests: string[]; username: string }[]
  > {
    const userIds = await redis.zrange(`users:${this.searchType}`, 0, -1);

    if (userIds.length === 0) return [];

    const pipeline = redis.pipeline();
    for (const userId of userIds) {
      pipeline.zrange(`user_interests:${this.searchType}:${userId}`, 0, -1);
      pipeline.hget(`user:${this.searchType}:${userId}`, "username");
    }

    const results = await pipeline.exec();
    if (!results) return [];

    return userIds.map((userId, index) => ({
      userId,
      interests: (results[index * 2][1] as string[]) || [],
      username: (results[index * 2 + 1][1] as string) || "",
    }));
  }

  async getUsersByInterest(interest: string): Promise<string[]> {
    return redis.zrange(`interest:${this.searchType}:${interest}`, 0, -1);
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
      // Users who have ALL specified interests - use ZSET intersection
      const tempKey = `temp:intersect:${Date.now()}:${Math.random()}`;
      await redis.zinterstore(tempKey, keys.length, ...keys);
      const result = await redis.zrange(tempKey, 0, -1);
      await redis.del(tempKey);
      return result;
    } else {
      // Users who have ANY of the specified interests - use ZSET union
      const tempKey = `temp:union:${Date.now()}:${Math.random()}`;
      await redis.zunionstore(tempKey, keys.length, ...keys);
      const result = await redis.zrange(tempKey, 0, -1);
      await redis.del(tempKey);
      return result;
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
      pipeline.zcard(key);
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
      const count = await redis.zcard(key);
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
    const now = Date.now();

    // Remove user from old interest ZSETs
    for (const interest of currentInterests) {
      pipeline.zrem(`interest:${this.searchType}:${interest}`, userId);
    }

    // Add user to new interest ZSETs
    for (const interest of newInterests) {
      pipeline.zadd(`interest:${this.searchType}:${interest}`, now, userId);
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
