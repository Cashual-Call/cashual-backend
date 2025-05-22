import { Router, RequestHandler } from "express";
import { SearchController } from "../controller/search.controller";
import { validateResponse } from "../middleware/validate.middleware";

const callSearchController = new SearchController("call");
const chatSearchController = new SearchController("chat");

const router = Router();

router.use(validateResponse);

router.post("/call/start-search/:userId", callSearchController.startSearch as RequestHandler);
router.post("/call/stop-search/:userId", callSearchController.stopSearch as RequestHandler);
router.get("/call/:userId", callSearchController.getMatch as RequestHandler);

router.post("/chat/start-search/:userId", chatSearchController.startSearch as RequestHandler);
router.post("/chat/stop-search/:userId", chatSearchController.stopSearch as RequestHandler);
router.get("/chat/:userId", chatSearchController.getMatch as RequestHandler);

export default router;
