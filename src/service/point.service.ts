import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";

interface UserPoints {
  userId: string;
  points: number;
}

interface UserPointsResponse {
  userId: string;
  points: number;
}

export class PointService {
  constructor() {
    this.addPoints = this.addPoints.bind(this);
    this.getPoints = this.getPoints.bind(this);
    this.getAllUserPointsByDate = this.getAllUserPointsByDate.bind(this);
  }

  async addPoints(userId: string, points: number): Promise<void> {
    try {
      // Store in Redis with key pattern: points:{userId}:{timestamp}
      const timestamp = Date.now();
      const key = `points:${userId}:${timestamp}`;

      await redis.set(key, points);
      // Set expiry to 1 year
      await redis.expire(key, 365 * 24 * 60 * 60);

      // Also store in DB for persistence
      await prisma.userPoints.create({
        data: {
          userId,
          points,
        },
      });
    } catch (error) {
      throw new Error("Failed to add points");
    }
  }

  async getPoints(userId: string, startDate: Date, endDate: Date): Promise<number> {
    try {
      // Get all keys matching pattern points:{userId}:*
      const keys = await redis.keys(`points:${userId}:*`);
      let totalPoints = 0;

      // Filter and sum points within date range
      for (const key of keys) {
        const timestamp = parseInt(key.split(":")[2]);
        if (
          timestamp >= startDate.getTime() &&
          timestamp <= endDate.getTime()
        ) {
          const points = parseInt((await redis.get(key)) || "0");
          totalPoints += points;
        }
      }

      return totalPoints;
    } catch (error) {
      throw new Error("Failed to get points");
    }
  }

  async getAllUserPointsByDate(date: Date): Promise<UserPointsResponse[]> {
    try {
      // Get all keys matching pattern points:*:{date}
      const startOfDay = new Date(date.setHours(0, 0, 0, 0)).getTime();
      const endOfDay = new Date(date.setHours(23, 59, 59, 999)).getTime();

      const allKeys = await redis.keys("points:*");
      const pointsByUser = new Map<string, number>();

      for (const key of allKeys) {
        const [_, userId, timestamp] = key.split(":");
        const pointTimestamp = parseInt(timestamp);

        if (pointTimestamp >= startOfDay && pointTimestamp <= endOfDay) {
          const points = parseInt((await redis.get(key)) || "0");
          const currentPoints = pointsByUser.get(userId) || 0;
          pointsByUser.set(userId, currentPoints + points);
        }
      }

      return Array.from(pointsByUser.entries()).map(([userId, points]) => ({
        userId,
        points,
      }));
    } catch (error) {
      throw new Error("Failed to get all user points by date");
    }
  }
}
