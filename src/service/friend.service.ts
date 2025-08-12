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
  async getFriendsList(userId: string) {
    try {
      const friendships = await prisma.friendship.findMany({
        where: {
          OR: [
            { userId: userId },
            { friendId: userId }
          ]
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
              isPro: true,
              interests: true
            }
          },
          friend: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
              isPro: true,
              interests: true
            }
          }
        }
      });

      // Map to return the friend's data (not the current user's data)
      const friends = friendships.map(friendship => {
        const friend = friendship.userId === userId ? friendship.friend : friendship.user;
        return {
          id: friend.id,
          username: friend.username,
          avatarUrl: friend.avatarUrl,
          isPro: friend.isPro,
          interests: friend.interests,
          friendshipDate: friendship.createdAt
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
  async sendFriendRequest(userId: string, friendId: string) {
    try {
      // Check if users exist
      const [user, friend] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId } }),
        prisma.user.findUnique({ where: { id: friendId } })
      ]);

      if (!user) {
        throw new Error('User not found');
      }

      if (!friend) {
        throw new Error('Friend not found');
      }

      if (userId === friendId) {
        throw new Error('Cannot send friend request to yourself');
      }

      // Check if friendship already exists
      const existingFriendship = await prisma.friendship.findFirst({
        where: {
          OR: [
            { userId: userId, friendId: friendId },
            { userId: friendId, friendId: userId }
          ]
        }
      });

      if (existingFriendship) {
        throw new Error('Friendship already exists');
      }

      // Create friendship
      const friendship = await prisma.friendship.create({
        data: {
          userId: userId,
          friendId: friendId
        },
        include: {
          friend: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
              isPro: true,
              interests: true
            }
          }
        }
      });

      // Send notification to the friend about the new friend request
      try {
        await this.notificationService.sendNotification(
          friendId,
          NotificationService.NotificationTypes.FRIEND_REQUEST(user.username),
          { sendPush: true, saveToDb: true }
        );
      } catch (notificationError) {
        // Log error but don't fail the friend request
        console.error('Failed to send friend request notification:', notificationError);
      }

      // Send notification to the requester that the request was sent
      try {
        await this.notificationService.sendNotification(
          userId,
          NotificationService.NotificationTypes.FRIEND_ACCEPTED(friend.username),
          { sendPush: true, saveToDb: true }
        );
      } catch (notificationError) {
        // Log error but don't fail the friend request
        console.error('Failed to send friend accepted notification:', notificationError);
      }

      return {
        id: friendship.friend.id,
        username: friendship.friend.username,
        avatarUrl: friendship.friend.avatarUrl,
        isPro: friendship.friend.isPro,
        interests: friendship.friend.interests,
        friendshipDate: friendship.createdAt
      };
    } catch (error) {
      throw new Error(`Failed to send friend request: ${error}`);
    }
  }

  /**
   * Remove a friend
   */
  async removeFriend(userId: string, friendId: string) {
    try {
      const friendship = await prisma.friendship.findFirst({
        where: {
          OR: [
            { userId: userId, friendId: friendId },
            { userId: friendId, friendId: userId }
          ]
        }
      });

      if (!friendship) {
        throw new Error('Friendship not found');
      }

      // Get user details for notification
      const [user, friend] = await Promise.all([
        prisma.user.findUnique({ 
          where: { id: userId },
          select: { username: true }
        }),
        prisma.user.findUnique({ 
          where: { id: friendId },
          select: { username: true }
        })
      ]);

      await prisma.friendship.delete({
        where: { id: friendship.id }
      });

      // Send notification to the friend that they were removed
      if (user && friend) {
        try {
          await this.notificationService.sendNotification(
            friendId,
            NotificationService.NotificationTypes.SYSTEM_ANNOUNCEMENT(
              "Friend Removed",
              `${user.username} removed you from their friends list`
            ),
            { sendPush: false, saveToDb: true } // Don't send push for this sensitive action
          );
        } catch (notificationError) {
          // Log error but don't fail the removal
          console.error('Failed to send friend removal notification:', notificationError);
        }
      }

      return { message: 'Friend removed successfully' };
    } catch (error) {
      throw new Error(`Failed to remove friend: ${error}`);
    }
  }

  /**
   * Check if two users are friends
   */
  async areFriends(userId: string, friendId: string): Promise<boolean> {
    try {
      const friendship = await prisma.friendship.findFirst({
        where: {
          OR: [
            { userId: userId, friendId: friendId },
            { userId: friendId, friendId: userId }
          ]
        }
      });

      return !!friendship;
    } catch (error) {
      throw new Error(`Failed to check friendship status: ${error}`);
    }
  }

  /**
   * Get friend suggestions (users who are not friends yet)
   */
  async getFriendSuggestions(userId: string, limit: number = 10) {
    try {
      // Get current friend IDs
      const friendships = await prisma.friendship.findMany({
        where: {
          OR: [
            { userId: userId },
            { friendId: userId }
          ]
        },
        select: {
          userId: true,
          friendId: true
        }
      });

      const friendIds = friendships.map(f => 
        f.userId === userId ? f.friendId : f.userId
      );

      // Get users who are not friends and not the current user
      const suggestions = await prisma.user.findMany({
        where: {
          AND: [
            { id: { not: userId } },
            { id: { notIn: friendIds } },
            { isBanned: false }
          ]
        },
        select: {
          id: true,
          username: true,
          avatarUrl: true,
          isPro: true,
          interests: true
        },
        take: limit,
        orderBy: {
          createdAt: 'desc'
        }
      });

      return suggestions;
    } catch (error) {
      throw new Error(`Failed to get friend suggestions: ${error}`);
    }
  }

  /**
   * Accept a pending friend request (if you want to add this functionality)
   */
  async acceptFriendRequest(userId: string, requesterId: string) {
    try {
      // Get user details for notification
      const [user, requester] = await Promise.all([
        prisma.user.findUnique({ 
          where: { id: userId },
          select: { username: true }
        }),
        prisma.user.findUnique({ 
          where: { id: requesterId },
          select: { username: true }
        })
      ]);

      if (!user || !requester) {
        throw new Error('User not found');
      }

      // Send notification to the requester that their request was accepted
      try {
        await this.notificationService.sendNotification(
          requesterId,
          NotificationService.NotificationTypes.FRIEND_ACCEPTED(user.username),
          { sendPush: true, saveToDb: true }
        );
      } catch (notificationError) {
        // Log error but don't fail the acceptance
        console.error('Failed to send friend accepted notification:', notificationError);
      }

      return { message: 'Friend request accepted successfully' };
    } catch (error) {
      throw new Error(`Failed to accept friend request: ${error}`);
    }
  }
}
