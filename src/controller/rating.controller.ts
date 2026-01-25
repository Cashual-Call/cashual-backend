import { Request, Response } from "express";
import { RatingService } from "../service/rating.service";

export class RatingController {
	private ratingService: RatingService;

	constructor() {
		this.ratingService = new RatingService();

		this.createRating = this.createRating.bind(this);
		this.getRatingsForUser = this.getRatingsForUser.bind(this);
		this.getMyRatingSummary = this.getMyRatingSummary.bind(this);
		this.getGivenRatings = this.getGivenRatings.bind(this);
	}

	createRating = async (req: Request, res: Response) => {
		try {
			const userId = req.user?.id;
			const { ratedUserId, rating } = req.body;

			if (!userId) {
				return res.status(401).json({ error: "Unauthorized" });
			}

			if (!ratedUserId || typeof ratedUserId !== "string") {
				return res.status(400).json({ error: "ratedUserId is required" });
			}

			const ratingValue = Number(rating);
			if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5) {
				return res
					.status(400)
					.json({ error: "rating must be an integer between 1 and 5" });
			}

			const createdRating = await this.ratingService.createOrUpdateRating({
				userId,
				ratedUserId,
				rating: ratingValue,
			});

			const summary = await this.ratingService.getRatingSummaryForUser(
				ratedUserId,
			);

			return res.status(201).json({
				success: true,
				data: createdRating,
				summary,
			});
		} catch (error) {
			if (error instanceof Error) {
				if (
					error.message === "Rater user not found" ||
					error.message === "Rated user not found"
				) {
					return res.status(404).json({ error: error.message });
				}
				if (error.message === "Cannot rate yourself") {
					return res.status(400).json({ error: error.message });
				}
			}
			return res.status(500).json({ error: "Failed to create rating" });
		}
	};

	getRatingsForUser = async (req: Request, res: Response) => {
		try {
			const { userId } = req.params;
			const skip = parseInt(req.query.skip as string) || 0;
			const take = parseInt(req.query.take as string) || 10;

			if (!userId) {
				return res.status(400).json({ error: "userId is required" });
			}

			const [ratingsResult, summary] = await Promise.all([
				this.ratingService.getRatingsForUser({ ratedUserId: userId, skip, take }),
				this.ratingService.getRatingSummaryForUser(userId),
			]);

			return res.json({
				success: true,
				data: ratingsResult.ratings,
				total: ratingsResult.total,
				summary,
				skip,
				take,
			});
		} catch (error) {
			return res.status(500).json({ error: "Failed to fetch user ratings" });
		}
	};

	getMyRatingSummary = async (req: Request, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) {
				return res.status(401).json({ error: "Unauthorized" });
			}

			const summary = await this.ratingService.getRatingSummaryForUser(userId);

			return res.json({
				success: true,
				data: summary,
			});
		} catch (error) {
			return res.status(500).json({ error: "Failed to fetch rating summary" });
		}
	};

	getGivenRatings = async (req: Request, res: Response) => {
		try {
			const userId = req.user?.id;
			const skip = parseInt(req.query.skip as string) || 0;
			const take = parseInt(req.query.take as string) || 10;

			if (!userId) {
				return res.status(401).json({ error: "Unauthorized" });
			}

			const result = await this.ratingService.getGivenRatings({
				userId,
				skip,
				take,
			});

			return res.json({
				success: true,
				data: result.ratings,
				total: result.total,
				skip,
				take,
			});
		} catch (error) {
			return res.status(500).json({ error: "Failed to fetch given ratings" });
		}
	};
}
