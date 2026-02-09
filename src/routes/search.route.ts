import { Router, RequestHandler } from "express";
import { SearchController } from "../controller/search.controller";
import { validateResponse } from "../middleware/validate.middleware";
import { verifyToken } from "../middleware/auth.middleware";
import { UserController } from "../controller/user.controller";

const callSearchController = new SearchController("call");
const chatSearchController = new SearchController("chat");
const userController = new UserController();

const router = Router();

router.use(validateResponse);
router.use(verifyToken);

router.post(
	"/call/start-search/:userId",
	callSearchController.startSearch as RequestHandler,
);
router.post(
	"/call/stop-search/:userId",
	callSearchController.stopSearch as RequestHandler,
);
router.post(
	"/call/heartbeat/:userId",
	callSearchController.heartbeat as RequestHandler,
);

// create public room token
router.post(
	"/public-room",
	chatSearchController.createPublicRoom as RequestHandler,
);

router.post(
	"/chat/start-search/:userId",
	chatSearchController.startSearch as RequestHandler,
);
router.post(
	"/chat/stop-search/:userId",
	chatSearchController.stopSearch as RequestHandler,
);
router.post(
	"/chat/heartbeat/:userId",
	chatSearchController.heartbeat as RequestHandler,
);

router.post(
	"/chat/start-direct",
	chatSearchController.startDirectChat as RequestHandler,
);

router.post(
	"/chat/accept-direct",
	chatSearchController.acceptDirectChat as RequestHandler,
);

router.post(
	"/chat/decline-direct",
	chatSearchController.declineDirectChat as RequestHandler,
);

router.get("/", userController.searchUsers as RequestHandler);

export default router;
