import { Server, Socket } from "socket.io";
import { redis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { verifyToken } from "../middleware/socket.middleware";
import { FriendsService } from "../service/friend.service";

// Extend global interface to include io property
declare global {
  var io: Server | undefined;
}

enum SocketEvents {
  SEND_OFFER = "send-offer",
  OFFER = "offer",
  ANSWER = "answer",
  LOBBY = "lobby",
  ADD_ICE_CANDIDATE = "add-ice-candidate",
  USER_EVENT = "user-event",
  FRIEND_REQUEST = "friend-request",
  ERROR = "error",
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
  joinedAt: Date;
}

class CallUserManager {
  async addUser(socket: Socket, roomId: string) {
    const user: CallUser = {
      socketId: socket.id,
      joinedAt: new Date(),
    };

    // Store user data in Redis
    await redis.hset(`call:user:${socket.id}`, {
      socketId: socket.id,
      joinedAt: user.joinedAt.toISOString(),
    });

    // Add to queue
    await redis.lpush("call:queue", socket.id);

    const queueLength = await redis.llen("call:queue");
    console.log(
      `[Call] User ${socket.id} added to queue. Queue length: ${queueLength}`
    );

    // Emit lobby event to let user know they're waiting
    socket.emit(SocketEvents.LOBBY);

    // Try to match users
    await this.tryMatchUsers(roomId);
  }

  async removeUser(socketId: string) {
    // Clean up room if user was in one
    const roomId = await redis.get(`call:user-room:${socketId}`);
    if (roomId) {
      await this.handleUserLeaveRoom(roomId, socketId);
    }

    // Remove from queue and users
    await redis.lrem("call:queue", 0, socketId);
    await redis.del(`call:user:${socketId}`);
    await redis.del(`call:user-room:${socketId}`);

    const remainingUsers = await redis.hlen("call:users");
    console.log(
      `[Call] User ${socketId} removed. Remaining users: ${remainingUsers}`
    );
  }

  private async tryMatchUsers(roomId: string) {
    const queueLength = await redis.llen("call:queue");
    if (queueLength < 2) {
      return;
    }

    const user1Id = await redis.rpop("call:queue");
    const user2Id = await redis.rpop("call:queue");

    if (!user1Id || !user2Id) {
      console.log(`[Call] Failed to match users - one or both users not found`);
      return;
    }

    const user1Exists = await redis.exists(`call:user:${user1Id}`);
    const user2Exists = await redis.exists(`call:user:${user2Id}`);

    if (!user1Exists || !user2Exists) {
      console.log(`[Call] Failed to match users - one or both users not found`);
      return;
    }

    await this.createRoom(user1Id, user2Id, roomId);
  }

  private async createRoom(user1Id: string, user2Id: string, roomId: string) {
    const room: CallRoom = {
      id: roomId,
      participants: [user1Id, user2Id],
      status: "active",
      startTime: new Date(),
    };

    // Store room data in Redis
    await redis.hset(`call:room:${roomId}`, {
      id: roomId,
      participants: JSON.stringify(room.participants),
      status: room.status,
      startTime: room.startTime.toISOString(),
    });

    const a = await redis.hgetall(`call:room:${roomId}`);
    console.log("fuewhfuiew", a);

    // Map users to room
    await redis.set(`call:user-room:${user1Id}`, roomId);
    await redis.set(`call:user-room:${user2Id}`, roomId);

    console.log(
      `[Call] Created room ${roomId} for users ${user1Id} and ${user2Id}`
    );

    // Get socket instances from the namespace
    const namespace = global.io?.of("/call");
    if (!namespace) return;

    const user1Socket = namespace.sockets.get(user1Id);
    const user2Socket = namespace.sockets.get(user2Id);

    if (user1Socket && user2Socket) {
      // Emit send-offer to user1 (initiator)
      user1Socket.emit(SocketEvents.SEND_OFFER, { roomId });

      // User2 will wait for the offer
      user2Socket.emit(SocketEvents.LOBBY, { roomId, waiting: true });
    }
  }

  private async handleUserLeaveRoom(roomId: string, socketId: string) {
    const roomData = await redis.hgetall(`call:room:${roomId}`);
    if (!roomData.participants) return;

    const participants = JSON.parse(roomData.participants);

    // Find the other user in the room
    const otherUserId = participants.find((id: string) => id !== socketId);
    if (otherUserId) {
      const namespace = global.io?.of("/call");
      const otherUserSocket = namespace?.sockets.get(otherUserId);

      if (otherUserSocket) {
        // Put the other user back in lobby
        otherUserSocket.emit(SocketEvents.LOBBY);
        await redis.lpush("call:queue", otherUserId);
        await redis.del(`call:user-room:${otherUserId}`);
      }
    }

    // Clean up room
    await redis.del(`call:room:${roomId}`);
    await redis.del(`call:user-room:${socketId}`);

    console.log(`[Call] Room ${roomId} cleaned up after user ${socketId} left`);
  }

  async forwardToRoom(
    roomId: string,
    senderSocketId: string,
    event: string,
    data: any
  ) {
    const roomData = await redis.hgetall(`call:room:${roomId}`);
    if (!roomData.participants) {
      console.log(`[Call] Room ${roomId} not found for event ${event}`);
      const a = await redis.hgetall(`call:room`);
      return;
    }

    const participants = JSON.parse(roomData.participants);

    // Find the other user in the room
    const receiverSocketId = participants.find(
      (id: string) => id !== senderSocketId
    );
    if (!receiverSocketId) {
      console.log(
        `[Call] No receiver found in room ${roomId} for event ${event}`
      );
      return;
    }

    const namespace = global.io?.of("/call");
    const receiverSocket = namespace?.sockets.get(receiverSocketId);

    if (!receiverSocket) {
      console.log(
        `[Call] Receiver socket ${receiverSocketId} not found for event ${event}`
      );
      return;
    }

    // Forward the event to the other user
    receiverSocket.emit(event, { ...data, roomId });
    console.log(
      `[Call] Forwarded ${event} from ${senderSocketId} to ${receiverSocketId} in room ${roomId}`
    );
  }
}

export function setupCallHandlers(io: Server) {
  // Store io instance globally for access in CallUserManager
  (global as any).io = io;

  const userManager = new CallUserManager();
  const friendsService = new FriendsService();

  io.of("/call").on("connection", (socket: Socket) => {
    // console.log("[Call] Socket connected:", socket.id);
    const authToken = socket.handshake.auth.token;
    const {
      roomId,
      senderId,
      receiverId,
      senderUsername = "",
      receiverUsername = "",
    } = authToken
      ? verifyToken(authToken)
      : {
          roomId: "general",
          senderId: socket.id, // TODO: chanage,
          receiverId: "global",
          senderUsername: "",
          receiverUsername: "",
        };

    console.log("roomIduhewrige", roomId);

    redis.set(`call:total-users`, io.engine.clientsCount);

    // Add user to queue automatically
    userManager.addUser(socket, roomId);

    socket.on("disconnect", async (reason) => {
      console.log("[Call] Socket disconnected:", socket.id, "Reason:", reason);
      await userManager.removeUser(socket.id);
      redis.set(`call:total-users`, io.engine.clientsCount);
    });

    // Handle WebRTC signaling with room-based forwarding
    socket.on(
      SocketEvents.OFFER,
      async (data: { sdp: any; roomId: string }) => {
        await userManager.forwardToRoom(
          data.roomId,
          socket.id,
          SocketEvents.OFFER,
          {
            sdp: data.sdp,
          }
        );
      }
    );

    socket.on(
      SocketEvents.ANSWER,
      async (data: { sdp: any; roomId: string }) => {
        await userManager.forwardToRoom(
          data.roomId,
          socket.id,
          SocketEvents.ANSWER,
          {
            sdp: data.sdp,
          }
        );
      }
    );

    socket.on(SocketEvents.SEND_OFFER, async (data: { roomId: string }) => {
      await userManager.forwardToRoom(
        data.roomId,
        socket.id,
        SocketEvents.SEND_OFFER,
        {
          roomId: data.roomId,
        }
      );
    });

    socket.on(SocketEvents.LOBBY, async (data: { roomId: string }) => {
      await userManager.forwardToRoom(
        data.roomId,
        socket.id,
        SocketEvents.LOBBY,
        {
          roomId: data.roomId,
        }
      );
    });

    socket.on(
      SocketEvents.ADD_ICE_CANDIDATE,
      async (data: { candidate: any; type: string; roomId: string }) => {
        await userManager.forwardToRoom(
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

    socket.on(
      SocketEvents.USER_EVENT,
      async (data: { eventType: string; roomId: string }) => {
        console.log(
          `[Call] Received user event from ${socket.id} for room ${data.roomId}: ${data.eventType}`
        );
        await userManager.forwardToRoom(
          data.roomId,
          socket.id,
          SocketEvents.USER_EVENT,
          {
            eventType: data.eventType,
            roomId: data.roomId,
          }
        );
      }
    );

    socket.on(
      SocketEvents.ADD_ICE_CANDIDATE,
      async (data: { candidate: any; type: string; roomId: string }) => {
        console.log(
          `[Call] Received ICE candidate from ${socket.id} for room ${data.roomId}`
        );
        await userManager.forwardToRoom(
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

    socket.on(
      SocketEvents.FRIEND_REQUEST,
      async (data: { friendUsername: string }) => {
        try {
          const result = await friendsService.sendFriendRequest(
            senderUsername,
            data.friendUsername
          );
          await userManager.forwardToRoom(
            roomId,
            socket.id,
            SocketEvents.FRIEND_REQUEST,
            { event: result }
          );
          console.log("Friend request sent successfully");
        } catch (error) {
          console.error("Error sending friend request:", error);
          socket.emit(SocketEvents.ERROR, {
            message:
              error instanceof Error
                ? error.message
                : "Failed to send friend request",
          });
          console.log("Friend request failed to send");
        }
      }
    );
  });
}
