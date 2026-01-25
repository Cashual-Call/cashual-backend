import { prisma } from "../lib/prisma";
import {
	NotificationType,
	Notification,
	NotificationPriority as Priority,
} from "../generated/client";
import logger from "../config/logger";
import { MemoryService as Memory } from "./memory.service";

export class NotificationService {
	private static sendNotification(notification: Notification) {
		try {
			const client = Memory.getClient(notification.userId);
			if (!client || client.writableEnded) return;

			client.write(
				`event: notification\n` + `data: ${JSON.stringify(notification)}\n\n`,
			);
			console.log("notification sent to user", notification.userId);
		} catch (error) {
			logger.error(
				`Error sending notification to user ${notification.userId}:`,
				error,
			);
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
			const isSent = Memory.clientExists(userId);
			if (!isSent) {
				console.log("notification not sent to user", Memory.getAllClientIds());
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
				this.sendNotification(notification);
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
			const userIds = userId ? [userId] : Memory.getAllClientIds();

			if (userIds.length === 0) return;

			const notifications = await prisma.notification.findMany({
				where: {
					isSent: false,
					userId: {
						in: userIds,
					},
				},
			});

			notifications.forEach((notification) => {
				try {
					Memory.getClient(notification.userId)?.write(notification);
				} catch (err) {
					logger.error(
						`Error sending unsent notification to user ${notification.userId}:`,
						err,
					);
				}
			});
		} catch (error) {
			logger.error("Failed to send unsent notifications:", error);
			throw new Error(`Failed to send unsent notifications: ${error}`);
		}
	}
}
