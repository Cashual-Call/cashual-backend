import { Router, RequestHandler } from "express";
import { validateResponse } from "../middleware/validate.middleware";
import { NotificationController } from "../controller/notification.controller";
import { verifyToken } from "../middleware/auth.middleware";

const router = Router();

const notificationController = new NotificationController();

// Apply middleware
router.use(validateResponse);
router.use(verifyToken);

// Push notification subscription endpoints
router.post(
	"/subscribe",
	notificationController.subscribeToPush as RequestHandler,
);
router.delete(
	"/unsubscribe",
	notificationController.unsubscribeFromPush as RequestHandler,
);

// Frontend compatibility endpoints
router.post(
	"/save-subscription",
	notificationController.saveSubscription as RequestHandler,
);
router.post(
	"/verify-subscription",
	notificationController.verifySubscription as RequestHandler,
);

// Core notification management endpoints
router.get("/", notificationController.getNotifications as RequestHandler);
router.get(
	"/unread-count",
	notificationController.getUnreadCount as RequestHandler,
);
router.patch("/:id/read", notificationController.markAsRead as RequestHandler);
router.patch(
	"/read-all",
	notificationController.markAllAsRead as RequestHandler,
);
router.delete(
	"/:id",
	notificationController.deleteNotification as RequestHandler,
);
router.delete(
	"/clear-all",
	notificationController.clearAllNotifications as RequestHandler,
);

// Advanced notification features
router.get(
	"/history",
	notificationController.getNotificationHistory as RequestHandler,
);
router.post(
	"/bulk-actions",
	notificationController.bulkActions as RequestHandler,
);

// Notification preferences
router.get(
	"/preferences",
	notificationController.getNotificationPreferences as RequestHandler,
);
router.put(
	"/preferences",
	notificationController.updateNotificationPreferences as RequestHandler,
);

// Administrative endpoints
router.post("/send", notificationController.sendNotification as RequestHandler);
router.post(
	"/broadcast",
	notificationController.broadcastNotification as RequestHandler,
);
router.post(
	"/schedule",
	notificationController.scheduleNotification as RequestHandler,
);
router.get(
	"/analytics",
	notificationController.getNotificationAnalytics as RequestHandler,
);

// Utility endpoints
router.get(
	"/types",
	notificationController.getNotificationTypes as RequestHandler,
);
router.post(
	"/test-push",
	notificationController.testPushNotification as RequestHandler,
);

export default router;
