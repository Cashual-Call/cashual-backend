import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";

interface UserPoints {
  userId: string;
  points: number;
}

interface RankingData {
  rank: number;
  username: string;
  score: number;
  avatar?: string;
}

interface PointActivity {
  id: string;
  userId: string;
  point: number;
  createdAt: Date;
}

interface DateRangeQuery {
  startDate: Date;
  endDate: Date;
}

interface UserPointsAnalytics {
  userId: string;
  totalPoints: number;
  activityCount: number;
  averagePointsPerActivity: number;
  firstActivity: Date | null;
  lastActivity: Date | null;
  dailyBreakdown: Array<{
    date: string;
    points: number;
    activityCount: number;
  }>;
}

interface LeaderboardEntry {
  userId: string;
  totalPoints: number;
  rank: number;
  activityCount: number;
}

export class PointService {
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly LEADERBOARD_CACHE_KEY = "leaderboard";
  private readonly USER_POINTS_CACHE_PREFIX = "user_points";

  constructor() {
    this.addPoints = this.addPoints.bind(this);
    this.getPoints = this.getPoints.bind(this);
    this.getUserPointsByDate = this.getUserPointsByDate.bind(this);
    this.getUserPointsWithActivities =
      this.getUserPointsWithActivities.bind(this);
    this.getAllUserPointsByDate = this.getAllUserPointsByDate.bind(this);
    this.getUserAnalytics = this.getUserAnalytics.bind(this);
    this.getLeaderboard = this.getLeaderboard.bind(this);
    this.bulkAddPoints = this.bulkAddPoints.bind(this);
    this.getPointsHistory = this.getPointsHistory.bind(this);
  }

  /**
   * Add points for a user and create activity record
   */
  async addPoints(
    userId: string,
    points: number,
    description?: string
  ): Promise<PointActivity> {
    try {
      // Create point activity record
      const activity = await prisma.pointActivity.create({
        data: {
          userId,
          point: points,
        },
      });

      // Invalidate user's cached points
      await this.invalidateUserCache(userId);

      // Invalidate leaderboard cache
      await redis.del(this.LEADERBOARD_CACHE_KEY);

      return activity;
    } catch (error) {
      console.error("Failed to add points:", error);
      throw new Error("Failed to add points");
    }
  }

  /**
   * Bulk add points for multiple users
   */
  async bulkAddPoints(
    userPoints: Array<{ userId: string; points: number; description?: string }>
  ): Promise<PointActivity[]> {
    try {
      const activities = await prisma.pointActivity.createMany({
        data: userPoints.map(({ userId, points, description }) => ({
          userId,
          point: points,
          description,
        })),
      });

      // Invalidate caches for all affected users
      const userIds = [...new Set(userPoints.map((up) => up.userId))];
      await Promise.all([
        ...userIds.map((userId) => this.invalidateUserCache(userId)),
        redis.del(this.LEADERBOARD_CACHE_KEY),
      ]);

      // Return created activities
      return await prisma.pointActivity.findMany({
        orderBy: { createdAt: "desc" },
        take: userPoints.length,
      });
    } catch (error) {
      console.error("Failed to bulk add points:", error);
      throw new Error("Failed to bulk add points");
    }
  }

