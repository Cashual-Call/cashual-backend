import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { sendWebPushNotification } from "../utils/notification";
import { NotificationType, PushSubscription, Notification } from "@prisma/client";
import logger from "../config/logger";

interface NotificationData {
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  priority?: 'low' | 'normal' | 'high';
}

interface CreateNotificationOptions {
  userId: string;
  notification: NotificationData;
  sendPush?: boolean;
  saveToDb?: boolean;
}

interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export class NotificationService {
  private readonly CACHE_TTL = 60 * 5; // 5 minutes
  private readonly USER_NOTIFICATIONS_PREFIX = "user_notifications:";
  private readonly UNREAD_COUNT_PREFIX = "unread_count:";

  constructor() {
    this.sendNotification = this.sendNotification.bind(this);
    this.createNotification = this.createNotification.bind(this);
    this.markAsRead = this.markAsRead.bind(this);
    this.markAllAsRead = this.markAllAsRead.bind(this);
    this.getUserNotifications = this.getUserNotifications.bind(this);
    this.getUnreadCount = this.getUnreadCount.bind(this);
    this.addPushSubscription = this.addPushSubscription.bind(this);
    this.removePushSubscription = this.removePushSubscription.bind(this);
    this.sendPushToUser = this.sendPushToUser.bind(this);
  }

  /**
   * Main method to send notification - handles everything automatically
   */
  async sendNotification(
    userId: string,
    notification: NotificationData,
    options: { sendPush?: boolean; saveToDb?: boolean } = {}
  ): Promise<Notification | null> {
    const { sendPush = true, saveToDb = true } = options;

    try {
      let dbNotification: Notification | null = null;

      // Save to database if requested
      if (saveToDb) {
        dbNotification = await this.createNotification({
          userId,
          notification,
          sendPush: false, // We'll handle push separately
          saveToDb: true
        });
      }

      // Send push notification if requested
      if (sendPush) {
        await this.sendPushToUser(userId, notification);
        
        // Update notification as sent if we saved it to DB
        if (dbNotification) {
          await prisma.notification.update({
            where: { id: dbNotification.id },
            data: { 
              isSent: true,
              sentAt: new Date()
            }
          });
        }
      }

      // Invalidate cache
      await this.invalidateUserCache(userId);

      logger.info(`Notification sent to user ${userId}`, {
        type: notification.type,
        title: notification.title,
        sendPush,
        saveToDb
      });

      return dbNotification;
    } catch (error) {
      logger.error(`Failed to send notification to user ${userId}:`, error);
      throw new Error(`Failed to send notification: ${error}`);
    }
  }

  /**
   * Create and optionally send notification
   */
  async createNotification(options: CreateNotificationOptions): Promise<Notification> {
    const { userId, notification, sendPush = false, saveToDb = true } = options;

    try {
      // Validate user exists
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new Error(`User with ID ${userId} not found`);
      }

      let dbNotification: Notification | null = null;

      if (saveToDb) {
        // Create notification in database
        dbNotification = await prisma.notification.create({
          data: {
            userId,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            data: notification.data || {},
            isSent: sendPush, // Mark as sent if we're also sending push
            sentAt: sendPush ? new Date() : null
          }
        });
      }

      // Send push notification if requested
      if (sendPush) {
        await this.sendPushToUser(userId, notification);
      }

      // Invalidate cache
      await this.invalidateUserCache(userId);

      return dbNotification!;
    } catch (error) {
      logger.error(`Failed to create notification:`, error);
      throw new Error(`Failed to create notification: ${error}`);
    }
  }

  /**
   * Send push notification to user's subscribed devices
   */
  async sendPushToUser(userId: string, notification: NotificationData): Promise<void> {
    try {
      // Get user's active push subscriptions
      const subscriptions = await prisma.pushSubscription.findMany({
        where: {
          userId,
          isActive: true
        }
      });

      if (subscriptions.length === 0) {
        logger.info(`No active push subscriptions found for user ${userId}`);
        return;
      }

      // Prepare push payload
      const payload = {
        title: notification.title,
        body: notification.message,
        data: {
          type: notification.type,
          ...notification.data
        },
        badge: await this.getUnreadCount(userId),
        icon: '/logo.webp',
        timestamp: Date.now()
      };

      // Send to all subscriptions
      const pushPromises = subscriptions.map(async (subscription) => {
        try {
          const pushSubscription = {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth
            }
          };

          const options = {
            urgency: notification.priority || 'normal',
            TTL: 60 * 60 * 24 // 24 hours
          };

          const result = await sendWebPushNotification(
            pushSubscription,
            payload,
            options
          );

          if (!result.success) {
            logger.warn(`Failed to send push to subscription ${subscription.id}:`, result.error);
            
            // If subscription is invalid, deactivate it
            if (result.error?.statusCode === 410) {
              await prisma.pushSubscription.update({
                where: { id: subscription.id },
                data: { isActive: false }
              });
            }
          }

          return result;
        } catch (error) {
          logger.error(`Error sending push to subscription ${subscription.id}:`, error);
          return { success: false, error };
        }
      });

      await Promise.allSettled(pushPromises);
      logger.info(`Push notifications sent to ${subscriptions.length} devices for user ${userId}`);
    } catch (error) {
      logger.error(`Failed to send push notifications to user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId?: string): Promise<void> {
    try {
      const updateData: any = {
        isRead: true,
        readAt: new Date()
      };

      const where: any = { id: notificationId };
      if (userId) {
        where.userId = userId;
      }

      const notification = await prisma.notification.update({
        where,
        data: updateData
      });

      // Invalidate cache
      await this.invalidateUserCache(notification.userId);
    } catch (error) {
      logger.error(`Failed to mark notification as read:`, error);
      throw new Error(`Failed to mark notification as read: ${error}`);
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    try {
      await prisma.notification.updateMany({
        where: {
          userId,
          isRead: false
        },
        data: {
          isRead: true,
          readAt: new Date()
        }
      });

      // Invalidate cache
      await this.invalidateUserCache(userId);
    } catch (error) {
      logger.error(`Failed to mark all notifications as read:`, error);
      throw new Error(`Failed to mark all notifications as read: ${error}`);
    }
  }

  /**
   * Get user's notifications with pagination
   */
  async getUserNotifications(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      unreadOnly?: boolean;
      type?: NotificationType;
    } = {}
  ): Promise<{
    notifications: Notification[];
    total: number;
    unreadCount: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20, unreadOnly = false, type } = options;
    const skip = (page - 1) * limit;

    try {
      const where: any = { userId };
      
      if (unreadOnly) {
        where.isRead = false;
      }
      
      if (type) {
        where.type = type;
      }

      const [notifications, total, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        prisma.notification.count({ where }),
        this.getUnreadCount(userId)
      ]);

      return {
        notifications,
        total,
        unreadCount,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      logger.error(`Failed to get user notifications:`, error);
      throw new Error(`Failed to get user notifications: ${error}`);
    }
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    const cacheKey = `${this.UNREAD_COUNT_PREFIX}${userId}`;

    try {
      // Try to get from cache first
      const cached = await redis.get(cacheKey);
      if (cached !== null) {
        return parseInt(cached);
      }

      // Get from database
      const count = await prisma.notification.count({
        where: {
          userId,
          isRead: false
        }
      });

      // Cache the result
      await redis.setex(cacheKey, this.CACHE_TTL, count.toString());
      
      return count;
    } catch (error) {
      logger.error(`Failed to get unread count:`, error);
      return 0;
    }
  }

  /**
   * Add push subscription for a user
   */
  async addPushSubscription(
    userId: string,
    subscription: PushSubscriptionData,
    userAgent?: string
  ): Promise<PushSubscription> {
    try {
      // Deactivate existing subscription with same endpoint
      await prisma.pushSubscription.updateMany({
        where: {
          userId,
          endpoint: subscription.endpoint
        },
        data: { isActive: false }
      });

      // Create new subscription
      const pushSubscription = await prisma.pushSubscription.create({
        data: {
          userId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          userAgent: userAgent || null,
          isActive: true
        }
      });

      logger.info(`Push subscription added for user ${userId}`);
      return pushSubscription;
    } catch (error) {
      logger.error(`Failed to add push subscription:`, error);
      throw new Error(`Failed to add push subscription: ${error}`);
    }
  }

  /**
   * Remove push subscription
   */
  async removePushSubscription(userId: string, endpoint: string): Promise<void> {
    try {
      await prisma.pushSubscription.updateMany({
        where: {
          userId,
          endpoint
        },
        data: { isActive: false }
      });

      logger.info(`Push subscription removed for user ${userId}`);
    } catch (error) {
      logger.error(`Failed to remove push subscription:`, error);
      throw new Error(`Failed to remove push subscription: ${error}`);
    }
  }

  /**
   * Delete old notifications (cleanup)
   */
  async cleanupOldNotifications(daysOld: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const deleted = await prisma.notification.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate
          },
          isRead: true
        }
      });

      logger.info(`Cleaned up ${deleted.count} old notifications`);
      return deleted.count;
    } catch (error) {
      logger.error(`Failed to cleanup old notifications:`, error);
      throw new Error(`Failed to cleanup old notifications: ${error}`);
    }
  }

  /**
   * Invalidate user cache
   */
  private async invalidateUserCache(userId: string): Promise<void> {
    try {
      const cacheKeys = [
        `${this.USER_NOTIFICATIONS_PREFIX}${userId}`,
        `${this.UNREAD_COUNT_PREFIX}${userId}`
      ];
      
      await Promise.all(cacheKeys.map(key => redis.del(key)));
    } catch (error) {
      logger.warn(`Failed to invalidate cache for user ${userId}:`, error);
    }
  }

  // Helper methods for different notification types
  static readonly NotificationTypes = {
    FRIEND_REQUEST: (username: string) => ({
      type: NotificationType.FRIEND_REQUEST,
      title: "New Friend Request",
      message: `${username} wants to be your friend`,
      data: { username }
    }),

    FRIEND_ACCEPTED: (username: string) => ({
      type: NotificationType.FRIEND_ACCEPTED,
      title: "Friend Request Accepted",
      message: `${username} accepted your friend request`,
      data: { username }
    }),

    NEW_MESSAGE: (username: string, preview?: string) => ({
      type: NotificationType.NEW_MESSAGE,
      title: `New message from ${username}`,
      message: preview || "You have a new message",
      data: { username, preview }
    }),

    CALL_INCOMING: (username: string) => ({
      type: NotificationType.CALL_INCOMING,
      title: "Incoming Call",
      message: `${username} is calling you`,
      data: { username },
      priority: 'high' as const
    }),

    CALL_MISSED: (username: string) => ({
      type: NotificationType.CALL_MISSED,
      title: "Missed Call",
      message: `You missed a call from ${username}`,
      data: { username }
    }),

    MATCH_FOUND: () => ({
      type: NotificationType.MATCH_FOUND,
      title: "Match Found!",
      message: "We found someone for you to chat with",
      data: {}
    }),

    SYSTEM_ANNOUNCEMENT: (title: string, message: string) => ({
      type: NotificationType.SYSTEM_ANNOUNCEMENT,
      title,
      message,
      data: {}
    }),

    POINTS_EARNED: (points: number, reason?: string) => ({
      type: NotificationType.POINTS_EARNED,
      title: "Points Earned!",
      message: `You earned ${points} points${reason ? ` for ${reason}` : ''}`,
      data: { points, reason }
    }),

    ACHIEVEMENT_UNLOCKED: (achievement: string) => ({
      type: NotificationType.ACHIEVEMENT_UNLOCKED,
      title: "Achievement Unlocked!",
      message: `You unlocked: ${achievement}`,
      data: { achievement }
    }),

    SUBSCRIPTION_EXPIRING: (daysLeft: number) => ({
      type: NotificationType.SUBSCRIPTION_EXPIRING,
      title: "Subscription Expiring",
      message: `Your Pro subscription expires in ${daysLeft} days`,
      data: { daysLeft }
    }),

    SUBSCRIPTION_EXPIRED: () => ({
      type: NotificationType.SUBSCRIPTION_EXPIRED,
      title: "Subscription Expired",
      message: "Your Pro subscription has expired",
      data: {}
    })
  };
}
