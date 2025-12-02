import { Server, Namespace } from "socket.io";
import { subClient } from "../../lib/redis";
import { ChatEvent } from "../../config/websocket";
import { RedisHash } from "../../config/redis-hash";
import { Message } from "../../validation/chat.validation";

export class ChatEmitterController {
  private server: Server | Namespace;
  private isInitialized: boolean = false;

  constructor(server: Server | Namespace) {
    this.server = server;
    this.handleRoomEvent = this.handleRoomEvent.bind(this);
    this.handleChatMessage = this.handleChatMessage.bind(this);
  }

  initializeSubscriptions() {
    // Prevent multiple initializations
    if (this.isInitialized) {
      console.log("Chat subscriptions already initialized, skipping");
      return;
    }

    this.setupSubscriptions();
    this.isInitialized = true;
  }

  reinitializeSubscriptions() {
    console.log("Reinitializing chat subscriptions...");
    this.setupSubscriptions();
  }

  private setupSubscriptions() {
    // Remove any existing listeners before adding new one
    subClient.removeAllListeners("message");

    // Subscribe to chat messages
    subClient.subscribe(RedisHash.CHAT_MESSAGES, (err, count) => {
      if (err) {
        console.error("Subscribe to chat messages error:", err);
        return;
      }
      console.log(`[ChatEmitter] Subscribed to ${count} channel(s) for chat messages`);
    });

    // Subscribe to chat rooms
    subClient.subscribe(RedisHash.CHAT_ROOMS, (err, count) => {
      if (err) {
        console.error("Subscribe to chat rooms error:", err);
        return;
      }
      console.log(`[ChatEmitter] Subscribed to ${count} channel(s) for chat rooms`);
    });

    subClient.on("message", (channel: string, message: any) => {
      console.log(`[ChatEmitter] Received on channel: ${channel}`);
      
      if (channel === RedisHash.CHAT_MESSAGES) {
        try {
          const chatMessage: Message = JSON.parse(message);
          this.handleChatMessage(chatMessage);
        } catch (error) {
          console.error("Error parsing chat message:", error);
        }
      } else if (channel === RedisHash.CHAT_ROOMS) {
        try {
          const roomEvent: RoomEvent = JSON.parse(message);
          this.handleRoomEvent(roomEvent);
        } catch (error) {
          console.error("Error parsing room event:", error);
        }
      }
    });
  }

  private async handleChatMessage(message: Message) {
    // Validate that roomId exists and is not empty
    if (!message.roomId || message.roomId.trim() === "") {
      console.error("Cannot emit message: roomId is missing or empty", message);
      return;
    }

    // Get all sockets in the room for debugging
    const socketsInRoom = await this.server.in(message.roomId).fetchSockets();
    console.log(`[ChatEmitter] Emitting message to room '${message.roomId}' (${socketsInRoom.length} sockets in room)`);
    
    // Emit to all sockets in the room
    this.server.to(message.roomId).emit(ChatEvent.MESSAGE, message);
  }

  private handleRoomEvent(event: RoomEvent) {
    // Validate that roomId exists
    if (!event.roomId || event.roomId.trim() === "") {
      console.error("Cannot emit room event: roomId is missing or empty", event);
      return;
    }

    console.log(`Emitting room event: ${event.type} to room: ${event.roomId}`);
    
    switch (event.type) {
      case "join":
        this.server.to(event.roomId).emit(ChatEvent.USER_JOINED, event);
        break;
      case "leave":
        this.server.to(event.roomId).emit(ChatEvent.USER_LEFT, event);
        break;
      case "user_event":
        this.server.to(event.roomId).emit(ChatEvent.USER_EVENT, event);
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