import { Socket } from "socket.io";
import { redis, subClient } from "../../lib/redis";
import { sendMessageSchema, Message } from "../../validation/chat.validation";
import { ChatEvent } from "../../config/websocket";
import ChatDBService from "../../service/chat-db.service";

export class ChatEmitterController {
  private socket: Socket;

  constructor(socket: Socket) {
    this.socket = socket;
    this.handleRoomEvent = this.handleRoomEvent.bind(this);
  }

  initializeSubscriptions() {
    console.log("Initializing subscriptions");
    // Subscribe to room events
    subClient.subscribe("room:events", (err) => {
      if (err) {
        console.error("Error subscribing to room events:", err);
        return;
      }
    });

    // Handle incoming room events
    subClient.on("message", (channel: string, message: string) => {
      if (channel === "room:events") {
        try {
          const event: RoomEvent = JSON.parse(message);
          this.handleRoomEvent(event);
        } catch (error) {
          console.error("Error parsing room event:", error);
        }
      }
    });
  }

  private handleRoomEvent(event: RoomEvent) {
    switch (event.type) {
      case "join":
        this.socket.to(event.roomId).emit(ChatEvent.USER_JOINED, event);
        break;
      case "leave":
        this.socket.to(event.roomId).emit(ChatEvent.USER_LEFT, event);
        break;
      case "typing":
        this.socket.to(event.roomId).emit(ChatEvent.USER_TYPING, event);
        break;
      case "stopped_typing":
        this.socket.to(event.roomId).emit(ChatEvent.USER_STOPPED_TYPING, event);
        break;
      case "connected":
        this.socket.to(event.roomId).emit(ChatEvent.USER_CONNECTED, event);
        break;
      case "disconnected":
        this.socket.to(event.roomId).emit(ChatEvent.USER_DISCONNECTED, event);
        break;
      default:
        console.warn("Unknown room event type:", event.type);
    }
  }
}