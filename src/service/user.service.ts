import { Prisma, User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { PointService } from "./point.service";

type Gender = "MALE" | "FEMALE";

export class UserService {
  private pointService: PointService;
  constructor() {
    this.pointService = new PointService();

    this.createUser = this.createUser.bind(this);
    this.getUserById = this.getUserById.bind(this);
    this.getAllUsers = this.getAllUsers.bind(this);
    this.updateUser = this.updateUser.bind(this);
    this.deleteUser = this.deleteUser.bind(this);
    this.toggleBanUser = this.toggleBanUser.bind(this);
    this.checkUsernameAvailability = this.checkUsernameAvailability.bind(this);
    this.getAvailableAvatars = this.getAvailableAvatars.bind(this);
  }

  async createUser(userData: {
    username: string;
    publicKey?: string;
    gender?: Gender;
    ipAddress?: string;
    avatarUrl?: string;
    walletAddress: string;
  }): Promise<User> {
    try {
      return await prisma.user.create({
        data: {
          ...userData,
          publicKey: userData.publicKey || "",
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          throw new Error("Username or public key already exists");
        }
      }
      throw new Error("Failed to create user");
    }
  }

  async getUserById(id: string): Promise<User | null> {
    try {
      return await prisma.user.findUnique({
        where: { id },
        include: {
          initiatedCalls: true,
          receivedCalls: true,
          sentTexts: true,
          receivedTexts: true,
          userFriendships: {
            include: {
              friend: true,
            },
          },
          friendFriendships: {
            include: {
              user: true,
            },
          },
        },
      });
    } catch (error) {
      throw new Error("Failed to fetch user");
    }
  }

  async getAllUsers(): Promise<User[]> {
    try {
      return await prisma.user.findMany({
        include: {
          initiatedCalls: true,
          receivedCalls: true,
          sentTexts: true,
          receivedTexts: true,
        },
      });
    } catch (error) {
      throw new Error("Failed to fetch users");
    }
  }

  async updateUser(
    id: string,
    userData: {
      username?: string;
      publicKey?: string;
      gender?: Gender;
      avatarUrl?: string;
      isPro?: boolean;
      proEnd?: Date;
    }
  ): Promise<User> {
    try {
      return await prisma.user.update({
        where: { id },
        data: userData,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          throw new Error("Username or public key already exists");
        } else if (error.code === "P2025") {
          throw new Error("User not found");
        }
      }
      throw new Error("Failed to update user");
    }
  }

  async deleteUser(id: string): Promise<void> {
    try {
      await prisma.$transaction([
        prisma.call.deleteMany({
          where: {
            OR: [{ initiatorId: id }, { receiverId: id }],
          },
        }),
        prisma.text.deleteMany({
          where: {
            OR: [{ senderId: id }, { receiverId: id }],
          },
        }),
        prisma.friendship.deleteMany({
          where: {
            OR: [{ userId: id }, { friendId: id }],
          },
        }),
        prisma.report.deleteMany({
          where: {
            OR: [{ reporterId: id }, { reportedUserId: id }],
          },
        }),
        prisma.leaderboardEntry.deleteMany({
          where: { userId: id },
        }),
        prisma.subscription.deleteMany({
          where: { userId: id },
        }),
        prisma.user.delete({
          where: { id },
        }),
      ]);
    } catch (error) {
      throw new Error("Failed to delete user");
    }
  }

  async toggleBanUser(id: string, isBanned: boolean): Promise<User> {
    try {
      return await prisma.user.update({
        where: { id },
        data: { isBanned },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") {
          throw new Error("User not found");
        }
      }
      throw new Error("Failed to update user ban status");
    }
  }

  async checkUsernameAvailability(username: string): Promise<boolean> {
    try {
      const existingUser = await prisma.user.findUnique({
        where: { username },
      });
      return !existingUser;
    } catch (error) {
      throw new Error("Failed to check username availability");
    }
  }

  getAvailableAvatars() {
    return [
      {
        id: "avatar1",
        src: "https://avatars.githubusercontent.com/u/124599?v=4",
        fallback: "A1",
      },
      {
        id: "avatar2",
        src: "https://avatars.githubusercontent.com/u/124599?v=4",
        fallback: "A2",
      },
      {
        id: "avatar3",
        src: "https://avatars.githubusercontent.com/u/124599?v=4",
        fallback: "A3",
      },
    ];
  }

  async getPoints(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    try {
      const result = await prisma.userPoints.aggregate({
        where: {
          userId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        _sum: {
          points: true,
        },
      });
      return result._sum.points || 0;
    } catch (error) {
      throw new Error("Failed to get points");
    }
  }

  async getUserPointsByDate(
    userId: string
  ): Promise<{ date: Date; point: number }[]> {
    try {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const results = await prisma.userPoints.groupBy({
        by: ["createdAt"],
        where: {
          userId,
          createdAt: {
            gte: oneYearAgo,
            lte: new Date(),
          },
        },
        _sum: {
          points: true,
        },
      });

      return results.map((result) => ({
        date: result.createdAt,
        point: result._sum.points || 0,
      }));
    } catch (error) {
      throw new Error("Failed to get user points by date");
    }
  }

  async getRankings() {
    const today = new Date();
    try {
      return await this.pointService.getAllUserPointsByDate(today);
    } catch (error) {
      throw new Error("Failed to get rankings");
    }
  }
}
