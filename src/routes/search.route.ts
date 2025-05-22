import { Router, RequestHandler } from "express";
import { SearchController } from "../controller/search.controller";
import { validateResponse } from "../middleware/validate.middleware";

const searchController = new SearchController("chat");

const router = Router();

router.use(validateResponse);

router.post("/start-search/:userId", searchController.startSearch as RequestHandler);
router.post("/stop-search/:userId", searchController.stopSearch as RequestHandler);
router.get("/:userId", searchController.getMatch as RequestHandler);

export default router;
