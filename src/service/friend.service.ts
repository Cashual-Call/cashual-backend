import {prisma} from "../lib/prisma";
import {
	NotificationPriority,
	NotificationType,
	User,
} from "../generated/client";
import { NotificationService } from "./notification.service";
import { redis } from "../lib/redis";

export class FriendsService {
	// Cache TTLs (in seconds)
	private static readonly CACHE_TTL = {
		FRIENDS_LIST: 300, // 5 minutes
		FRIENDSHIP_STATUS: 600, // 10 minutes
		SUGGESTIONS: 1800, // 30 minutes
		PENDING_REQUESTS: 180, // 3 minutes
	};

	// Cache key generators
	private static getCacheKey = {
		friendsList: (userId: string) => `friends:list:${userId}`,
		friendshipStatus: (userId: string, friendId: string) => 
			`friends:status:${[userId, friendId].sort().join(":")}`,
		suggestions: (userId: string) => `friends:suggestions:${userId}`,
		pendingRequests: (userId: string) => `friends:pending:${userId}`,
	};

	/* ----------------------------- helpers ----------------------------- */

	private async resolveUser(input: string) {
		return prisma.user.findFirst({
			where: {
				OR: [{ username: input }, { displayUsername: input }, { name: input }],
			},
			select: {
				id: true,
				username: true,
				avatarUrl: true,
				isPro: true,
				interests: true,
			},
		});
	}

	/**
	 * Invalidate all friendship-related caches for a user
	 */
	private async invalidateUserCaches(userId: string) {
		const keys = [
			FriendsService.getCacheKey.friendsList(userId),
			FriendsService.getCacheKey.suggestions(userId),
			FriendsService.getCacheKey.pendingRequests(userId),
		];
		await redis.del(...keys);
	}

	/**
	 * Invalidate friendship status cache between two users
	 */
	private async invalidateFriendshipStatusCache(userId: string, friendId: string) {
		const key = FriendsService.getCacheKey.friendshipStatus(userId, friendId);
		await redis.del(key);
	}

	/* -------------------------- get friends list ------------------------ */

	/**
	 * Get friends list for a user by user ID.
	 * Returns an array of users with friendship status ("accepted", "pending_sent", "pending_received")
	 */
	async getFriendsListById(userId: string) {
		const cacheKey = FriendsService.getCacheKey.friendsList(userId);

		// Try to get from cache
		const cached = await redis.get(cacheKey);
		if (cached) {
			return JSON.parse(cached);
		}

		const friendships = await prisma.friendship.findMany({
			where: {
				OR: [{ userId: userId }, { friendId: userId }],
			},
			include: {
				user: true,
				friend: true,
			},
			orderBy: { createdAt: "desc" },
		});

		const result = friendships.map((f) => {
			const isRequester = f.userId === userId;
			const other = isRequester ? f.friend : f.user;

			let status: "accepted" | "pending_sent" | "pending_received";
			if (f.accepted) status = "accepted";
			else status = isRequester ? "pending_sent" : "pending_received";

			return {
				id: other.id,
				username: other.username,
				avatarUrl: other.avatarUrl,
				isPro: other.isPro,
				interests: other.interests,
				friendshipId: f.id,
				friendshipDate: f.createdAt,
				status,
			};
		});

		// Cache the result
		await redis.setex(
			cacheKey,
			FriendsService.CACHE_TTL.FRIENDS_LIST,
			JSON.stringify(result)
		);

		return result;
	}

	async getFriendsListByUsername(username: string) {
		const user = await this.resolveUser(username);
		if (!user) throw new Error("User not found");
		return this.getFriendsListById(user.id);
	}

	/* ------------------------- send friend request ---------------------- */

