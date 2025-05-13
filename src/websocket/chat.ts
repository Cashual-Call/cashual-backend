import { Server, Socket } from "socket.io";
import ChatRoomService from "../service/chat-room.service";
import ChatDBService from "../service/chat-db.service";

const chatRoomService = new ChatRoomService();
const chatDBService = new ChatDBService();

interface ChatMessage {
  id: string;
  content: string;
  senderId: string;
  receiverId: string;
  timestamp: Date;
}

export function setupChatHandlers(io: Server) {
  io.of("/chat").on("connection", (socket: Socket) => {
    console.log("Chat client connected:", socket.id);

    // Join a chat room
    socket.on("join", async (roomId: string) => {
      socket.join(roomId);
      console.log(`Client ${socket.id} joined room ${roomId}`);
    });

    // Leave a chat room
    socket.on("leave", (roomId: string) => {
      socket.leave(roomId);
      console.log(`Client ${socket.id} left room ${roomId}`);
    });

    // Handle new messages
    socket.on(
      "message",
      async (data: Omit<ChatMessage, "id" | "timestamp">) => {
        try {
          // Get or create chat room
          let chatRoom = await chatRoomService.getChatRoomByUsers(data.senderId, data.receiverId);
          
          if (!chatRoom) {
            chatRoom = await chatRoomService.createChatRoom(data.senderId, data.receiverId);
          }

          // Add message to queue and get the result
          const message = await chatDBService.addMessage(
            data.content,
            data.senderId,
            data.receiverId,
            chatRoom.id
          );

          // Broadcast to the room
          io.of("/chat").to(chatRoom.id).emit("message", message);
        } catch (error) {
          console.error("Error saving message:", error);
          socket.emit("error", "Failed to send message");
        }
      }
    );

    socket.on("disconnect", () => {
      console.log("Chat client disconnected:", socket.id);
    });
  });
}
