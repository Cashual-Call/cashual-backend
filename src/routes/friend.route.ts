import { Router, RequestHandler } from "express";
import { validateResponse } from "../middleware/validate.middleware";
import { FriendsController } from "../controller/friend.controller";
import { verifyToken } from "../middleware/auth.middleware";
import { FriendChatController } from "../controller/friend-chat.controller";

const router = Router();

const friendsController = new FriendsController();
const friendChatController = new FriendChatController("chat");
const friendCallController = new FriendChatController("call");

router.use(validateResponse);
router.use(verifyToken);

router.get("/", friendsController.getFriendsList as RequestHandler);

router.get("/pending", friendsController.getPendingRequests as RequestHandler);

router.get(
	"/suggestions",
	friendsController.getFriendSuggestions as RequestHandler,
);

router.post(
	"/accept/:friendshipId",
	friendsController.acceptFriendRequest as RequestHandler,
);

router.post(
	"/reject/:friendshipId",
	friendsController.rejectFriendRequest as RequestHandler,
);

router.post(
	"/:friendId",
	friendsController.sendFriendRequest as RequestHandler,
);

router.delete("/:friendId", friendsController.removeFriend as RequestHandler);

router.post(
	"/:friendId/cancel",
	friendsController.cancelFriendRequest as RequestHandler,
);

router.get(
	"/:friendId/status",
	friendsController.checkFriendshipStatus as RequestHandler,
);

router.post("/:friend/chat", friendChatController.startChat as RequestHandler);

router.post("/:friend/call", friendCallController.startChat as RequestHandler);

export default router;