	/**
	 * Send a friend request by user IDs
	 * @param userId The user ID of the sender
	 * @param friendId The user ID of the friend (recipient)
	 */
	async sendFriendRequest(userId: string, friendId: string) {
		if (!userId || !friendId) {
			throw new Error("UserId and friendId are required");
		}
		if (userId === friendId) {
			throw new Error("Cannot send friend request to yourself");
		}

		// Fetch user and friend by IDs
		const [user, friend] = await Promise.all([
			prisma.user.findUnique({ where: { id: userId } }),
			prisma.user.findUnique({ where: { id: friendId } }),
		]);

		if (!user) throw new Error("User not found");
		if (!friend) throw new Error("Friend not found");

		const existing = await prisma.friendship.findFirst({
			where: {
				OR: [
					{ userId: user.id, friendId: friend.id },
					{ userId: friend.id, friendId: user.id },
				],
			},
		});

		if (existing) {
			if (existing.accepted) {
				throw new Error("Friendship already exists");
			}

			// Incoming request → accept
			if (existing.userId === friend.id) {
				const accepted = await prisma.friendship.update({
					where: { id: existing.id },
					data: { accepted: true },
					include: { user: true },
				});

				await NotificationService.createNotification(
					friend.id,
					"Friend request accepted",
					`You are now friends with ${user.username}`,
					NotificationType.FRIEND_ACCEPTED,
					NotificationPriority.NORMAL,
				);
				await NotificationService.createNotification(
					user.id,
					"Friend request accepted",
					`You are now friends with ${friend.username}`,
					NotificationType.FRIEND_ACCEPTED,
					NotificationPriority.NORMAL,
				);

				// Invalidate caches for both users
				await Promise.all([
					this.invalidateUserCaches(user.id),
					this.invalidateUserCaches(friend.id),
					this.invalidateFriendshipStatusCache(user.id, friend.id),
				]);

				return {
					id: accepted.user.id,
					username: accepted.user.username,
					avatarUrl: accepted.user.avatarUrl,
					isPro: accepted.user.isPro,
					interests: accepted.user.interests,
					friendshipId: accepted.id,
					friendshipDate: accepted.createdAt,
				};
			}

			throw new Error("Friend request already sent");
		}

		const friendship = await prisma.friendship.create({
			data: {
				userId: user.id,
				friendId: friend.id,
			},
			include: { friend: true },
		});

		await NotificationService.createNotification(
			friend.id,
			"Friend request received",
			`You have a new friend request from ${user.username || user.id || "Unknown"}`,
			NotificationType.FRIEND_REQUEST,
			NotificationPriority.NORMAL,
		);

		// Invalidate caches for both users
		await Promise.all([
			this.invalidateUserCaches(user.id),
			this.invalidateUserCaches(friend.id),
			this.invalidateFriendshipStatusCache(user.id, friend.id),
		]);

		return {
			id: friendship.friend.id,
			username: friendship.friend.username,
			avatarUrl: friendship.friend.avatarUrl,
			isPro: friendship.friend.isPro,
			interests: friendship.friend.interests,
			friendshipId: friendship.id,
			friendshipDate: friendship.createdAt,
		};
	}

	/* --------------------------- remove friend -------------------------- */

	async removeFriend(username: string, friendUsername: string) {
		const [user, friend] = await Promise.all([
			this.resolveUser(username),
			this.resolveUser(friendUsername),
		]);

		if (!user || !friend) throw new Error("User not found");

		const friendship = await prisma.friendship.findFirst({
			where: {
				OR: [
					{ userId: user.id, friendId: friend.id },
					{ userId: friend.id, friendId: user.id },
				],
			},
		});

		if (!friendship) throw new Error("Friendship not found");

		await prisma.friendship.delete({ where: { id: friendship.id } });

		// Invalidate caches for both users
		await Promise.all([
			this.invalidateUserCaches(user.id),
			this.invalidateUserCaches(friend.id),
			this.invalidateFriendshipStatusCache(user.id, friend.id),
		]);

		return { message: "Friend removed successfully" };
	}

	/* ---------------------------- are friends --------------------------- */

	async areFriends(
		userId: string,
		friendId: string,
		includeUsers = false,
	): Promise<{
		areFriends: boolean;
		status: "accepted" | "pending_sent" | "pending_received" | "none";
		user?: User;
		friend?: User;
	}> {
		const friendship = await prisma.friendship.findFirst({
			where: {
				OR: [
					{ userId: userId, friendId: friendId },
					{ userId: friendId, friendId: userId },
				],
			},
			include: includeUsers
				? {
						user: true,
						friend: true,
					}
				: undefined,
		});

		const cacheKey = FriendsService.getCacheKey.friendshipStatus(userId, friendId);

		if (!friendship) {
			const result = { areFriends: false, status: "none" as const };
			await redis.setex(
				cacheKey,
				FriendsService.CACHE_TTL.FRIENDSHIP_STATUS,
				JSON.stringify(result)
			);
			return result;
		}

		const status = friendship.accepted
			? "accepted"
			: friendship.userId === userId
				? "pending_sent"
				: "pending_received";

		const result = {
			areFriends: true,
			status: status,
			user: undefined,
			friend: undefined,
		};

		// Cache only if not including users
		if (!includeUsers) {
			await redis.setex(
				cacheKey,
				FriendsService.CACHE_TTL.FRIENDSHIP_STATUS,
				JSON.stringify(result)
			);
		}

		return result;
	}

