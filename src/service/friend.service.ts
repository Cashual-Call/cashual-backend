import { prisma } from "../lib/prisma";
import { NotificationPriority, NotificationType, User } from "@prisma/client";
import { NotificationService } from "./notification.service";

export class FriendsService {
  /* ----------------------------- helpers ----------------------------- */

  private async resolveUser(input: string) {
    return prisma.user.findFirst({
      where: {
        OR: [{ username: input }, { displayUsername: input }, { name: input }],
      },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        isPro: true,
        interests: true,
      },
    });
  }

  /* -------------------------- get friends list ------------------------ */

  async getFriendsList(username: string) {
    const user = await this.resolveUser(username);
    if (!user) throw new Error("User not found");

    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ userId: user.id }, { friendId: user.id }],
      },
      include: {
        user: true,
        friend: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return friendships.map((f) => {
      const isRequester = f.userId === user.id;
      const other = isRequester ? f.friend : f.user;

      let status: "accepted" | "pending_sent" | "pending_received";
      if (f.accepted) status = "accepted";
      else status = isRequester ? "pending_sent" : "pending_received";

      return {
        id: other.id,
        username: other.username,
        avatarUrl: other.avatarUrl,
        isPro: other.isPro,
        interests: other.interests,
        friendshipId: f.id,
        friendshipDate: f.createdAt,
        status,
      };
    });
  }

  /* ------------------------- send friend request ---------------------- */

  /**
   * Send a friend request by user IDs
   * @param userId The user ID of the sender
   * @param friendId The user ID of the friend (recipient)
   */
  async sendFriendRequest(userId: string, friendId: string) {
    if (!userId || !friendId) {
      throw new Error("UserId and friendId are required");
    }
    if (userId === friendId) {
      throw new Error("Cannot send friend request to yourself");
    }

    // Fetch user and friend by IDs
    const [user, friend] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.user.findUnique({ where: { id: friendId } }),
    ]);

    if (!user) throw new Error("User not found");
    if (!friend) throw new Error("Friend not found");

    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId: user.id, friendId: friend.id },
          { userId: friend.id, friendId: user.id },
        ],
      },
    });

    if (existing) {
      if (existing.accepted) {
        throw new Error("Friendship already exists");
      }

      // Incoming request → accept
      if (existing.userId === friend.id) {
        const accepted = await prisma.friendship.update({
          where: { id: existing.id },
          data: { accepted: true },
          include: { user: true },
        });

        await NotificationService.createNotification(
          friend.id,
          "Friend request accepted",
          `You are now friends with ${user.username}`,
          NotificationType.FRIEND_ACCEPTED,
          NotificationPriority.NORMAL
        );
        await NotificationService.createNotification(
          user.id,
          "Friend request accepted",
          `You are now friends with ${friend.username}`,
          NotificationType.FRIEND_ACCEPTED,
          NotificationPriority.NORMAL
        );

        return {
          id: accepted.user.id,
          username: accepted.user.username,
          avatarUrl: accepted.user.avatarUrl,
          isPro: accepted.user.isPro,
          interests: accepted.user.interests,
          friendshipId: accepted.id,
          friendshipDate: accepted.createdAt,
        };
      }

      throw new Error("Friend request already sent");
    }

    const friendship = await prisma.friendship.create({
      data: {
        userId: user.id,
        friendId: friend.id,
      },
      include: { friend: true },
    });

    await NotificationService.createNotification(
      friend.id,
      "Friend request received",
      `You have a new friend request from ${user.username || user.id || "Unknown"}`,
      NotificationType.FRIEND_REQUEST,
      NotificationPriority.NORMAL
    );

    return {
      id: friendship.friend.id,
      username: friendship.friend.username,
      avatarUrl: friendship.friend.avatarUrl,
      isPro: friendship.friend.isPro,
      interests: friendship.friend.interests,
      friendshipId: friendship.id,
      friendshipDate: friendship.createdAt,
    };
  }

  /* --------------------------- remove friend -------------------------- */

  async removeFriend(username: string, friendUsername: string) {
    const [user, friend] = await Promise.all([
      this.resolveUser(username),
      this.resolveUser(friendUsername),
    ]);

    if (!user || !friend) throw new Error("User not found");

    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId: user.id, friendId: friend.id },
          { userId: friend.id, friendId: user.id },
        ],
      },
    });

    if (!friendship) throw new Error("Friendship not found");

    await prisma.friendship.delete({ where: { id: friendship.id } });

    return { message: "Friend removed successfully" };
  }

  /* ---------------------------- are friends --------------------------- */

  async areFriends(
    username: string,
    friendUsername: string,
    includeUsers = false
  ): Promise<{
    areFriends: boolean;
    status: "accepted" | "pending_sent" | "pending_received" | "none";
    user?: User;
    friend?: User;
  }> {
    // Resolve both users
    const [user, friend] = await Promise.all([
      prisma.user.findFirst({
        where: {
          OR: [{ username }, { displayUsername: username }, { name: username }],
        },
      }),
      prisma.user.findFirst({
        where: {
          OR: [
            { username: friendUsername },
            { displayUsername: friendUsername },
            { name: friendUsername },
          ],
        },
      }),
    ]);

    if (!user || !friend) {
      return { areFriends: false, status: "none" };
    }

    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId: user.id, friendId: friend.id },
          { userId: friend.id, friendId: user.id },
        ],
      },
      include: includeUsers
        ? {
            user: true,
            friend: true,
          }
        : undefined,
    });

    if (!friendship) {
      return { areFriends: false, status: "none" };
    }

    const status = friendship.accepted
      ? "accepted"
      : friendship.userId === user.id
        ? "pending_sent"
        : "pending_received";

    // TODO: add user and friend
    return {
      areFriends: true,
      status,
      user: undefined,
      friend: undefined,
    };
  }

  /* ----------------------- friend suggestions ------------------------- */

  async getFriendSuggestions(username: string, limit = 10) {
    const user = await this.resolveUser(username);
    if (!user) throw new Error("User not found");

    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ userId: user.id }, { friendId: user.id }],
      },
      select: {
        userId: true,
        friendId: true,
      },
    });

    const blockedIds = new Set(
      friendships.flatMap((f) => [f.userId, f.friendId])
    );
    blockedIds.add(user.id);

    return prisma.user.findMany({
      where: {
        id: { notIn: Array.from(blockedIds) },
        isBanned: false,
      },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        isPro: true,
        interests: true,
      },
      take: limit,
      orderBy: { createdAt: "desc" },
    });
  }

  /* ------------------------ pending requests -------------------------- */

  async getPendingRequests(username: string) {
    const user = await this.resolveUser(username);
    if (!user) throw new Error("User not found");

    const requests = await prisma.friendship.findMany({
      where: {
        friendId: user.id,
        accepted: false,
      },
      include: { user: true },
      orderBy: { createdAt: "desc" },
    });

    return requests.map((r) => ({
      id: r.id,
      requester: {
        id: r.user.id,
        username: r.user.username,
        avatarUrl: r.user.avatarUrl,
        isPro: r.user.isPro,
        interests: r.user.interests,
      },
      requestDate: r.createdAt,
    }));
  }

  /* -------------------- accept / reject request ----------------------- */

  async acceptFriendRequest(friendshipId: string) {
    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) throw new Error("Friendship not found");
    if (friendship.accepted) throw new Error("Already accepted");

    await prisma.friendship.update({
      where: { id: friendshipId },
      data: { accepted: true },
    });

    return { message: "Friend request accepted successfully" };
  }

  async rejectFriendRequest(friendshipId: string) {
    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) throw new Error("Friendship not found");
    if (friendship.accepted) {
      throw new Error("Cannot reject an accepted friendship");
    }

    await prisma.friendship.delete({ where: { id: friendshipId } });

    return { message: "Friend request rejected successfully" };
  }
}
