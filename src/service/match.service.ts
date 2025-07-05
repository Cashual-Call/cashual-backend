import { AvailableUserService } from "./available-user.service";
import { redis } from "../lib/redis";
import { generateToken } from "../middleware/socket.middleware";
import ChatRoomService from "./chat-room.service";

interface MatchPayload {
  userId: string;
  roomId: string;
  token: string;
}

export class MatchService {
  private searchType: string;
  private availableUserService: AvailableUserService;
  private chatRoomService: ChatRoomService;

  constructor(searchType: string) {
    this.searchType = searchType;
    this.availableUserService = new AvailableUserService(searchType);
    this.chatRoomService = new ChatRoomService();
  }

  async addUser(userId: string, interests: string[]) {
    const user = await this.availableUserService.addUser(userId, interests);
    return user;
  }

  async removeUser(userId: string) {
    await this.availableUserService.removeUser(userId);
  }

  async getMatchedJWT(userId: string) {
    const resp = await this.chatRoomService.getRoomByUserId(userId);

    if (resp) {
      // await redis.del(`match:${this.searchType}:${userId}`);
      return { ...resp } as MatchPayload;
    } else {
      return null;
    }
  }
  
  async setMatch(user1: string, user2: string) {
    const room = await this.chatRoomService.createRoom(user1, user2);
    const roomId = room.id;
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
  
    await this.availableUserService.removeUser(user1);
    await this.availableUserService.removeUser(user2);

  
    const pipeline = redis.pipeline();
  
    // Store the match data as JSON string under 'data' field
    pipeline.hset(`match:${this.searchType}:${user1}`, 'data', JSON.stringify({
      userId: user2,
      token: token1,
      roomId,
    }));
  
    pipeline.hset(`match:${this.searchType}:${user2}`, 'data', JSON.stringify({
      userId: user1,
      token: token2,
      roomId,
    }));
  
    await pipeline.exec();
  }

  async bestMatch() {
    const availableUsers = await this.availableUserService.getAvailableUsers();
    console.log(`${this.searchType} availableUsers`, availableUsers);

    if (availableUsers.length < 2) {
      return;
    }

    // Create a matrix of common interests between all users
    const commonInterestsMatrix: {
      [key: string]: { [key: string]: string[] };
    } = {};

    // Calculate common interests between all pairs of users
    for (let i = 0; i < availableUsers.length; i++) {
      for (let j = i + 1; j < availableUsers.length; j++) {
        const user1 = availableUsers[i];
        const user2 = availableUsers[j];

        const commonInterests =
          await this.availableUserService.getCommonInterests(
            user1.userId,
            user2.userId
          );

        if (!commonInterestsMatrix[user1.userId]) {
          commonInterestsMatrix[user1.userId] = {};
        }
        if (!commonInterestsMatrix[user2.userId]) {
          commonInterestsMatrix[user2.userId] = {};
        }

        commonInterestsMatrix[user1.userId][user2.userId] = commonInterests;
        commonInterestsMatrix[user2.userId][user1.userId] = commonInterests;
      }
    }

    // Keep track of matched users to avoid matching them again
    const matchedUsers = new Set<string>();

    // Continue matching until we have 0 or 1 users left
    while (
      availableUsers.filter((user) => !matchedUsers.has(user.userId)).length >=
      2
    ) {
      const unmatchedUsers = availableUsers.filter(
        (user) => !matchedUsers.has(user.userId)
      );

      // Find the best match among unmatched users
      let bestMatch: { user1: string; user2: string; score: number } | null =
        null;

      for (let i = 0; i < unmatchedUsers.length; i++) {
        for (let j = i + 1; j < unmatchedUsers.length; j++) {
          const user1 = unmatchedUsers[i];
          const user2 = unmatchedUsers[j];

          const commonInterests =
            commonInterestsMatrix[user1.userId][user2.userId];
          const score = commonInterests.length;

          if (!bestMatch || score > bestMatch.score) {
            bestMatch = {
              user1: user1.userId,
              user2: user2.userId,
              score,
            };
          }
        }
      }

      // If we found a match with common interests, use it
      if (bestMatch && bestMatch.score > 0) {
        await this.setMatch(bestMatch.user1, bestMatch.user2);
        console.log(
          `Matched users ${bestMatch.user1} and ${bestMatch.user2} with ${bestMatch.score} common interests`
        );

        // Mark these users as matched
        matchedUsers.add(bestMatch.user1);
        matchedUsers.add(bestMatch.user2);
      } else {
        // No good matches found, match randomly
        const randomUser1 =
          unmatchedUsers[Math.floor(Math.random() * unmatchedUsers.length)];
        const remainingUsers = unmatchedUsers.filter(
          (user) => user.userId !== randomUser1.userId
        );
        const randomUser2 =
          remainingUsers[Math.floor(Math.random() * remainingUsers.length)];

        console.log(randomUser1, randomUser2);

        await this.setMatch(randomUser1.userId, randomUser2.userId);
        console.log(
          `Randomly matched users ${randomUser1.userId} and ${randomUser2.userId} (no common interests found)`
        );

        // Mark these users as matched
        matchedUsers.add(randomUser1.userId);
        matchedUsers.add(randomUser2.userId);
      }
    }

    const remainingUsers = availableUsers.filter(
      (user) => !matchedUsers.has(user.userId)
    );
    console.log(
      `Matching complete. ${remainingUsers.length} user(s) remaining in queue.`
    );
  }
}