	/* ----------------------- friend suggestions ------------------------- */

	async getFriendSuggestions(userId: string, limit = 10) {
		const cacheKey = FriendsService.getCacheKey.suggestions(userId);

		// Try to get from cache
		const cached = await redis.get(cacheKey);
		if (cached) {
			return JSON.parse(cached);
		}

		const friendships = await prisma.friendship.findMany({
			where: {
				OR: [{ userId: userId }, { friendId: userId }],
			},
			select: {
				userId: true,
				friendId: true,
			},
		});

		const blockedIds = new Set(
			friendships.flatMap((f) => [f.userId, f.friendId]),
		);
		blockedIds.add(userId);

		const suggestions = await prisma.user.findMany({
			where: {
				id: { notIn: Array.from(blockedIds) },
				isBanned: false,
			},
			select: {
				id: true,
				username: true,
				avatarUrl: true,
				isPro: true,
				interests: true,
			},
			take: limit,
			orderBy: { createdAt: "desc" },
		});

		// Cache the result
		await redis.setex(
			cacheKey,
			FriendsService.CACHE_TTL.SUGGESTIONS,
			JSON.stringify(suggestions)
		);

		return suggestions;
	}

	/* ------------------------ pending requests -------------------------- */

	async getPendingRequests(username: string) {
		const user = await this.resolveUser(username);
		if (!user) throw new Error("User not found");

		const cacheKey = FriendsService.getCacheKey.pendingRequests(user.id);

		// Try to get from cache
		const cached = await redis.get(cacheKey);
		if (cached) {
			return JSON.parse(cached);
		}

		const requests = await prisma.friendship.findMany({
			where: {
				friendId: user.id,
				accepted: false,
			},
			include: { user: true },
			orderBy: { createdAt: "desc" },
		});

		const result = requests.map((r) => ({
			id: r.id,
			requester: {
				id: r.user.id,
				username: r.user.username,
				avatarUrl: r.user.avatarUrl,
				isPro: r.user.isPro,
				interests: r.user.interests,
			},
			requestDate: r.createdAt,
		}));

		// Cache the result
		await redis.setex(
			cacheKey,
			FriendsService.CACHE_TTL.PENDING_REQUESTS,
			JSON.stringify(result)
		);

		return result;
	}

	/* -------------------- accept / reject request ----------------------- */

	async acceptFriendRequest(friendshipId: string) {
		const friendship = await prisma.friendship.findUnique({
			where: { id: friendshipId },
		});

		if (!friendship) throw new Error("Friendship not found");
		if (friendship.accepted) throw new Error("Already accepted");

		await prisma.friendship.update({
			where: { id: friendshipId },
			data: { accepted: true },
		});

		// Invalidate caches for both users
		await Promise.all([
			this.invalidateUserCaches(friendship.userId),
			this.invalidateUserCaches(friendship.friendId),
			this.invalidateFriendshipStatusCache(friendship.userId, friendship.friendId),
		]);

		return { message: "Friend request accepted successfully" };
	}

	async rejectFriendRequest(friendshipId: string) {
		const friendship = await prisma.friendship.findUnique({
			where: { id: friendshipId },
		});

		if (!friendship) throw new Error("Friendship not found");
		if (friendship.accepted) {
			throw new Error("Cannot reject an accepted friendship");
		}

		await prisma.friendship.delete({ where: { id: friendshipId } });

		// Invalidate caches for both users
		await Promise.all([
			this.invalidateUserCaches(friendship.userId),
			this.invalidateUserCaches(friendship.friendId),
			this.invalidateFriendshipStatusCache(friendship.userId, friendship.friendId),
		]);

		return { message: "Friend request rejected successfully" };
	}
}