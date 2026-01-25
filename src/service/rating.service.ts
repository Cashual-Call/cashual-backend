import { Rating } from "../generated/client";
import { prisma } from "../lib/prisma";

const USER_SELECT = {
	id: true,
	username: true,
	name: true,
	avatarUrl: true,
	image: true,
};

export class RatingService {
	constructor() {
		this.createOrUpdateRating = this.createOrUpdateRating.bind(this);
		this.getRatingSummaryForUser = this.getRatingSummaryForUser.bind(this);
		this.getRatingsForUser = this.getRatingsForUser.bind(this);
		this.getGivenRatings = this.getGivenRatings.bind(this);
	}

	async createOrUpdateRating(params: {
		userId: string;
		ratedUserId: string;
		rating: number;
	}): Promise<Rating> {
		const { userId, ratedUserId, rating } = params;
		try {
			const [rater, ratedUser] = await Promise.all([
				prisma.user.findUnique({ where: { id: userId } }),
				prisma.user.findUnique({ where: { id: ratedUserId } }),
			]);

			if (!rater) {
				throw new Error("Rater user not found");
			}

			if (!ratedUser) {
				throw new Error("Rated user not found");
			}

			if (userId === ratedUserId) {
				throw new Error("Cannot rate yourself");
			}

			const existing = await prisma.rating.findFirst({
				where: { userId, ratedUserId },
			});

			if (existing) {
				return await prisma.rating.update({
					where: { id: existing.id },
					data: { rating },
				});
			}

			return await prisma.rating.create({
				data: {
					userId,
					ratedUserId,
					rating,
				},
			});
		} catch (error) {
			if (error instanceof Error) {
				throw error;
			}
			throw new Error("Failed to create rating");
		}
	}

	async getRatingSummaryForUser(userId: string): Promise<{
		average: number;
		count: number;
	}> {
		try {
			const result = await prisma.rating.aggregate({
				where: { ratedUserId: userId },
				_avg: { rating: true },
				_count: { rating: true },
			});
			return {
				average: result._avg.rating ?? 0,
				count: result._count.rating,
			};
		} catch (error) {
			throw new Error("Failed to fetch rating summary");
		}
	}

	async getRatingsForUser(params: {
		ratedUserId: string;
		skip?: number;
		take?: number;
	}): Promise<{
		ratings: Rating[];
		total: number;
	}> {
		const { ratedUserId, skip = 0, take = 10 } = params;
		try {
			const [ratings, total] = await Promise.all([
				prisma.rating.findMany({
					where: { ratedUserId },
					skip,
					take,
					orderBy: { createdAt: "desc" },
					include: {
						user: { select: USER_SELECT },
					},
				}),
				prisma.rating.count({ where: { ratedUserId } }),
			]);
			return { ratings, total };
		} catch (error) {
			throw new Error("Failed to fetch ratings for user");
		}
	}

	async getGivenRatings(params: {
		userId: string;
		skip?: number;
		take?: number;
	}): Promise<{
		ratings: Rating[];
		total: number;
	}> {
		const { userId, skip = 0, take = 10 } = params;
		try {
			const [ratings, total] = await Promise.all([
				prisma.rating.findMany({
					where: { userId },
					skip,
					take,
					orderBy: { createdAt: "desc" },
					include: {
						ratedUser: { select: USER_SELECT },
					},
				}),
				prisma.rating.count({ where: { userId } }),
			]);
			return { ratings, total };
		} catch (error) {
			throw new Error("Failed to fetch given ratings");
		}
	}
}
