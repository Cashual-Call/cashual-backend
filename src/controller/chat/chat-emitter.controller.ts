import { Server, Namespace } from "socket.io";
import { subClient } from "../../lib/redis";
import { ChatEvent } from "../../config/websocket";
import { RedisHash } from "../../config/redis-hash";
import { Message } from "../../validation/chat.validation";

export class ChatEmitterController {
  private server: Server | Namespace;

  constructor(server: Server | Namespace) {
    this.server = server;
    this.handleRoomEvent = this.handleRoomEvent.bind(this);
    this.handleChatMessage = this.handleChatMessage.bind(this);
  }

  initializeSubscriptions() {
    // Subscribe to chat messages
    subClient.subscribe(RedisHash.CHAT_MESSAGES, (err, count) => {
      if (err) {
        console.error("Subscribe error:", err);
        return;
      }
      console.log(`Subscribed to ${count} channel(s)`);
    });
    
    subClient.on("message", (channel: string, message: any) => {
      if (channel === RedisHash.CHAT_MESSAGES) {
        try {
          const chatMessage: Message = JSON.parse(message);
          
          this.handleChatMessage(chatMessage);
        } catch (error) {
          console.error("Error parsing chat message:", error);
        }
      }
    });
  }

  private handleChatMessage(message: Message) {
    this.server.to(message.roomId).emit(ChatEvent.MESSAGE, message);
  }

  private handleRoomEvent(event: RoomEvent) {
    switch (event.type) {
      case "join":
        this.server.to(event.roomId).emit(ChatEvent.USER_JOINED, event);
        break;
      case "leave":
        this.server.to(event.roomId).emit(ChatEvent.USER_LEFT, event);
        break;
      case "typing":
        this.server.to(event.roomId).emit(ChatEvent.USER_TYPING, event);
        break;
      case "stopped_typing":
        this.server.to(event.roomId).emit(ChatEvent.USER_STOPPED_TYPING, event);
        break;
      case "connected":
        this.server.to(event.roomId).emit(ChatEvent.USER_CONNECTED, event);
        break;
      case "disconnected":
        this.server.to(event.roomId).emit(ChatEvent.USER_DISCONNECTED, event);
        break;
      default:
        console.warn("Unknown room event type:", event.type);
    }
  }
}