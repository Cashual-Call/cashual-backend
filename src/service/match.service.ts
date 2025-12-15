import { AvailableUserService } from "./available-user.service";
import { redis } from "../lib/redis";
import { generateToken } from "../middleware/socket.middleware";
import RoomService from "./room.service";
import { RoomStateService } from "./room-state.service";
import { RoomType } from "@prisma/client";
import { FriendsService } from "./friend.service";
interface MatchPayload {
	userId: string;
	roomId: string;
	token: string;
	isFriend: boolean;
}

const setUserToPreventMatch = async (userId: string) => {
	await redis.set(`user_prevent_match:${userId}`, "true", "EX", 7);
};

const checkPrevent = async (userId: string): Promise<string | null> => {
	return await redis.get(`user_prevent_match:${userId}`);
};

export class MatchService {
	private searchType: string;
	public availableUserService: AvailableUserService;
	private roomService: RoomService;
	private roomStateService: RoomStateService;
	private friendService: FriendsService;

	constructor(searchType: string) {
		this.searchType = searchType;
		this.availableUserService = new AvailableUserService(searchType);
		this.roomService = new RoomService(
			searchType === "chat" ? RoomType.CHAT : RoomType.CALL,
		);
		this.roomStateService = new RoomStateService();
		this.friendService = new FriendsService();
	}

	async addUser(userId: string, username: string, interests: string[]) {
		console.log("addUser", userId, username, interests);
		const user = await this.availableUserService.addUser(
			userId,
			username,
			interests,
		);
		return user;
	}

	async removeUser(userId: string) {
		await this.availableUserService.removeUser(userId);
	}

	async updateUserHeartbeat(userId: string) {
		await this.availableUserService.updateUserHeartbeat(userId);
	}

	async cleanupInactiveUsers(timeoutMs?: number) {
		return await this.availableUserService.cleanupInactiveUsers(timeoutMs);
	}

	// always run after setMatch
	async getMatchedJWT(userId: string) {
		const resp = await redis.hget(`match:${this.searchType}:${userId}`, "data");

		if (resp) {
			const payload = JSON.parse(resp) as MatchPayload;
			await redis.hdel(`match:${this.searchType}:${userId}`, "data");
			return payload;
		} else {
			return null;
		}
	}

	async setMatch(
		user1: string,
		user2: string,
		user1Username: string = "",
		user2Username: string = "",
	) {
		// Batch all async operations that can run in parallel
		const [room, isFriend] = await Promise.all([
			this.roomService.createRoom(user1, user2, user1Username, user2Username),
			(
				await this.friendService.areFriends(
					user1Username || user1,
					user2Username || user2,
				)
			).areFriends,
		]);

		const roomId = room.id;

		// Initialize room state for heartbeat tracking
		const roomType = this.searchType as "chat" | "call";
		const roomStateInitialized =
			await this.roomStateService.initializeRoomState(
				roomId,
				roomType,
				user1,
				user2,
			);

		if (!roomStateInitialized) {
			console.warn(`Failed to initialize room state for room ${roomId}`);
		}

		const token1 = generateToken({
			senderId: user1,
			receiverId: user2,
			roomId,
			senderUsername: user1Username,
			receiverUsername: user2Username,
		});

		const token2 = generateToken({
			senderId: user2,
			receiverId: user1,
			roomId,
			senderUsername: user2Username,
			receiverUsername: user1Username,
		});

		// Batch user removal and match data storage in a single pipeline
		const pipeline = redis.pipeline();

		// Remove users from available pool
		// Get user interests first for efficient removal
		const [user1Interests, user2Interests] = await Promise.all([
			redis.zrange(`user_interests:${this.searchType}:${user1}`, 0, -1),
			redis.zrange(`user_interests:${this.searchType}:${user2}`, 0, -1),
		]);

		// Batch remove user1
		pipeline.zrem(`users:${this.searchType}`, user1);
		pipeline.del(`user:${this.searchType}:${user1}`);
		for (const interest of user1Interests) {
			pipeline.zrem(`interest:${this.searchType}:${interest}`, user1);
		}
		pipeline.del(`user_interests:${this.searchType}:${user1}`);

		// Batch remove user2
		pipeline.zrem(`users:${this.searchType}`, user2);
		pipeline.del(`user:${this.searchType}:${user2}`);
		for (const interest of user2Interests) {
			pipeline.zrem(`interest:${this.searchType}:${interest}`, user2);
		}
		pipeline.del(`user_interests:${this.searchType}:${user2}`);

		// Store the match data as JSON string under 'data' field
		pipeline.hset(
			`match:${this.searchType}:${user1}`,
			"data",
			JSON.stringify({
				userId: user2Username || user2,
				token: token1,
				roomId,
				isFriend,
			}),
		);

		pipeline.hset(
			`match:${this.searchType}:${user2}`,
			"data",
			JSON.stringify({
				userId: user1Username || user1,
				token: token2,
				roomId,
				isFriend,
			}),
		);

		await pipeline.exec();
	}