  /**
   * Get total points for a user within a date range
   */
  async getPoints(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    try {
      const cacheKey = `${
        this.USER_POINTS_CACHE_PREFIX
      }:${userId}:${startDate.getTime()}:${endDate.getTime()}`;

      // Try to get from cache first
      const cached = await redis.get(cacheKey);
      if (cached) {
        return parseInt(cached);
      }

      const result = await prisma.pointActivity.aggregate({
        where: {
          userId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        _sum: {
          point: true,
        },
      });

      const totalPoints = result._sum.point || 0;

      // Cache the result
      await redis.setex(cacheKey, this.CACHE_TTL, totalPoints.toString());

      return totalPoints;
    } catch (error) {
      console.error("Failed to get points:", error);
      throw new Error("Failed to get points");
    }
  }

  /**
   * Get user's points grouped by date
   */
  async getUserPointsByDate(
    userId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{ date: Date; point: number }[]> {
    try {
      const cacheKey = `user_points_by_date:${userId}:${
        startDate?.getTime() || "all"
      }:${endDate?.getTime() || "all"}`;

      // Try to get from cache first
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached).map((item: any) => ({
          ...item,
          date: new Date(item.date),
        }));
      }

      const whereClause: any = { userId };

      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) whereClause.createdAt.gte = startDate;
        if (endDate) whereClause.createdAt.lte = endDate;
      }

