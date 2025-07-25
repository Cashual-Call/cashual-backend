import { Router, RequestHandler } from "express";
import { validateResponse } from "../middleware/validate.middleware";
import { FriendsController } from "../controller/friend.controller";

const router = Router();

const friendsController = new FriendsController();

router.use(validateResponse);

router.get("/", friendsController.getFriendsList as RequestHandler);

router.get(
  "/suggestions",
  friendsController.getFriendSuggestions as RequestHandler
);

router.post(
  "/:friendId",
  friendsController.sendFriendRequest as RequestHandler
);

router.delete("/:friendId", friendsController.removeFriend as RequestHandler);

router.get(
  "/:friendId/status",
  friendsController.checkFriendshipStatus as RequestHandler
);

export default router;
