import { prisma } from "../lib/prisma";
import { NotificationService } from "./notification.service";

export class FriendsService {
  private notificationService: NotificationService;

  constructor() {
    this.notificationService = new NotificationService();
  }

  /**
   * Get all friends for a user
   */
  async getFriendsList(username: string) {
    try {
      const friendships = await prisma.friendship.findMany({
        where: {
          OR: [
            { username: username, accepted: true },
            { user: { id: username }, accepted: true },
          ],
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
              isPro: true,
              interests: true,
            },
          },
          friend: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
              isPro: true,
              interests: true,
            },
          },
        },
      });

      // Map to return the friend's data (not the current user's data)
      const friends = friendships.map((friendship) => {
        const friend =
          friendship.username === username
            ? friendship.friend
            : friendship.user;
        return {
          id: friend.id,
          username: friend.username,
          avatarUrl: friend.avatarUrl,
          isPro: friend.isPro,
          interests: friend.interests,
          friendshipDate: friendship.createdAt,
        };
      });

      return friends;
    } catch (error) {
      throw new Error(`Failed to get friends list: ${error}`);
    }
  }

  /**
   * Send a friend request (create friendship)
   */
  async sendFriendRequest(username: string, friendId: string) {
    try {
      // Check if users exist
      const [user, friend] = await Promise.all([
        prisma.user.findUnique({ where: { username: username } }),
        prisma.user.findUnique({ where: { username: friendId } }),
      ]);

      if (!user) {
        throw new Error("User not found");
      }

      if (!friend) {
        throw new Error("Friend not found");
      }

      if (user.id === friend.id || user.username === friend.username) {
        throw new Error("Cannot send friend request to yourself");
      }

      // Check if friendship already exists
      const existingFriendship = await prisma.friendship.findFirst({
        where: {
          OR: [
            { username: username, friendId: friendId },
            { username: friend.username, friendId: user.id },
          ],
        },
      });

      if (existingFriendship) {
        if (existingFriendship.accepted) {
          throw new Error("Friendship already exists");
        } else {
          throw new Error("Friendship already Requested");
        }
      }

      // Create friendship
      const friendship = await prisma.friendship.create({
        data: {
          username: username,
          friendId: friendId,
        },
        include: {
          friend: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
              isPro: true,
              interests: true,
            },
          },
        },
      });

      // Send notification to the friend about the new friend request
      try {
        await this.notificationService.sendNotification(
          friend.username,
          NotificationService.NotificationTypes.FRIEND_REQUEST(user.username),
          { sendPush: true, saveToDb: true }
        );
      } catch (notificationError) {
        // Log error but don't fail the friend request
        console.error(
          "Failed to send friend request notification:",
          notificationError
        );
      }

      // Send notification to the requester that the request was sent
      try {
        await this.notificationService.sendNotification(
          username,
          NotificationService.NotificationTypes.FRIEND_ACCEPTED(
            friend.username
          ),
          { sendPush: true, saveToDb: true }
        );
      } catch (notificationError) {
        // Log error but don't fail the friend request
        console.error(
          "Failed to send friend accepted notification:",
          notificationError
        );
      }

      return {
        id: friendship.friend.id,
        username: friendship.friend.username,
        avatarUrl: friendship.friend.avatarUrl,
        isPro: friendship.friend.isPro,
        interests: friendship.friend.interests,
        friendshipDate: friendship.createdAt,
        friendshipId: friendship.id, // Add the friendship ID for notifications
      };
    } catch (error) {
      throw new Error(`Failed to send friend request: ${error}`);
    }
  }

  /**
   * Remove a friend
   */
  async removeFriend(username: string, friendId: string) {
    try {
      // Get user by username to get their ID
      const user = await prisma.user.findUnique({
        where: { username: username },
        select: { id: true, username: true },
      });

      if (!user) {
        throw new Error("User not found");
      }

      const friendship = await prisma.friendship.findFirst({
        where: {
          OR: [
            { username: username, friendId: friendId },
            {
              username: {
                in: [
                  await prisma.user
                    .findUnique({
                      where: { id: friendId },
                      select: { username: true },
                    })
                    .then((f) => f?.username || ""),
                ],
              },
              friendId: user.id,
            },
          ],
        },
      });

      if (!friendship) {
        throw new Error("Friendship not found");
      }

      // Get friend details for notification
      const friend = await prisma.user.findUnique({
        where: { id: friendId },
        select: { username: true },
      });

      await prisma.friendship.delete({
        where: { id: friendship.id },
      });

      // Send notification to the friend that they were removed
      if (friend) {
        try {
          await this.notificationService.sendNotification(
            friend.username,
            NotificationService.NotificationTypes.SYSTEM_ANNOUNCEMENT(
              "Friend Removed",
              `${user.username} removed you from their friends list`
            ),
            { sendPush: false, saveToDb: true } // Don't send push for this sensitive action
          );
        } catch (notificationError) {
          // Log error but don't fail the removal
          console.error(
            "Failed to send friend removal notification:",
            notificationError
          );
        }
      }

      return { message: "Friend removed successfully" };
    } catch (error) {
      throw new Error(`Failed to remove friend: ${error}`);
    }
  }

  /**
   * Check if two users are friends
   */
  async areFriends(username: string, friendId: string): Promise<boolean> {
    try {
      // Get user by username to get their ID
      const user = await prisma.user.findUnique({
        where: { username: username },
        select: { id: true },
      });

      if (!user) {
        return false;
      }

      const friendship = await prisma.friendship.findFirst({
        where: {
          OR: [
            { username: username, friendId: friendId },
            {
              username: {
                in: [
                  await prisma.user
                    .findUnique({
                      where: { id: friendId },
                      select: { username: true },
                    })
                    .then((f) => f?.username || ""),
                ],
              },
              friendId: user.id,
            },
          ],
        },
      });

      return !!friendship;
    } catch (error) {
      throw new Error(`Failed to check friendship status: ${error}`);
    }
  }

  /**
   * Get friend suggestions (users who are not friends yet)
   */
  async getFriendSuggestions(username: string, limit: number = 10) {
    try {
      // Get user by username to get their ID
      const user = await prisma.user.findUnique({
        where: { username: username },
        select: { id: true },
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Get current friend IDs
      const friendships = await prisma.friendship.findMany({
        where: {
          OR: [{ username: username }, { friendId: user.id }],
        },
        select: {
          username: true,
          friendId: true,
        },
      });

      const friendIds = friendships.map((f) =>
        f.username === username ? f.friendId : user.id
      );

      // Get users who are not friends and not the current user
      const suggestions = await prisma.user.findMany({
        where: {
          AND: [
            { id: { not: user.id } },
            { id: { notIn: friendIds } },
            { isBanned: false },
          ],
        },
        select: {
          id: true,
          username: true,
          avatarUrl: true,
          isPro: true,
          interests: true,
        },
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
      });

      return suggestions;
    } catch (error) {
      throw new Error(`Failed to get friend suggestions: ${error}`);
    }
  }

  /**
   * Get pending friend requests for a user
   */
  async getPendingRequests(username: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { username: username },
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Get pending requests where user is the recipient (friendId)
      const pendingRequests = await prisma.friendship.findMany({
        where: {
          friendId: user.id,
          accepted: false,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
              isPro: true,
              interests: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      // Map to return the requester's data
      const requests = pendingRequests.map((request) => ({
        id: request.id,
        requester: {
          id: request.user.id,
          username: request.user.username,
          avatarUrl: request.user.avatarUrl,
          isPro: request.user.isPro,
          interests: request.user.interests,
        },
        requestDate: request.createdAt,
      }));

      return requests;
    } catch (error) {
      throw new Error(`Failed to get pending requests: ${error}`);
    }
  }

  /**
   * Accept a pending friend request (if you want to add this functionality)
   */
  async acceptFriendRequest(friendshipId: string) {
    try {
      const friendship = await prisma.friendship.findUnique({
        where: { id: friendshipId },
        include: {
          user: {
            select: {
              username: true,
            },
          },
          friend: {
            select: {
              username: true,
            },
          },
        },
      });

      if (!friendship) {
        throw new Error("Friendship not found");
      }

      if (friendship.accepted) {
        throw new Error("Friendship already accepted");
      }

      // Send notification to the requester that their request was accepted
      try {
        await prisma.friendship.update({
          where: { id: friendship.id },
          data: { accepted: true },
        });
        await this.notificationService.sendNotification(
          friendship.user.username,
          NotificationService.NotificationTypes.FRIEND_ACCEPTED(
            friendship.friend.username
          ),
          { sendPush: true, saveToDb: true }
        );
      } catch (notificationError) {
        // Log error but don't fail the acceptance
        console.error(
          "Failed to send friend accepted notification:",
          notificationError
        );
      }

      return { message: "Friend request accepted successfully" };
    } catch (error) {
      throw new Error(`Failed to accept friend request: ${error}`);
    }
  }

  /**
   * Reject a pending friend request
   */
  async rejectFriendRequest(friendshipId: string) {
    try {
      const friendship = await prisma.friendship.findUnique({
        where: { id: friendshipId },
        include: {
          user: {
            select: {
              username: true,
            },
          },
          friend: {
            select: {
              username: true,
            },
          },
        },
      });

      if (!friendship) {
        throw new Error("Friendship not found");
      }

      if (friendship.accepted) {
        throw new Error("Cannot reject an already accepted friendship");
      }

      // Delete the friendship request
      await prisma.friendship.delete({
        where: { id: friendship.id },
      });

      return { message: "Friend request rejected successfully" };
    } catch (error) {
      throw new Error(`Failed to reject friend request: ${error}`);
    }
  }
}
