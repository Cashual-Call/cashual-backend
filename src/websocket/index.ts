import { Server } from "socket.io";
import Redis from "ioredis";
import { setupChatHandlers } from "./chat";
// import { setupSearchHandlers } from './search';
import { setupCallHandlers } from "./call";
import { MatchService } from "../service/match.service";
import { verifyToken } from "../middleware/socket.middleware";

export function setupWebSocketHandlers(io: Server) {
	// Initialize match services for cleanup
	const matchServiceChat = new MatchService("chat");
	const matchServiceCall = new MatchService("call");

	// Initialize all WebSocket handlers
	setupChatHandlers(io);
	// setupSearchHandlers(io, redis);
	setupCallHandlers(io);

	// Global error handling
	io.on("error", (error) => {
		console.error("WebSocket server error:", error);
	});

	// Global connection handling
	io.on("connection", (socket) => {
		console.log("Client connected:", socket.id);

		// Store user ID from token for cleanup purposes
		let userId: string | null = null;

		try {
			const authToken = socket.handshake.auth.token;
			if (authToken) {
				const tokenData = verifyToken(authToken);
				userId = tokenData.senderId;
			}
		} catch (error) {
			console.warn("Failed to extract user ID from token:", error);
		}

		socket.on("error", (error) => {
			console.error(`Socket ${socket.id} error:`, error);
		});

		socket.on("disconnect", async (reason) => {
			console.log("Client disconnected:", socket.id, "Reason:", reason);

			// Clean up user from search queues if they were searching
			if (userId) {
				try {
					await matchServiceChat.removeUser(userId);
					await matchServiceCall.removeUser(userId);
					console.log(
						`[WebSocket] Cleaned up user ${userId} from search queues on disconnect`,
					);
				} catch (error) {
					console.warn(
						`[WebSocket] Failed to cleanup user ${userId} from search queues:`,
						error,
					);
				}
			}
		});
	});
}
