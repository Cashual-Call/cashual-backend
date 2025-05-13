import { Router, RequestHandler } from "express";
import { HistoryController } from "../controller/history.controller";
import { validateResponse } from "../middleware/validate.middleware";

const router = Router();

const historyController = new HistoryController();

router.use(validateResponse);

router.get("/chat", historyController.getChatHistory as RequestHandler);

export default router;
