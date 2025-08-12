import { Request, Response } from "express";
import { NotificationService } from "../service/notification.service";
import { NotificationType } from "@prisma/client";
import logger from "../config/logger";

interface PushSubscriptionRequest {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface SendNotificationRequest {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  priority?: 'low' | 'normal' | 'high';
  sendPush?: boolean;
  saveToDb?: boolean;
}

export class NotificationController {
  private notificationService: NotificationService;

  constructor() {
    this.notificationService = new NotificationService();
  }

  /**
   * Subscribe to push notifications
   * POST /api/notifications/subscribe
   */
  subscribeToPush = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.publicKey;
      const subscription: PushSubscriptionRequest = req.body.subscription;
      const userAgent = req.get('User-Agent');

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      if (!subscription || !subscription.endpoint || !subscription.keys) {
        res.status(400).json({
          success: false,
          message: "Invalid subscription data",
        });
        return;
      }

      const pushSubscription = await this.notificationService.addPushSubscription(
        userId,
        subscription,
        userAgent
      );

      res.status(201).json({
        success: true,
        message: "Successfully subscribed to push notifications",
        data: {
          id: pushSubscription.id,
          endpoint: pushSubscription.endpoint,
          isActive: pushSubscription.isActive,
          createdAt: pushSubscription.createdAt
        },
      });
    } catch (error) {
      logger.error("Error subscribing to push notifications:", error);
      res.status(500).json({
        success: false,
        message: "Failed to subscribe to push notifications",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Save push subscription (alternative endpoint for frontend compatibility)
   * POST /api/notifications/save-subscription
   */
  saveSubscription = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.username;
      const subscription: PushSubscriptionRequest = req.body; // Direct subscription object
      const userAgent = req.get('User-Agent');

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      if (!subscription || !subscription.endpoint || !subscription.keys) {
        res.status(400).json({
          success: false,
          message: "Invalid subscription data",
        });
        return;
      }

      const pushSubscription = await this.notificationService.addPushSubscription(
        userId,
        subscription,
        userAgent
      );

      res.status(201).json({
        success: true,
        message: "Successfully saved push subscription",
        data: {
          id: pushSubscription.id,
          endpoint: pushSubscription.endpoint,
          isActive: pushSubscription.isActive,
          createdAt: pushSubscription.createdAt
        },
      });
    } catch (error) {
      logger.error("Error saving push subscription:", error);
      res.status(500).json({
        success: false,
        message: "Failed to save push subscription",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Verify push subscription validity
   * POST /api/notifications/verify-subscription
   */
  verifySubscription = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.username;
      const subscription: PushSubscriptionRequest = req.body;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      if (!subscription || !subscription.endpoint) {
        res.status(400).json({
          success: false,
          message: "Invalid subscription data",
        });
        return;
      }

      // Check if subscription exists and is active
      const isValid = await this.notificationService.verifyPushSubscription(
        userId,
        subscription.endpoint
      );

      if (isValid) {
        res.status(200).json({
          success: true,
          message: "Subscription is valid",
          data: { valid: true }
        });
      } else {
        res.status(404).json({
          success: false,
          message: "Subscription not found or inactive",
          data: { valid: false }
        });
      }
    } catch (error) {
      logger.error("Error verifying push subscription:", error);
      res.status(500).json({
        success: false,
        message: "Failed to verify push subscription",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Unsubscribe from push notifications
   * DELETE /api/notifications/unsubscribe
   */
  unsubscribeFromPush = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.publicKey;
      const { endpoint } = req.body;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      if (!endpoint) {
        res.status(400).json({
          success: false,
          message: "Endpoint is required",
        });
        return;
      }

      await this.notificationService.removePushSubscription(userId, endpoint);

      res.status(200).json({
        success: true,
        message: "Successfully unsubscribed from push notifications",
      });
    } catch (error) {
      logger.error("Error unsubscribing from push notifications:", error);
      res.status(500).json({
        success: false,
        message: "Failed to unsubscribe from push notifications",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Get user's notifications with pagination
   * GET /api/notifications
   */
  getNotifications = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.username;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const unreadOnly = req.query.unreadOnly === 'true';
      const type = req.query.type as NotificationType;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }
      
      const result = await this.notificationService.getUserNotifications(userId, {
        page,
        limit,
        unreadOnly,
        type,
      });

      res.status(200).json({
        success: true,
        data: result.notifications,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
          unreadCount: result.unreadCount,
        },
      });
    } catch (error) {
      logger.error("Error getting notifications:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get notifications",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Get unread notification count
   * GET /api/notifications/unread-count
   */
  getUnreadCount = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.publicKey;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      const count = await this.notificationService.getUnreadCount(userId);

      res.status(200).json({
        success: true,
        data: { unreadCount: count },
      });
    } catch (error) {
      logger.error("Error getting unread count:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get unread count",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Mark notification as read
   * PATCH /api/notifications/:id/read
   */
  markAsRead = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.publicKey;
      const { id } = req.params;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      if (!id) {
        res.status(400).json({
          success: false,
          message: "Notification ID is required",
        });
        return;
      }

      await this.notificationService.markAsRead(id, userId);

      res.status(200).json({
        success: true,
        message: "Notification marked as read",
      });
    } catch (error) {
      logger.error("Error marking notification as read:", error);
      
      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({
          success: false,
          message: "Notification not found",
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: "Failed to mark notification as read",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Mark all notifications as read
   * PATCH /api/notifications/read-all
   */
  markAllAsRead = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.publicKey;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      await this.notificationService.markAllAsRead(userId);

      res.status(200).json({
        success: true,
        message: "All notifications marked as read",
      });
    } catch (error) {
      logger.error("Error marking all notifications as read:", error);
      res.status(500).json({
        success: false,
        message: "Failed to mark all notifications as read",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Send a notification (admin/system use)
   * POST /api/notifications/send
   */
  sendNotification = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        userId,
        type,
        title,
        message,
        data,
        priority,
        sendPush = true,
        saveToDb = true,
      }: SendNotificationRequest = req.body;

      if (!userId || !type || !title || !message) {
        res.status(400).json({
          success: false,
          message: "Missing required fields: userId, type, title, message",
        });
        return;
      }

      const notification = await this.notificationService.sendNotification(
        userId,
        { type, title, message, data, priority },
        { sendPush, saveToDb }
      );

      res.status(201).json({
        success: true,
        message: "Notification sent successfully",
        data: notification,
      });
    } catch (error) {
      logger.error("Error sending notification:", error);
      res.status(500).json({
        success: false,
        message: "Failed to send notification",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Test push notification for current user
   * POST /api/notifications/test-push
   */
  testPushNotification = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.username;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      const testNotification = NotificationService.NotificationTypes.SYSTEM_ANNOUNCEMENT(
        "Test Notification",
        "This is a test push notification to verify your subscription is working!"
      );

      await this.notificationService.sendNotification(userId, testNotification, {
        sendPush: true,
        saveToDb: true,
      });

      res.status(200).json({
        success: true,
        message: "Test notification sent successfully",
      });
    } catch (error) {
      logger.error("Error sending test notification:", error);
      res.status(500).json({
        success: false,
        message: "Failed to send test notification",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Get notification preferences/settings
   * GET /api/notifications/preferences
   */
  getNotificationPreferences = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.publicKey;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      const preferences = await this.notificationService.getNotificationPreferences(userId);

      res.status(200).json({
        success: true,
        data: preferences,
      });
    } catch (error) {
      logger.error("Error getting notification preferences:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get notification preferences",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Update notification preferences
   * PUT /api/notifications/preferences
   */
  updateNotificationPreferences = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.publicKey;
      const preferences = req.body;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      if (!preferences || typeof preferences !== 'object') {
        res.status(400).json({
          success: false,
          message: "Invalid preferences data",
        });
        return;
      }

      const updatedPreferences = await this.notificationService.updateNotificationPreferences(userId, preferences);

      res.status(200).json({
        success: true,
        message: "Notification preferences updated successfully",
        data: updatedPreferences,
      });
    } catch (error) {
      logger.error("Error updating notification preferences:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update notification preferences",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Delete a specific notification
   * DELETE /api/notifications/:id
   */
  deleteNotification = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.publicKey;
      const { id } = req.params;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      if (!id) {
        res.status(400).json({
          success: false,
          message: "Notification ID is required",
        });
        return;
      }

      await this.notificationService.deleteNotification(id, userId);

      res.status(200).json({
        success: true,
        message: "Notification deleted successfully",
      });
    } catch (error) {
      logger.error("Error deleting notification:", error);
      
      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({
          success: false,
          message: "Notification not found",
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: "Failed to delete notification",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Clear all notifications for user
   * DELETE /api/notifications/clear-all
   */
  clearAllNotifications = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.publicKey;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      const deletedCount = await this.notificationService.clearAllNotifications(userId);

      res.status(200).json({
        success: true,
        message: "All notifications cleared successfully",
        data: { deletedCount },
      });
    } catch (error) {
      logger.error("Error clearing all notifications:", error);
      res.status(500).json({
        success: false,
        message: "Failed to clear all notifications",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Bulk operations on notifications
   * POST /api/notifications/bulk-actions
   */
  bulkActions = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.publicKey;
      const { action, notificationIds } = req.body;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      if (!action || !Array.isArray(notificationIds) || notificationIds.length === 0) {
        res.status(400).json({
          success: false,
          message: "Action and notification IDs array are required",
        });
        return;
      }

      const validActions = ['mark_read', 'delete'];
      if (!validActions.includes(action)) {
        res.status(400).json({
          success: false,
          message: `Invalid action. Must be one of: ${validActions.join(', ')}`,
        });
        return;
      }

      const result = await this.notificationService.bulkActions(userId, action, notificationIds);

      res.status(200).json({
        success: true,
        message: `Bulk ${action.replace('_', ' ')} completed successfully`,
        data: result,
      });
    } catch (error) {
      logger.error("Error performing bulk actions:", error);
      res.status(500).json({
        success: false,
        message: "Failed to perform bulk actions",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Get notification analytics (admin only)
   * GET /api/notifications/analytics
   */
  getNotificationAnalytics = async (req: Request, res: Response): Promise<void> => {
    try {
      // For now, this is a placeholder - in production you'd check admin role
      const { timeframe = '7d' } = req.query;

      const analytics = await this.notificationService.getNotificationAnalytics(timeframe as string);

      res.status(200).json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      logger.error("Error getting notification analytics:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get notification analytics",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Broadcast notification to multiple users
   * POST /api/notifications/broadcast
   */
  broadcastNotification = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userIds, type, title, message, data, priority } = req.body;

      if (!Array.isArray(userIds) || userIds.length === 0) {
        res.status(400).json({
          success: false,
          message: "User IDs array is required and cannot be empty",
        });
        return;
      }

      if (!type || !title || !message) {
        res.status(400).json({
          success: false,
          message: "Missing required fields: type, title, message",
        });
        return;
      }

      const results = await this.notificationService.broadcastNotification(
        userIds,
        { type, title, message, data, priority }
      );

      res.status(201).json({
        success: true,
        message: "Broadcast notification sent successfully",
        data: {
          totalUsers: userIds.length,
          successCount: results.successCount,
          failureCount: results.failureCount,
          failures: results.failures,
        },
      });
    } catch (error) {
      logger.error("Error broadcasting notification:", error);
      res.status(500).json({
        success: false,
        message: "Failed to broadcast notification",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Get available notification types
   * GET /api/notifications/types
   */
  getNotificationTypes = async (req: Request, res: Response): Promise<void> => {
    try {
      const types = Object.values(NotificationType).map(type => ({
        value: type,
        label: type.split('_').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' '),
        description: this.getNotificationTypeDescription(type)
      }));

      res.status(200).json({
        success: true,
        data: types,
      });
    } catch (error) {
      logger.error("Error getting notification types:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get notification types",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Schedule a notification for later
   * POST /api/notifications/schedule
   */
  scheduleNotification = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, type, title, message, data, priority, scheduledFor } = req.body;

      if (!userId || !type || !title || !message || !scheduledFor) {
        res.status(400).json({
          success: false,
          message: "Missing required fields: userId, type, title, message, scheduledFor",
        });
        return;
      }

      const scheduledDate = new Date(scheduledFor);
      if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
        res.status(400).json({
          success: false,
          message: "Invalid scheduledFor date. Must be a future date.",
        });
        return;
      }

      const scheduledNotification = await this.notificationService.scheduleNotification(
        userId,
        { type, title, message, data, priority },
        scheduledDate
      );

      res.status(201).json({
        success: true,
        message: "Notification scheduled successfully",
        data: scheduledNotification,
      });
    } catch (error) {
      logger.error("Error scheduling notification:", error);
      res.status(500).json({
        success: false,
        message: "Failed to schedule notification",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Get notification history with advanced filters
   * GET /api/notifications/history
   */
  getNotificationHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.publicKey;
      const {
        startDate,
        endDate,
        types,
        read,
        sent,
        page = 1,
        limit = 50
      } = req.query;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      const filters = {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        types: types ? (types as string).split(',') as NotificationType[] : undefined,
        read: read !== undefined ? read === 'true' : undefined,
        sent: sent !== undefined ? sent === 'true' : undefined,
        page: parseInt(page as string),
        limit: Math.min(parseInt(limit as string), 100), // Max 100 per page
      };

      const result = await this.notificationService.getNotificationHistory(userId, filters);

      res.status(200).json({
        success: true,
        data: result.notifications,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
        filters: filters,
      });
    } catch (error) {
      logger.error("Error getting notification history:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get notification history",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Helper method to get notification type descriptions
   */
  private getNotificationTypeDescription(type: NotificationType): string {
    const descriptions: Record<NotificationType, string> = {
      [NotificationType.FRIEND_REQUEST]: "Sent when someone sends a friend request",
      [NotificationType.FRIEND_ACCEPTED]: "Sent when a friend request is accepted",
      [NotificationType.NEW_MESSAGE]: "Sent when a new message is received",
      [NotificationType.CALL_INCOMING]: "Sent for incoming calls",
      [NotificationType.CALL_MISSED]: "Sent for missed calls",
      [NotificationType.MATCH_FOUND]: "Sent when a chat match is found",
      [NotificationType.SYSTEM_ANNOUNCEMENT]: "System-wide announcements",
      [NotificationType.POINTS_EARNED]: "Sent when points are earned",
      [NotificationType.ACHIEVEMENT_UNLOCKED]: "Sent when achievements are unlocked",
      [NotificationType.SUBSCRIPTION_EXPIRING]: "Sent when subscription is about to expire",
      [NotificationType.SUBSCRIPTION_EXPIRED]: "Sent when subscription has expired",
    };

    return descriptions[type] || "Unknown notification type";
  }
}
