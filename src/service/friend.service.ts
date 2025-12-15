import { prisma } from "../lib/prisma";
import { User } from "@prisma/client";

export class FriendsService {
	/**
	 * Get all friends for a user (accepted and pending)
	 */
	async getFriendsList(username: string) {
		try {
			const friendships = await prisma.friendship.findMany({
				where: {
					OR: [{ username: username }, { friendId: username }],
				},
				include: {
					user: {
						select: {
							id: true,
							username: true,
							avatarUrl: true,
							isPro: true,
							interests: true,
						},
					},
					friend: {
						select: {
							id: true,
							username: true,
							avatarUrl: true,
							isPro: true,
							interests: true,
						},
					},
				},
				orderBy: {
					createdAt: "desc",
				},
			});

			// Map to return the friend's data with status
			const friends = friendships.map((friendship) => {
				const isCurrentUserRequester = friendship.username === username;
				const friend = isCurrentUserRequester
					? friendship.friend
					: friendship.user;

				// Determine the status from the current user's perspective
				let status: "accepted" | "pending_sent" | "pending_received";
				if (friendship.accepted) {
					status = "accepted";
				} else if (isCurrentUserRequester) {
					status = "pending_sent"; // Current user sent the request
				} else {
					status = "pending_received"; // Current user received the request
				}

				return {
					id: friend.id,
					username: friend.username,
					avatarUrl: friend.avatarUrl,
					isPro: friend.isPro,
					interests: friend.interests,
					friendshipDate: friendship.createdAt,
					friendshipId: friendship.id,
					status,
				};
			});

			return friends;
		} catch (error) {
			throw new Error(`Failed to get friends list: ${error}`);
		}
	}

	/**
	 * Send a friend request (create friendship)
	 */
	async sendFriendRequest(username: string, friendUsername: string) {
		try {
			// Validate input parameters
			if (!username || !friendUsername) {
				throw new Error("Username and friend username are required");
			}

			if (username === friendUsername) {
				throw new Error("Cannot send friend request to yourself");
			}

			// Check if users exist
			const [user, friend] = await Promise.all([
				prisma.user.findUnique({ where: { username: username } }),
				prisma.user.findUnique({ where: { username: friendUsername } }),
			]);

			if (!user) {
				throw new Error("User not found");
			}

			if (!friend) {
				throw new Error("Friend not found");
			}

			// Check if friendship already exists
			const existingFriendship = await prisma.friendship.findFirst({
				where: {
					OR: [
						{ username: username, friendId: friendUsername },
						{ username: friendUsername, friendId: username },
					],
				},
			});

			if (existingFriendship) {
				if (existingFriendship.accepted) {
					throw new Error("Friendship already exists");
				}

				// If the friend request was sent by the other party, accept it
				if (
					existingFriendship.username === friendUsername &&
					existingFriendship.friendId === username
				) {
					const acceptedFriendship = await prisma.friendship.update({
						where: { id: existingFriendship.id },
						data: { accepted: true },
						include: {
							friend: {
								select: {
									id: true,
									username: true,
									avatarUrl: true,
									isPro: true,
									interests: true,
								},
							},
						},
					});

					return {
						id: acceptedFriendship.friend.id,
						username: acceptedFriendship.friend.username,
						avatarUrl: acceptedFriendship.friend.avatarUrl,
						isPro: acceptedFriendship.friend.isPro,
						interests: acceptedFriendship.friend.interests,
						friendshipDate: acceptedFriendship.createdAt,
						friendshipId: acceptedFriendship.id,
					};
				} else {
					// Current user already sent the request
					throw new Error("Friendship already requested");
				}
			}

			// Create friendship
			const friendship = await prisma.friendship.create({
				data: {
					username: username,
					friendId: friendUsername,
				},
				include: {
					friend: {
						select: {
							id: true,
							username: true,
							avatarUrl: true,
							isPro: true,
							interests: true,
						},
					},
				},
			});

			return {
				id: friendship.friend.id,
				username: friendship.friend.username,
				avatarUrl: friendship.friend.avatarUrl,
				isPro: friendship.friend.isPro,
				interests: friendship.friend.interests,
				friendshipDate: friendship.createdAt,
				friendshipId: friendship.id,
			};
		} catch (error) {
			throw new Error(
				`Failed to send friend request: ${error} ${username} ${friendUsername}`,
			);
		}
	}

	/**
	 * Remove a friend
	 */
	async removeFriend(username: string, friendUsername: string) {
		try {
			// Get user by username to get their ID
			const user = await prisma.user.findUnique({
				where: { username: username },
				select: { id: true, username: true },
			});

			if (!user) {
				throw new Error("User not found");
			}

			const friendship = await prisma.friendship.findFirst({
				where: {
					OR: [
						{ username: username, friendId: friendUsername },
						{ username: friendUsername, friendId: username },
					],
				},
			});

			if (!friendship) {
				throw new Error("Friendship not found");
			}

			await prisma.friendship.delete({
				where: { id: friendship.id },
			});

			return { message: "Friend removed successfully" };
		} catch (error) {
			throw new Error(`Failed to remove friend: ${error}`);
		}
	}