	async bestMatch() {
		const availableUsers = await this.availableUserService.getAvailableUsers();
		// console.log(`${this.searchType} availableUsers`, availableUsers);

		if (availableUsers.length < 2) {
			return;
		}

		// Create pairs and batch calculate common interests to reduce Redis calls
		const userPairs: Array<{
			user1: { userId: string; username: string; interests: string[] };
			user2: { userId: string; username: string; interests: string[] };
		}> = [];

		// Generate all valid pairs (excluding same username)
		for (let i = 0; i < availableUsers.length; i++) {
			for (let j = i + 1; j < availableUsers.length; j++) {
				const user1 = availableUsers[i];
				const user2 = availableUsers[j];

				// Skip matching users with the same username
				if (user1.username === user2.username) {
					continue;
				}

				userPairs.push({ user1, user2 });
			}
		}

		// Batch calculate common interests for all pairs
		const commonInterestsPromises = userPairs.map(async ({ user1, user2 }) => {
			const commonInterests =
				await this.availableUserService.getCommonInterests(
					user1.userId,
					user2.userId,
				);
			return {
				user1Id: user1.userId,
				user2Id: user2.userId,
				user1Username: user1.username,
				user2Username: user2.username,
				commonInterests,
				score: commonInterests.length,
			};
		});

		const pairScores = await Promise.all(commonInterestsPromises);

		// Sort pairs by score (descending) for optimal matching
		pairScores.sort((a, b) => b.score - a.score);

		// Keep track of matched users to avoid matching them again
		const matchedUsers = new Set<string>();
		const matchPromises: Promise<void>[] = [];

		// Greedily match pairs with highest scores first
		for (const pair of pairScores) {
			// Skip if either user is already matched
			if (matchedUsers.has(pair.user1Id) || matchedUsers.has(pair.user2Id)) {
				continue;
			}

			const prevent1 = await checkPrevent(pair.user1Id);
			const prevent2 = await checkPrevent(pair.user2Id);

			if (prevent1 || prevent2) {
				continue;
			}

			// Mark users as matched
			matchedUsers.add(pair.user1Id);
			matchedUsers.add(pair.user2Id);
			await setUserToPreventMatch(pair.user1Id);
			await setUserToPreventMatch(pair.user2Id);

			// Queue the match operation
			matchPromises.push(
				this.setMatch(
					pair.user1Id,
					pair.user2Id,
					pair.user1Username,
					pair.user2Username,
				).then(() => {
					console.log(
						`Matched users ${pair.user1Id} and ${pair.user2Id} with ${pair.score} common interests`,
					);
				}),
			);
		}

		// Handle remaining unmatched users with random pairing
		const unmatchedUsers = availableUsers.filter(
			(user) => !matchedUsers.has(user.userId),
		);

		// Randomly pair remaining users (avoiding same username)
		while (unmatchedUsers.length >= 2) {
			const user1 = unmatchedUsers.shift()!;
			const user2 = unmatchedUsers.shift()!;

			const prevent1 = await checkPrevent(user1.userId);
			const prevent2 = await checkPrevent(user2.userId);

			if (prevent1 || prevent2) {
				console.log(
					`Skipping match for users ${user1.userId} and ${user2.userId} because they are prevented from matching`,
				);
				continue;
			}

			matchPromises.push(
				this.setMatch(
					user1.userId,
					user2.userId,
					user1.username,
					user2.username,
				).then(() => {
					console.log(
						`Randomly matched users ${user1.userId} and ${user2.userId} (no common interests found)`,
					);
				}),
			);

			matchedUsers.add(user1.userId);
			matchedUsers.add(user2.userId);
		}

		// Execute all matches in parallel
		await Promise.all(matchPromises);

		const remainingUsers = availableUsers.filter(
			(user) => !matchedUsers.has(user.userId),
		);
		console.log(
			`Matching complete. ${remainingUsers.length} user(s) remaining in queue.`,
		);
	}
}
