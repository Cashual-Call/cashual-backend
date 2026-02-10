import { Router, RequestHandler } from "express";
import { FriendChatController } from "../controller/friend-chat.controller";
import { validateResponse } from "../middleware/validate.middleware";
import { verifyToken } from "../middleware/auth.middleware";

const router = Router();
const friendChatController = new FriendChatController("chat");

router.use(validateResponse);
router.use(verifyToken);

router.get(
	"/rooms/:roomId/messages",
	friendChatController.getMessages as RequestHandler,
);
router.post(
	"/rooms/:roomId/messages",
	friendChatController.sendMessage as RequestHandler,
);

export default router;
