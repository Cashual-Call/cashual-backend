import { AvailableUserService } from "./available-user.service";
import { redis } from "../lib/redis";
import { generateToken } from "../middleware/socket.middleware";
import { v4 as uuidv4 } from "uuid";

interface MatchPayload {
  userId: string;
  token: string;
}

export class MatchService {
  private searchType: string;
  private availableUserService: AvailableUserService;

  constructor(searchType: string) {
    this.searchType = searchType;
    this.availableUserService = new AvailableUserService(searchType);
  }

  async addUser(userId: string, interests: string[]) {
    await this.availableUserService.addUser(userId, interests);
  }

  async removeUser(userId: string) {
    await this.availableUserService.removeUser(userId);
  }

  async getMatchedJWT(userId: string) {
    const resp = await redis.hget(`match:${this.searchType}:${userId}`, userId);

    if (resp) {
      await redis.del(`match:${this.searchType}:${userId}`);
      return JSON.parse(resp) as MatchPayload;
    } else {
      return null;
    }
  }

  async setMatch(user1: string, user2: string) {
    const roomId = uuidv4();
    const token1 = generateToken({
      senderId: user1,
      receiverId: user2,
      roomId,
    });

    const token2 = generateToken({
      senderId: user2,
      receiverId: user1,
      roomId,
    });

    const pipeline = redis.pipeline();
    
    pipeline.hset(`match:${this.searchType}:${user1}`, {
      userId: user2,
      token: token1,
    });

    pipeline.hset(`match:${this.searchType}:${user2}`, {
      userId: user1,
      token: token2,
    });

    await pipeline.exec();
  }
}
