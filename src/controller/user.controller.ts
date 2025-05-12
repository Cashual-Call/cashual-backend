import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { Prisma } from "@prisma/client";

type Gender = "MALE" | "FEMALE";

export const createUser = async (req: Request, res: Response) => {
  try {
    const { username, publicKey, gender, ipAddress, avatarUrl } = req.body;

    const userData = {
      username,
      gender: gender as Gender | null,
      ipAddress,
      avatarUrl,
      publicKey: publicKey || null,
    } as const;

    const user = await prisma.user.create({
      data: userData,
    });

    res.status(201).json(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        res
          .status(400)
          .json({ error: "Username or public key already exists" });
      } else {
        res.status(500).json({ error: "Failed to create user" });
      }
    } else {
      res.status(500).json({ error: "Failed to create user" });
    }
  }
};

// Get user by ID
export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
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

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
};

// Get all users
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        initiatedCalls: true,
        receivedCalls: true,
        sentTexts: true,
        receivedTexts: true,
      },
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

// Update user
export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, publicKey, gender, avatarUrl, isPro, proEnd } = req.body;

    const userData = {
      username,
      gender: gender as Gender | null,
      avatarUrl,
      isPro,
      proEnd: proEnd ? new Date(proEnd) : undefined,
      publicKey: publicKey || undefined,
    } as const;

    const user = await prisma.user.update({
      where: { id },
      data: userData,
    });

    res.json(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        res
          .status(400)
          .json({ error: "Username or public key already exists" });
      } else if (error.code === "P2025") {
        res.status(404).json({ error: "User not found" });
      } else {
        res.status(500).json({ error: "Failed to update user" });
      }
    } else {
      res.status(500).json({ error: "Failed to update user" });
    }
  }
};

// Delete user
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Delete all related records first
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

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Failed to delete user" });
  }
};

// Ban/Unban user
export const toggleBanUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isBanned } = req.body;

    const userData = {
      isBanned: Boolean(isBanned),
    } as const;

    const user = await prisma.user.update({
      where: { id },
      data: userData,
    });

    res.json(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        res.status(404).json({ error: "User not found" });
      } else {
        res.status(500).json({ error: "Failed to update user ban status" });
      }
    } else {
      res.status(500).json({ error: "Failed to update user ban status" });
    }
  }
};

export const getAvailableAvatars = async (req: Request, res: Response) => {
  const AVATAR_OPTIONS = [
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

  res.json(AVATAR_OPTIONS);
};

export const checkUsernameAvailability = async (req: Request, res: Response) => {
  try {
    const { username } = req.query;

    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Username is required' });
    }

    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    res.json({ available: !existingUser });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check username availability' });
  }
};
