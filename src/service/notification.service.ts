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

  /**
   * Get user's notification preferences
   */
  async getNotificationPreferences(userId: string): Promise<any> {
    try {
      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { 
          id: true
        }
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Check cache for stored preferences
      const cacheKey = `user_preferences:${userId}`;
      const cachedPreferences = await redis.get(cacheKey);

      if (cachedPreferences) {
        return JSON.parse(cachedPreferences);
      }

      // Return default preferences if none cached
      const defaultPreferences = {
        pushNotifications: true,
        emailNotifications: true,
        types: {
          [NotificationType.FRIEND_REQUEST]: true,
          [NotificationType.FRIEND_ACCEPTED]: true,
          [NotificationType.NEW_MESSAGE]: true,
          [NotificationType.CALL_INCOMING]: true,
          [NotificationType.CALL_MISSED]: true,
          [NotificationType.MATCH_FOUND]: true,
          [NotificationType.SYSTEM_ANNOUNCEMENT]: true,
          [NotificationType.POINTS_EARNED]: true,
          [NotificationType.ACHIEVEMENT_UNLOCKED]: true,
          [NotificationType.SUBSCRIPTION_EXPIRING]: true,
          [NotificationType.SUBSCRIPTION_EXPIRED]: true,
        },
      };

      return defaultPreferences;
    } catch (error) {
      logger.error(`Failed to get notification preferences for user ${userId}:`, error);
      throw new Error(`Failed to get notification preferences: ${error}`);
    }
  }

  /**
   * Update user's notification preferences
   */
  async updateNotificationPreferences(userId: string, preferences: any): Promise<any> {
    try {
      // Verify user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true }
      });

      if (!user) {
        throw new Error("User not found");
      }

      // For now, we'll just cache the preferences in Redis since we don't have schema fields
      // In production, you'd want to add these fields to the User model or create a separate table
      const cacheKey = `user_preferences:${userId}`;
      await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(preferences));

      await this.invalidateUserCache(userId);

      logger.info(`Updated notification preferences for user ${userId}`);

      return preferences;
    } catch (error) {
      logger.error(`Failed to update notification preferences for user ${userId}:`, error);
      throw new Error(`Failed to update notification preferences: ${error}`);
    }
  }

  /**
   * Delete a specific notification
   */
  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    try {
      const notification = await prisma.notification.findFirst({
        where: {
          id: notificationId,
          userId: userId
        }
      });

      if (!notification) {
        throw new Error("Notification not found or not owned by user");
      }

      await prisma.notification.delete({
        where: { id: notificationId }
      });

      await this.invalidateUserCache(userId);

      logger.info(`Notification ${notificationId} deleted for user ${userId}`);
    } catch (error) {
      logger.error(`Failed to delete notification ${notificationId}:`, error);
      throw new Error(`Failed to delete notification: ${error}`);
    }
  }

  /**
   * Clear all notifications for a user
   */
  async clearAllNotifications(userId: string): Promise<number> {
    try {
      const result = await prisma.notification.deleteMany({
        where: { userId }
      });

      await this.invalidateUserCache(userId);

      logger.info(`Cleared ${result.count} notifications for user ${userId}`);
      return result.count;
    } catch (error) {
      logger.error(`Failed to clear all notifications for user ${userId}:`, error);
      throw new Error(`Failed to clear all notifications: ${error}`);
    }
  }

  /**
   * Perform bulk actions on notifications
   */
  async bulkActions(userId: string, action: string, notificationIds: string[]): Promise<any> {
    try {
      let result;

      if (action === 'mark_read') {
        result = await prisma.notification.updateMany({
          where: {
            id: { in: notificationIds },
            userId: userId
          },
          data: {
            isRead: true,
            readAt: new Date()
          }
        });
      } else if (action === 'delete') {
        result = await prisma.notification.deleteMany({
          where: {
            id: { in: notificationIds },
            userId: userId
          }
        });
      } else {
        throw new Error(`Invalid action: ${action}`);
      }

      await this.invalidateUserCache(userId);

      logger.info(`Bulk ${action} performed on ${result.count} notifications for user ${userId}`);
      
      return {
        action,
        processedCount: result.count,
        requestedCount: notificationIds.length
      };
    } catch (error) {
      logger.error(`Failed to perform bulk ${action} for user ${userId}:`, error);
      throw new Error(`Failed to perform bulk ${action}: ${error}`);
    }
  }

  /**
   * Get notification analytics
   */
  async getNotificationAnalytics(timeframe: string): Promise<any> {
    try {
      const now = new Date();
      let startDate: Date;

      // Calculate start date based on timeframe
      switch (timeframe) {
        case '1d':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }

      // Get notification statistics
      const [
        totalNotifications,
        notificationsByType,
        readNotifications,
        pushSubscriptions
      ] = await Promise.all([
        // Total notifications in timeframe
        prisma.notification.count({
          where: {
            createdAt: { gte: startDate }
          }
        }),

        // Notifications by type
        prisma.notification.groupBy({
          by: ['type'],
          where: {
            createdAt: { gte: startDate }
          },
          _count: {
            type: true
          }
        }),

        // Read rate - count read notifications
        prisma.notification.count({
          where: {
            createdAt: { gte: startDate },
            isRead: true
          }
        }),

        // Active push subscriptions
        prisma.pushSubscription.count({
          where: {
            isActive: true
          }
        })
      ]);

      const readRatePercentage = totalNotifications > 0 
        ? (readNotifications / totalNotifications) * 100 
        : 0;

      return {
        timeframe,
        period: {
          start: startDate,
          end: now
        },
        summary: {
          totalNotifications,
          readRate: Math.round(readRatePercentage * 100) / 100,
          activePushSubscriptions: pushSubscriptions
        },
        breakdown: {
          byType: notificationsByType.map(item => ({
            type: item.type,
            count: item._count.type
          }))
        }
      };
    } catch (error) {
      logger.error(`Failed to get notification analytics:`, error);
      throw new Error(`Failed to get notification analytics: ${error}`);
    }
  }

  /**
   * Broadcast notification to multiple users
   */
  async broadcastNotification(userIds: string[], notification: NotificationData): Promise<any> {
    try {
      const results = {
        successCount: 0,
        failureCount: 0,
        failures: [] as Array<{ userId: string; error: string }>
      };

      // Process in batches to avoid overwhelming the system
      const batchSize = 100;
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        
        await Promise.allSettled(
          batch.map(async (userId) => {
            try {
              await this.sendNotification(userId, notification);
              results.successCount++;
            } catch (error) {
              results.failureCount++;
              results.failures.push({
                userId,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          })
        );
      }

      logger.info(`Broadcast notification sent to ${results.successCount}/${userIds.length} users`);
      return results;
    } catch (error) {
      logger.error(`Failed to broadcast notification:`, error);
      throw new Error(`Failed to broadcast notification: ${error}`);
    }
  }

  /**
   * Schedule a notification for later
   */
  async scheduleNotification(userId: string, notification: NotificationData, scheduledFor: Date): Promise<any> {
    try {
      // For now, store as a regular notification with scheduled info in data field
      // In production, you'd want to use a job queue like Bull/Agenda
      const scheduledNotification = await prisma.notification.create({
        data: {
          userId,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: {
            ...notification.data,
            scheduled: true,
            scheduledFor: scheduledFor.toISOString()
          },
          isSent: false
        }
      });

      // TODO: Add to job queue for actual scheduling
      logger.info(`Notification scheduled for user ${userId} at ${scheduledFor}`);
      
      return {
        id: scheduledNotification.id,
        scheduledFor,
        status: 'scheduled'
      };
    } catch (error) {
      logger.error(`Failed to schedule notification for user ${userId}:`, error);
      throw new Error(`Failed to schedule notification: ${error}`);
    }
  }

  /**
   * Get notification history with advanced filters
   */
  async getNotificationHistory(userId: string, filters: any): Promise<any> {
    try {
      const {
        startDate,
        endDate,
        types,
        read,
        sent,
        page = 1,
        limit = 50
      } = filters;

      const where: any = {
        userId
      };

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = startDate;
        if (endDate) where.createdAt.lte = endDate;
      }

      if (types && types.length > 0) {
        where.type = { in: types };
      }

      if (read !== undefined) {
        where.isRead = read;
      }

      if (sent !== undefined) {
        where.isSent = sent;
      }

      const skip = (page - 1) * limit;

      const [notifications, total] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            user: {
              select: {
                id: true,
                username: true
              }
            }
          }
        }),
        prisma.notification.count({ where })
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        notifications,
        page,
        limit,
        total,
        totalPages
      };
    } catch (error) {
      logger.error(`Failed to get notification history for user ${userId}:`, error);
      throw new Error(`Failed to get notification history: ${error}`);
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
