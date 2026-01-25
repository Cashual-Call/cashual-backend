import { Router, RequestHandler } from "express";
import { RatingController } from "../controller/rating.controller";
import { verifyToken } from "../middleware/auth.middleware";

const ratingController = new RatingController();
const router = Router();

router.post("/", verifyToken, ratingController.createRating as RequestHandler);
router.get(
	"/user/:userId",
	verifyToken,
	ratingController.getRatingsForUser as RequestHandler,
);
router.get(
	"/me/summary",
	verifyToken,
	ratingController.getMyRatingSummary as RequestHandler,
);
router.get(
	"/me/given",
	verifyToken,
	ratingController.getGivenRatings as RequestHandler,
);

export default router;