	/**
	 * Check if two users are friends
	 */
	async areFriends(
		username: string,
		friendUsername: string,
		includeUsers: boolean = false,
	): Promise<{
		areFriends: boolean;
		user?: User;
		friend?: User;
	}> {
		try {
			const friendship = await prisma.friendship.findFirst({
				where: {
					OR: [
						{ username: username, friendId: friendUsername },
						{ username: friendUsername, friendId: username },
					],
				},
				include: {
					user: includeUsers,
					friend: includeUsers,
				},
			});

			if (!friendship) {
				return {
					areFriends: false,
				};
			}

			return {
				areFriends: true,
				user: friendship?.user,
				friend: friendship?.friend,
			};
		} catch (error) {
			throw new Error(`Failed to check friendship status: ${error}`);
		}
	}

	/**
	 * Get friend suggestions (users who are not friends yet)
	 */
	async getFriendSuggestions(username: string, limit: number = 10) {
		try {
			// Get user by username to get their ID
			const user = await prisma.user.findUnique({
				where: { username: username },
				select: { id: true },
			});

			if (!user) {
				throw new Error("User not found");
			}

			// Get current friend usernames
			const friendships = await prisma.friendship.findMany({
				where: {
					OR: [{ username: username }, { friendId: username }],
				},
				select: {
					username: true,
					friendId: true,
				},
			});

			const friendUsernames = friendships.map((f) =>
				f.username === username ? f.friendId : f.username,
			);

			// Get users who are not friends and not the current user
			const suggestions = await prisma.user.findMany({
				where: {
					AND: [
						{ username: { not: username } },
						{ username: { notIn: friendUsernames } },
						{ isBanned: false },
					],
				},
				select: {
					id: true,
					username: true,
					avatarUrl: true,
					isPro: true,
					interests: true,
				},
				take: limit,
				orderBy: {
					createdAt: "desc",
				},
			});

			return suggestions;
		} catch (error) {
			throw new Error(`Failed to get friend suggestions: ${error}`);
		}
	}

	/**
	 * Get pending friend requests for a user
	 */
	async getPendingRequests(username: string) {
		try {
			const user = await prisma.user.findUnique({
				where: { username: username },
			});

			if (!user) {
				throw new Error("User not found");
			}

			// Get pending requests where user is the recipient (friendId)
			const pendingRequests = await prisma.friendship.findMany({
				where: {
					friendId: user.id,
					accepted: false,
				},
				include: {
					user: {
						select: {
							id: true,
							username: true,
							avatarUrl: true,
							isPro: true,
							interests: true,
						},
					},
				},
				orderBy: {
					createdAt: "desc",
				},
			});

			// Map to return the requester's data
			const requests = pendingRequests.map((request) => ({
				id: request.id,
				requester: {
					id: request.user.id,
					username: request.user.username,
					avatarUrl: request.user.avatarUrl,
					isPro: request.user.isPro,
					interests: request.user.interests,
				},
				requestDate: request.createdAt,
			}));

			return requests;
		} catch (error) {
			throw new Error(`Failed to get pending requests: ${error}`);
		}
	}

	/**
	 * Accept a pending friend request
	 */
	async acceptFriendRequest(friendshipId: string) {
		try {
			const friendship = await prisma.friendship.findUnique({
				where: { id: friendshipId },
				include: {
					user: {
						select: {
							username: true,
						},
					},
					friend: {
						select: {
							username: true,
						},
					},
				},
			});

			if (!friendship) {
				throw new Error("Friendship not found");
			}

			if (friendship.accepted) {
				throw new Error("Friendship already accepted");
			}

			await prisma.friendship.update({
				where: { id: friendship.id },
				data: { accepted: true },
			});

			return { message: "Friend request accepted successfully" };
		} catch (error) {
			throw new Error(`Failed to accept friend request: ${error}`);
		}
	}

	/**
	 * Reject a pending friend request
	 */
	async rejectFriendRequest(friendshipId: string) {
		try {
			const friendship = await prisma.friendship.findUnique({
				where: { id: friendshipId },
				include: {
					user: {
						select: {
							username: true,
						},
					},
					friend: {
						select: {
							username: true,
						},
					},
				},
			});

			if (!friendship) {
				throw new Error("Friendship not found");
			}

			if (friendship.accepted) {
				throw new Error("Cannot reject an already accepted friendship");
			}

			// Delete the friendship request
			await prisma.friendship.delete({
				where: { id: friendship.id },
			});

			return { message: "Friend request rejected successfully" };
		} catch (error) {
			throw new Error(`Failed to reject friend request: ${error}`);
		}
	}
}
