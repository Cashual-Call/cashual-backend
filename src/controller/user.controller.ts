import { Request, Response } from "express";
import { UserService } from "../service/user.service";
import { redis } from "../lib/redis";
import { prisma } from "../lib/prisma";

export class UserController {
	private userService: UserService;
	private readonly CACHE_TTL = 3600;

	constructor() {
		this.userService = new UserService();

		this.getPoints = this.getPoints.bind(this);
		this.getUserPointsByDate = this.getUserPointsByDate.bind(this);
	}

	getAvailableAvatars = async (req: Request, res: Response) => {
		try {
			// Try to get from cache first
			const cachedAvatars = await redis.get("avatars:all");
			if (cachedAvatars) {
				return res.json(JSON.parse(cachedAvatars));
			}

			const avatars = this.userService.getAvailableAvatars();

			// Cache the avatars list
			await redis.setex("avatars:all", this.CACHE_TTL, JSON.stringify(avatars));

			res.json(avatars);
		} catch (error) {
			res.status(500).json({ error: "Failed to fetch avatars" });
		}
	};

	searchUsers = async (req: Request, res: Response) => {
		try {
			const { query } = req.query;

			if (!query || typeof query !== "string") {
				return res.status(400).json({ error: "Search query is required" });
			}

			// Check Redis cache first
			const cacheKey = `search:users:${query.toLowerCase()}`;
			const cachedResult = await redis.get(cacheKey);

			if (cachedResult) {
				return res.json({ data: JSON.parse(cachedResult) });
			}

			// Search for users by username containing the query
			const users = await this.userService.searchUsersByUsername(query);

			// Format the response data
			const formattedUsers = users.map((user) => ({
				id: user.id,
				username: user.username,
				avatarUrl: user.avatarUrl,
				gender: user.gender,
				isPro: user.isPro,
			}));

			// Cache the result for 5 minutes
			await redis.setex(cacheKey, 300, JSON.stringify(formattedUsers));

			res.json({ data: formattedUsers });
		} catch (error) {
			res.status(500).json({ error: "Failed to search users" });
		}
	};

	getPoints = async (req: Request, res: Response) => {
		const username = req.user?.username || "";
		const { startDate, endDate } = req.query;
		const points = await this.userService.getPoints(
			username,
			typeof startDate === "string" ? startDate : undefined,
			typeof endDate === "string" ? endDate : undefined,
		);
		res.json({ points });
	};

	getUserPointsByDate = async (req: Request, res: Response) => {
		const username = req.user?.username || "";
		const points = await this.userService.getUserPointsByDate(username);
		res.json({ points });
	};

	getRankings = async (_: Request, res: Response) => {
		const data = await this.userService.getRankings();
		res.json({ data });
	};

	getLuckyWinner = async (_: Request, res: Response) => {
		try {
			const cacheKey = "lucky_winner:latest";

			// Try to get from cache first
			const cached = await redis.get(cacheKey);
			if (cached) {
				return res.json({ data: JSON.parse(cached) });
			}

			const data = await prisma.luckyWinnerEntry.findFirst({
				orderBy: {
					createdAt: "desc",
				},
			});

			if (!data) {
				return res.json({ data: null });
			}

			// Cache the result for 2 hours (7200 seconds)
			await redis.setex(cacheKey, 7200, JSON.stringify(data));

			res.json({ data });
		} catch (error) {
			res.status(500).json({ error: "Failed to get lucky winner" });
		}
	};
}
