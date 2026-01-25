import { Router, RequestHandler } from "express";
import { HistoryController } from "../controller/history.controller";
import { validateResponse } from "../middleware/validate.middleware";
import { requirePro, verifyToken } from "../middleware/auth.middleware";

const router = Router();

const historyController = new HistoryController();

router.use(validateResponse);

router.get(
	"/chat",
	verifyToken,
	requirePro,
	historyController.getRooms as RequestHandler,
);
router.get(
	"/call",
	verifyToken,
	requirePro,
	historyController.getCallHistory as RequestHandler,
);
router.get("/global-chats", historyController.getGlobalChats as RequestHandler);
// router.get("/rooms", historyController.getRooms as RequestHandler);

export default router;
