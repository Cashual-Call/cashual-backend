import { NotificationService } from "./notification.service";
import { MatchService } from "./match.service";
import { generateToken } from "../middleware/socket.middleware";
import { User } from "../generated/client";

export class FriendChatService {
	private notificationService: NotificationService;
	private matchService: MatchService;

	constructor(searchType: "chat" | "call") {
		this.notificationService = new NotificationService();
		this.matchService = new MatchService(searchType);
	}

	private createRoomId = async (user1: string, user2: string) => {
		const pairKey = (a: string | number, b: string | number): string =>
			a < b ? `${a}|${b}` : `${b}|${a}`;

		return pairKey(user1, user2);
	};

	startChat = async (user1: User, user2: User) => {
		const user1username = user1.displayUsername || user1.username || user1.id;
		const user2username = user2.displayUsername || user2.username || user2.id;
		const roomId = await this.createRoomId(user1username, user2username);

		// creation of chat room
		const token1 = generateToken(
			{
				senderId: user1username,
				receiverId: user2username,
				roomId,
			},
			"100y",
		);
		const token2 = generateToken(
			{
				senderId: user2username,
				receiverId: user1username,
				roomId,
			},
			"100y",
		);

		return { token1, token2 };
	};
}
