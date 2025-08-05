import { Server, Socket } from "socket.io";
import { redis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { CallEvent } from "../config/websocket";
import { verifyToken } from "../middleware/socket.middleware";

enum CallEvents {
  MUTE_USER = "mute-user",
  UNMUTE_USER = "unmute-user",
}

enum SocketEvents {
  SEND_OFFER = "send-offer",
  OFFER = "offer",
  ANSWER = "answer",
  LOBBY = "lobby",
  ADD_ICE_CANDIDATE = "add-ice-candidate",
  USER_EVENT = "user-event",
}
interface CallRoom {
  id: string;
  participants: string[];
  status: "active" | "ended";
  startTime: Date;
  endTime?: Date;
}
interface CallUser {
  socketId: string;
  socket: Socket;
  joinedAt: Date;
}

class CallUserManager {
  private users: Map<string, CallUser> = new Map();
  private queue: string[] = [];
  private rooms: Map<string, CallRoom> = new Map();
  private userRooms: Map<string, string> = new Map(); // socketId -> roomId
  private roomCounter = 1;

  addUser(socket: Socket) {
    const user: CallUser = {
      socketId: socket.id,
      socket,
      joinedAt: new Date(),
    };

    this.users.set(socket.id, user);
    this.queue.push(socket.id);

    console.log(
      `[Call] User ${socket.id} added to queue. Queue length: ${this.queue.length}`
    );

    // Emit lobby event to let user know they're waiting
    socket.emit(SocketEvents.LOBBY);

    // Try to match users
    this.tryMatchUsers();
  }

  removeUser(socketId: string) {
    // Clean up room if user was in one
    const roomId = this.userRooms.get(socketId);
    if (roomId) {
      this.handleUserLeaveRoom(roomId, socketId);
    }

    // Remove from queue and users
    this.queue = this.queue.filter((id) => id !== socketId);
    this.users.delete(socketId);
    this.userRooms.delete(socketId);

    console.log(
      `[Call] User ${socketId} removed. Remaining users: ${this.users.size}`
    );
  }

  private tryMatchUsers() {
    if (this.queue.length < 2) {
      return;
    }

    const user1Id = this.queue.shift()!;
    const user2Id = this.queue.shift()!;

    const user1 = this.users.get(user1Id);
    const user2 = this.users.get(user2Id);

    if (!user1 || !user2) {
      console.log(`[Call] Failed to match users - one or both users not found`);
      return;
    }

    this.createRoom(user1, user2);
  }

  private createRoom(user1: CallUser, user2: CallUser) {
    const roomId = `room_${this.roomCounter++}`;

    const room: CallRoom = {
      id: roomId,
      participants: [user1.socketId, user2.socketId],
      status: "active",
      startTime: new Date(),
    };

    this.rooms.set(roomId, room);
    this.userRooms.set(user1.socketId, roomId);
    this.userRooms.set(user2.socketId, roomId);

    console.log(
      `[Call] Created room ${roomId} for users ${user1.socketId} and ${user2.socketId}`
    );

    // Emit send-offer to user1 (initiator)
    user1.socket.emit(SocketEvents.SEND_OFFER, { roomId });

    // User2 will wait for the offer
    user2.socket.emit(SocketEvents.LOBBY, { roomId, waiting: true });
  }

  private handleUserLeaveRoom(roomId: string, socketId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Find the other user in the room
    const otherUserId = room.participants.find((id) => id !== socketId);
    if (otherUserId) {
      const otherUser = this.users.get(otherUserId);
      if (otherUser) {
        // Put the other user back in lobby
        otherUser.socket.emit(SocketEvents.LOBBY);
        this.queue.push(otherUserId);
        this.userRooms.delete(otherUserId);
      }
    }

    // Clean up room
    this.rooms.delete(roomId);
    this.userRooms.delete(socketId);

    console.log(`[Call] Room ${roomId} cleaned up after user ${socketId} left`);
  }

  forwardToRoom(
    roomId: string,
    senderSocketId: string,
    event: string,
    data: any
  ) {
    const room = this.rooms.get(roomId);
    if (!room) {
      console.log(`[Call] Room ${roomId} not found for event ${event}`);
      return;
    }

    // Find the other user in the room
    const receiverSocketId = room.participants.find(
      (id) => id !== senderSocketId
    );
    if (!receiverSocketId) {
      console.log(
        `[Call] No receiver found in room ${roomId} for event ${event}`
      );
      return;
    }

    const receiverUser = this.users.get(receiverSocketId);
    if (!receiverUser) {
      console.log(
        `[Call] Receiver user ${receiverSocketId} not found for event ${event}`
      );
      return;
    }

    // Forward the event to the other user
    receiverUser.socket.emit(event, { ...data, roomId });
    console.log(
      `[Call] Forwarded ${event} from ${senderSocketId} to ${receiverSocketId} in room ${roomId}`
    );
  }
}

function validateRoomId(roomId: string): boolean {
  // Add your room ID validation logic here
  return /^[a-zA-Z0-9-_]{3,50}$/.test(roomId);
}

export function setupCallHandlers(io: Server) {
  const userManager = new CallUserManager();

  io.of("/call").on("connection", (socket: Socket) => {
    console.log("[Call] Socket connected:", socket.id);

    // Add user to queue automatically
    userManager.addUser(socket);

    socket.on("disconnect", (reason) => {
      console.log("[Call] Socket disconnected:", socket.id, "Reason:", reason);
      userManager.removeUser(socket.id);
    });

    // Handle WebRTC signaling with room-based forwarding
    socket.on(SocketEvents.OFFER, (data: { sdp: any; roomId: string }) => {
      userManager.forwardToRoom(data.roomId, socket.id, SocketEvents.OFFER, {
        sdp: data.sdp,
      });
    });

    socket.on(SocketEvents.ANSWER, (data: { sdp: any; roomId: string }) => {
      userManager.forwardToRoom(data.roomId, socket.id, SocketEvents.ANSWER, {
        sdp: data.sdp,
      });
    });

    socket.on(SocketEvents.SEND_OFFER, (data: { roomId: string }) => {
      userManager.forwardToRoom(data.roomId, socket.id, SocketEvents.SEND_OFFER, {
        roomId: data.roomId,
      });
    });

    socket.on(SocketEvents.LOBBY, (data: { roomId: string }) => {
      userManager.forwardToRoom(data.roomId, socket.id, SocketEvents.LOBBY, {
        roomId: data.roomId,
      });
    });

    socket.on(SocketEvents.ADD_ICE_CANDIDATE, (data: { candidate: any; type: string; roomId: string }) => {
      userManager.forwardToRoom(data.roomId, socket.id, SocketEvents.ADD_ICE_CANDIDATE, {
        candidate: data.candidate,
        type: data.type,
      });
    });

    socket.on(SocketEvents.USER_EVENT, (data: { event: string; roomId: string }) => {
      console.log(
        `[Call] Received user event from ${socket.id} for room ${data.roomId}`
      );
      userManager.forwardToRoom(data.roomId, socket.id, SocketEvents.USER_EVENT, {
        event: data.event,
        roomId: data.roomId,
      });
    });

    socket.on(
      SocketEvents.ADD_ICE_CANDIDATE,
      (data: { candidate: any; type: string; roomId: string }) => {
        console.log(
          `[Call] Received ICE candidate from ${socket.id} for room ${data.roomId}`
        );
        userManager.forwardToRoom(
          data.roomId,
          socket.id,
          SocketEvents.ADD_ICE_CANDIDATE,
          {
            candidate: data.candidate,
            type: data.type,
          }
        );
      }
    );
  });
}
