import { Router, Response } from "express";
import { verifyToken } from "../middleware/auth.middleware";
import { MemoryService as Memory } from "../service/memory.service";
import { NotificationService } from "../service/notification.service";

const router = Router();

router.get("/events", verifyToken, async (req, res) => {
	res.setHeader("Content-Type", "text/event-stream");
	res.setHeader("Cache-Control", "no-cache");
	res.setHeader("Connection", "keep-alive");
	res.flushHeaders();

	const userId = req.user?.id;

	if (!userId) {
		return;
	}

	Memory.addClient(userId, res);

	res.write(
		`event: ping\n` +
			`data: ${JSON.stringify({ total_users: Memory.totalClients() })}\n\n`,
	);
	NotificationService.sendUnsentNotifications(userId);

	req.on("close", async () => {
		Memory.removeClient(userId);
	});
});

export default router;