      // Get all point activities for the user
      const activities = await prisma.pointActivity.findMany({
        where: whereClause,
        select: {
          point: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      // Group by date and sum points
      const pointsByDate = new Map<string, number>();

      activities.forEach((activity) => {
        // Get date string in YYYY-MM-DD format
        const dateKey = activity.createdAt.toISOString().split("T")[0];
        const existingPoints = pointsByDate.get(dateKey) || 0;
        pointsByDate.set(dateKey, existingPoints + activity.point);
      });

      // Convert to array and sort by date
      const result = Array.from(pointsByDate.entries())
        .map(([dateString, point]) => ({
          date: new Date(dateString),
          point,
        }))
        .sort((a, b) => b.date.getTime() - a.date.getTime()); // Most recent first

      // Cache the result
      await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));

      return result;
    } catch (error) {
      console.error("Failed to get user points by date:", error);
      throw new Error("Failed to get user points by date");
    }
  }

  /**
   * Get user points with detailed activity breakdown
   */
  async getUserPointsWithActivities(
    userId: string,
    dateRange?: DateRangeQuery,
    limit: number = 50,
    offset: number = 0
  ): Promise<{
    totalPoints: number;
    activities: PointActivity[];
    hasMore: boolean;
  }> {
    try {
      const whereClause: any = { userId };

      if (dateRange) {
        whereClause.createdAt = {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        };
      }

      const [totalResult, activities, totalCount] = await Promise.all([
        prisma.pointActivity.aggregate({
          where: whereClause,
          _sum: { point: true },
        }),
        prisma.pointActivity.findMany({
          where: whereClause,
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.pointActivity.count({ where: whereClause }),
      ]);

      return {
        totalPoints: totalResult._sum.point || 0,
        activities,
        hasMore: offset + limit < totalCount,
      };
    } catch (error) {
      console.error("Failed to get user points with activities:", error);
      throw new Error("Failed to get user points with activities");
    }
  }

  /**
   * Get all users' points for a specific date
   */
  async getAllUserPointsByDate(date: Date, mock: boolean = true): Promise<RankingData[]> {
    if (mock) {
      return [
        {
          username: "alice_crypto",
          score: 1250,
          rank: 1,
          avatar: "https://via.placeholder.com/150",
        },
        {
          username: "bob_trader",
          score: 980,
          rank: 2,
          avatar: "https://via.placeholder.com/150",
        },
        {
          username: "charlie_dev",
          score: 760,
          rank: 3,
          avatar: "https://via.placeholder.com/150",
        },
        {
          username: "diana_nft",
          score: 540,
          rank: 4,
          avatar: "https://via.placeholder.com/150",
        },
        {
          username: "evan_defi",
          score: 420,
          rank: 5,
          avatar: "https://via.placeholder.com/150",
        },
        {
          username: "fiona_web3",
          score: 380,
          rank: 6,
          avatar: "https://via.placeholder.com/150",
        },
        {
          username: "george_dao",
          score: 320,
          rank: 7,
          avatar: "https://via.placeholder.com/150",
        },
        {
          username: "helen_metaverse",
          score: 280,
          rank: 8,
          avatar: "https://via.placeholder.com/150",
        },
        {
          username: "ivan_gamefi",
          score: 240,
          rank: 9,
          avatar: "https://via.placeholder.com/150",
        },
        {
          username: "jane_blockchain",
          score: 200,
          rank: 10,
          avatar: "https://via.placeholder.com/150",
        },
      ];
    }
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const results = await prisma.pointActivity.groupBy({
        by: ["userId"],
        where: {
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        _sum: {
          point: true,
        },
        _count: {
          id: true,
        },
      });

      // Get user avatars separately
      const userIds = results.map(r => r.userId);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, avatarUrl: true },
      });

      const userMap = new Map(users.map(u => [u.id, u.avatarUrl]));

      return results.map((result) => ({
        username: result.userId,
        score: result._sum.point || 0,
        rank: result._count.id,
        avatar: userMap.get(result.userId) || undefined,
      }));
    } catch (error) {
      console.error("Failed to get all user points by date:", error);
      throw new Error("Failed to get all user points by date");
    }
  }

  /**
   * Get comprehensive analytics for a user
   */
  async getUserAnalytics(
    userId: string,
    dateRange?: DateRangeQuery
  ): Promise<UserPointsAnalytics> {
    try {
      const whereClause: any = { userId };

      if (dateRange) {
        whereClause.createdAt = {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        };
      }

      const [aggregateResult, activities] = await Promise.all([
        prisma.pointActivity.aggregate({
          where: whereClause,
          _sum: { point: true },
          _count: { id: true },
          _min: { createdAt: true },
          _max: { createdAt: true },
        }),
        prisma.pointActivity.findMany({
          where: whereClause,
          select: {
            point: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        }),
      ]);

      // Calculate daily breakdown
      const dailyBreakdown = this.calculateDailyBreakdown(activities);

      return {
        userId,
        totalPoints: aggregateResult._sum.point || 0,
        activityCount: aggregateResult._count.id || 0,
        averagePointsPerActivity:
          aggregateResult._count.id > 0
            ? (aggregateResult._sum.point || 0) / aggregateResult._count.id
            : 0,
        firstActivity: aggregateResult._min.createdAt,
        lastActivity: aggregateResult._max.createdAt,
        dailyBreakdown,
      };
    } catch (error) {
      console.error("Failed to get user analytics:", error);
      throw new Error("Failed to get user analytics");
    }
  }

  /**
   * Get leaderboard with rankings
   */
  async getLeaderboard(
    limit: number = 10,
    dateRange?: DateRangeQuery,
    forceRefresh: boolean = false
  ): Promise<LeaderboardEntry[]> {
    try {
      const cacheKey = dateRange
        ? `${
            this.LEADERBOARD_CACHE_KEY
          }:${dateRange.startDate.getTime()}:${dateRange.endDate.getTime()}`
        : this.LEADERBOARD_CACHE_KEY;

      if (!forceRefresh) {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      const whereClause: any = {};

      if (dateRange) {
        whereClause.createdAt = {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        };
      }

      const results = await prisma.pointActivity.groupBy({
        by: ["userId"],
        where: whereClause,
        _sum: { point: true },
        _count: { id: true },
        orderBy: {
          _sum: {
            point: "desc",
          },
        },
        take: limit,
      });

      const leaderboard: LeaderboardEntry[] = results.map((result, index) => ({
        userId: result.userId,
        totalPoints: result._sum.point || 0,
        rank: index + 1,
        activityCount: result._count.id || 0,
      }));

      // Cache the result
      await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(leaderboard));

      return leaderboard;
    } catch (error) {
      console.error("Failed to get leaderboard:", error);
      throw new Error("Failed to get leaderboard");
    }
  }

  /**
   * Get points history with trends
   */
  async getPointsHistory(
    userId: string,
    period: "daily" | "weekly" | "monthly" = "daily",
    limit: number = 30
  ): Promise<
    Array<{
      period: string;
      points: number;
      activityCount: number;
      date: Date;
    }>
  > {
    try {
      const activities = await prisma.pointActivity.findMany({
        where: { userId },
        select: {
          point: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit * 50, // Get more data to group by period
      });

      return this.groupByPeriod(activities, period, limit);
    } catch (error) {
      console.error("Failed to get points history:", error);
      throw new Error("Failed to get points history");
    }
  }

  /**
   * Remove points (negative points)
   */
  async removePoints(
    userId: string,
    points: number,
    reason?: string
  ): Promise<PointActivity> {
    return this.addPoints(userId, -Math.abs(points), reason);
  }

  /**
   * Get user's current total points (all time)
   */
  async getUserTotalPoints(userId: string): Promise<number> {
    try {
      const cacheKey = `${this.USER_POINTS_CACHE_PREFIX}:${userId}:total`;

      const cached = await redis.get(cacheKey);
      if (cached) {
        return parseInt(cached);
      }

      const result = await prisma.pointActivity.aggregate({
        where: { userId },
        _sum: { point: true },
      });

      const totalPoints = result._sum.point || 0;
      await redis.setex(cacheKey, this.CACHE_TTL, totalPoints.toString());

      return totalPoints;
    } catch (error) {
      console.error("Failed to get user total points:", error);
      throw new Error("Failed to get user total points");
    }
  }

  // Private helper methods

  private async invalidateUserCache(userId: string): Promise<void> {
    const pattern = `${this.USER_POINTS_CACHE_PREFIX}:${userId}:*`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  private calculateDailyBreakdown(
    activities: Array<{ point: number; createdAt: Date }>
  ): Array<{
    date: string;
    points: number;
    activityCount: number;
  }> {
    const dailyMap = new Map<
      string,
      { points: number; activityCount: number }
    >();

    activities.forEach((activity) => {
      const dateKey = activity.createdAt.toISOString().split("T")[0];
      const existing = dailyMap.get(dateKey) || { points: 0, activityCount: 0 };

      dailyMap.set(dateKey, {
        points: existing.points + activity.point,
        activityCount: existing.activityCount + 1,
      });
    });

    return Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date,
        points: data.points,
        activityCount: data.activityCount,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private groupByPeriod(
    activities: Array<{ point: number; createdAt: Date }>,
    period: "daily" | "weekly" | "monthly",
    limit: number
  ): Array<{
    period: string;
    points: number;
    activityCount: number;
    date: Date;
  }> {
    const periodMap = new Map<
      string,
      { points: number; activityCount: number; date: Date }
    >();

    activities.forEach((activity) => {
      let periodKey: string;
      let periodDate: Date;

      switch (period) {
        case "daily":
          periodKey = activity.createdAt.toISOString().split("T")[0];
          periodDate = new Date(activity.createdAt.toDateString());
          break;
        case "weekly":
          const weekStart = new Date(activity.createdAt);
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          periodKey = weekStart.toISOString().split("T")[0];
          periodDate = weekStart;
          break;
        case "monthly":
          periodKey = `${activity.createdAt.getFullYear()}-${String(
            activity.createdAt.getMonth() + 1
          ).padStart(2, "0")}`;
          periodDate = new Date(
            activity.createdAt.getFullYear(),
            activity.createdAt.getMonth(),
            1
          );
          break;
        default:
          throw new Error(`Invalid period: ${period}`);
      }

      const existing = periodMap.get(periodKey) || {
        points: 0,
        activityCount: 0,
        date: periodDate,
      };

      periodMap.set(periodKey, {
        points: existing.points + activity.point,
        activityCount: existing.activityCount + 1,
        date: periodDate,
      });
    });

    return Array.from(periodMap.entries())
      .map(([periodKey, data]) => ({
        period: periodKey,
        points: data.points,
        activityCount: data.activityCount,
        date: data.date,
      }))
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, limit);
  }
}
