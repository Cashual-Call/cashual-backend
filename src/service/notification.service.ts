import { prisma } from "../lib/prisma";
import {
	NotificationType,
	Notification,
	NotificationPriority as Priority,
} from "../generated/client";
import logger from "../config/logger";
import { pubClient } from "../lib/redis";
import { AvailableUserService } from "./available-user.service";

const SSE_CHANNEL_PREFIX = "sse:user:";
const presenceService = new AvailableUserService("presence");

export class NotificationService {
	private static async sendNotification(
		notification: Notification,
	): Promise<boolean> {
		try {
			const channel = `${SSE_CHANNEL_PREFIX}${notification.userId}`;
			await pubClient.publish(channel, JSON.stringify(notification));
			console.log("notification sent to user", notification.userId);
			return true;
		} catch (error) {
			logger.error(
				`Error sending notification to user ${notification.userId}:`,
				error,
			);
			return false;
		}
	}

	static async createNotification(
		userId: string,
		title: string,
		message: string,
		notificationType: NotificationType = NotificationType.SYSTEM_ANNOUNCEMENT,
		priority: Priority = Priority.NORMAL,
		metadata?: any,
	) {
		console.log("createNotification", {
			userId,
			title,
			message,
			priority,
			notificationType,
			metadata,
		});
		try {
			const isSent = await presenceService.isUserOnline(userId);
			if (!isSent) {
				console.log("notification not sent to user", userId);
			}
			const notification = await prisma.notification.create({
				data: {
					userId,
					title,
					message,
					data: metadata,
					type: notificationType,
					priority,
					isSent,
				},
			});

			if (isSent) {
				await this.sendNotification(notification);
			}
			return notification;
		} catch (error) {
			logger.error(`Failed to create notification for user ${userId}:`, error);
			throw new Error(`Failed to create notification: ${error}`);
		}
	}

	/**
	 * Delete a specific notification
	 */
	static async deleteNotification(
		notificationId: string,
		userId: string,
	): Promise<void> {
		try {
			const notification = await prisma.notification.findFirst({
				where: {
					id: notificationId,
					userId,
				},
			});

			if (!notification) {
				throw new Error("Notification not found or not owned by user");
			}

			await prisma.notification.delete({
				where: { id: notificationId },
			});
			logger.info(`Notification ${notificationId} deleted for user ${userId}`);
		} catch (error) {
			logger.error(`Failed to delete notification ${notificationId}:`, error);
			throw new Error(`Failed to delete notification: ${error}`);
		}
	}

	static async sendUnsentNotifications(userId?: string) {
		try {
			const userIds = userId ? [userId] : await presenceService.getUserIds();

			if (userIds.length === 0) return;

			const notifications = await prisma.notification.findMany({
				where: {
					isSent: false,
					userId: {
						in: userIds,
					},
				},
			});

			for (const notification of notifications) {
				try {
					const sent = await this.sendNotification(notification);
					if (sent) {
						await prisma.notification.delete({
							where: { id: notification.id },
						});
					}
				} catch (err) {
					logger.error(
						`Error sending unsent notification to user ${notification.userId}:`,
						err,
					);
				}
			}
		} catch (error) {
			logger.error("Failed to send unsent notifications:", error);
			throw new Error(`Failed to send unsent notifications: ${error}`);
		}
	}
}
