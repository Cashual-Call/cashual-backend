import { Server, Socket } from "socket.io";
import { redis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { CallEvent } from "../config/websocket";
import { verifyToken } from "../middleware/socket.middleware";

// TODO: Implement user points tracking and related endpoints in user service
const MAX_PARTICIPANTS = 10e6;
const RATE_LIMIT = {
  points: 10,
  duration: 1, // per second
};

const rateLimiter = new RateLimiterMemory({
  points: RATE_LIMIT.points,
  duration: RATE_LIMIT.duration,
});

interface CallRoom {
  id: string;
  participants: string[];
  status: "active" | "ended";
  startTime: Date;
  endTime?: Date;
}

function validateRoomId(roomId: string): boolean {
  // Add your room ID validation logic here
  return /^[a-zA-Z0-9-_]{3,50}$/.test(roomId);
}

export function setupCallHandlers(io: Server) {
  io.of("/call").on("connection", (socket: Socket) => {
    console.log("[Call] Client connected:", socket.id);
    const authToken = socket.handshake.auth.token;
    const {roomId, senderId, receiverId} = verifyToken(authToken);
    
    console.log("[Call] Extracted from token:", { roomId, senderId, receiverId });

    socket.on("connect", () => {
      console.log("[Call] Socket connected:", socket.id);
    });

    socket.on("disconnect", (reason) => {
      console.log("[Call] Socket disconnected:", socket.id, "Reason:", reason);
      // Optionally, handle cleanup here if needed
    });
    
    // Auto-emit join-room for the client after connection
    // setTimeout(() => {
    //   socket.emit("join-room-auto");
    // }, 100);

    // // Join a call room
    // socket.on(CallEvent.JOIN_ROOM, async () => {
    //   try {
    //     console.log("[Call] Attempting to join room:", roomId);
    //     // Rate limiting
    //     await rateLimiter.consume(socket.id);

    //     // Validate room ID
    //     if (!validateRoomId(roomId)) {
    //       console.log("[Call] Invalid room ID format:", roomId);
    //       throw new Error("Invalid room ID format");
    //     }

    //     socket.join(roomId);
    //     console.log("[Call] Socket joined room:", roomId);

    //     // Get or create call room
    //     const roomKey = `call:${roomId}`;
    //     let room: CallRoom;

    //     const existingRoom = await redis.get(roomKey);
    //     if (existingRoom) {
    //       console.log("[Call] Existing room found:", roomId);
    //       room = JSON.parse(existingRoom);
          
    //       // Check participant limit
    //       if (room.participants.length >= MAX_PARTICIPANTS) {
    //         console.log("[Call] Room is full:", { roomId, participants: room.participants });
    //         throw new Error("Room is full");
    //       }
          
    //       if (!room.participants.includes(socket.id)) {
    //         room.participants.push(socket.id);
    //         await redis.set(roomKey, JSON.stringify(room));
    //         console.log("[Call] Added participant to room:", { roomId, participant: socket.id });
    //       }
    //     } else {
    //       console.log("[Call] Creating new room:", roomId);
    //       room = {
    //         id: roomId,
    //         participants: [socket.id],
    //         status: "active",
    //         startTime: new Date(),
    //       };
    //       await redis.set(roomKey, JSON.stringify(room));
    //     }

    //     // Notify others in the room
    //     socket.to(roomId).emit("user-joined", { userId: socket.id, room });
    //     console.log("[Call] Notified room of new participant:", { roomId, userId: socket.id });

    //     // Send room state to the new participant
    //     socket.emit("roomState", room);
    //     console.log("[Call] Sent room state to participant:", { roomId, userId: socket.id });

    //     // If this is the first participant, they wait for others
    //     // If this is the second participant, trigger offer creation
    //     if (room.participants.length === 1) {
    //       console.log("[Call] First participant, waiting for others...");
    //       socket.emit("lobby");
    //     } else if (room.participants.length === 2) {
    //       console.log("[Call] Second participant joined, initiating call...");
    //       // Tell the first participant to send an offer
    //       socket.to(room.participants[0]).emit("send-offer", { roomId });
    //       console.log("[Call] Sent send-offer to first participant:", room.participants[0]);
    //     }
    //   } catch (error: unknown) {
    //     console.error("[Call] Error joining call:", { roomId, error });
    //     if (error instanceof Error && error.name === "RateLimiterError") {
    //       socket.emit("error", "Too many requests. Please try again later.");
    //     } else {
    //       socket.emit("error", error instanceof Error ? error.message : "Failed to join call");
    //     }
    //   }
    // });

    // // Handle WebRTC offer
    // socket.on(CallEvent.OFFER, (data: { offer: any }) => {
    //   console.log("[Call] Received offer:", { roomId });
    //   socket.to(roomId).emit("offer", {
    //     roomId,
    //     sdp: data.offer,
    //   });
    // });

    // // Handle WebRTC answer
    // socket.on(CallEvent.ANSWER, (data: { answer: any }) => {
    //   console.log("[Call] Received answer:", { roomId });
    //   socket.to(roomId).emit("answer", {
    //     roomId,
    //     sdp: data.answer,
    //   });
    // });

    // // Handle ICE candidates
    // socket.on(CallEvent.CANDIDATE, (data: { candidate: any }) => {
    //   console.log("[Call] Received ICE candidate:", { roomId });
    //   socket.to(roomId).emit("candidate", {
    //     candidate: data.candidate,
    //   });
    // });

    // // Handle call end
    // socket.on(CallEvent.END_CALL, async () => {
    //   try {
    //     console.log("[Call] Ending call:", roomId);
    //     const roomKey = `call:${roomId}`;
    //     const room = await redis.get(roomKey);

    //     if (room) {
    //       const callRoom: CallRoom = JSON.parse(room);
    //       callRoom.status = "ended";
    //       callRoom.endTime = new Date();

    //       // Save call history to database
    //       await prisma.call.create({
    //         data: {
    //           initiatorId: callRoom.participants[0],
    //           receiverId: callRoom.participants[1],
    //           durationSec: Math.floor(
    //             (callRoom.endTime.getTime() - callRoom.startTime.getTime()) /
    //               1000
    //           ),
    //           startedAt: callRoom.startTime,
    //           endedAt: callRoom.endTime,
    //         },
    //       });
    //       console.log("[Call] Saved call history to database:", { roomId });

    //       // Clean up Redis
    //       await redis.del(roomKey);
    //       console.log("[Call] Cleaned up Redis for room:", roomId);

    //       // Notify all participants
    //       io.of("/call").to(roomId).emit("callEnded", callRoom);
    //       console.log("[Call] Notified participants of call end:", roomId);
    //     }
    //   } catch (error) {
    //     console.error("[Call] Error ending call:", { roomId, error });
    //     socket.emit("error", "Failed to end call");
    //   }
    // });

    // // Handle disconnection
    // socket.on(CallEvent.DISCONNECT, async () => {
    //   try {
    //     console.log("[Call] Handling disconnect:", socket.id);
    //     // Find all rooms the user is in
    //     const rooms = Array.from(socket.rooms);
    //     for (const roomId of rooms) {
    //       if (roomId !== socket.id) {
    //         // Skip the socket's own room
    //         const roomKey = `call:${roomId}`;
    //         const room = await redis.get(roomKey);

    //         if (room) {
    //           const callRoom: CallRoom = JSON.parse(room);
    //           callRoom.participants = callRoom.participants.filter(
    //             (p) => p !== socket.id
    //           );

    //           if (callRoom.participants.length === 0) {
    //             // If no participants left, end the call
    //             await redis.del(roomKey);
    //             console.log("[Call] No participants left, ending call:", roomId);
    //             io.of("/call")
    //               .to(roomId)
    //               .emit("callEnded", { ...callRoom, status: "ended" });
    //           } else {
    //             await redis.set(roomKey, JSON.stringify(callRoom));
    //             console.log("[Call] Participant left, updating room:", { roomId, remainingParticipants: callRoom.participants });
    //             socket
    //               .to(roomId)
    //               .emit("userLeft", { userId: socket.id, room: callRoom });
    //           }
    //         }
    //       }
    //     }
    //   } catch (error) {
    //     console.error("[Call] Error handling disconnect:", { socketId: socket.id, error });
    //   }
    // });

    // Handle WebRTC signaling
    socket.on("signal", (data: { signal: any; to: string; from: string;}) => {
      try {
        console.log("[Call] Received signal:", {
          from: data.from,
          to: data.to,
          room: roomId,
          signalType: data.signal?.type,
          timestamp: new Date().toISOString()
        });

        // Forward the signal to the target peer
        socket.to(data.to).emit("signal", {
          signal: data.signal,
          from: data.from,
          room: roomId
        });
        
        console.log("[Call] Forwarded signal to peer:", {
          to: data.to,
          from: data.from,
          room: roomId
        });
      } catch (error) {
        console.error("[Call] Error handling signal:", {
          error,
          from: data.from,
          to: data.to,
          room: roomId
        });
      }
    });

    // Handle heartbeat
    socket.on(CallEvent.HEARTBEAT, (roomId: string) => {
      try {
        console.log("[Call] Received heartbeat:", {
          socketId: socket.id,
          roomId,
          timestamp: new Date().toISOString()
        });
        
        // Broadcast heartbeat to room
        socket.to(roomId).emit(CallEvent.HEARTBEAT, {
          from: socket.id,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error("[Call] Error handling heartbeat:", {
          error,
          socketId: socket.id,
          roomId
        });
      }
    });

    // Handle user-joined event
    socket.on("user-joined", (data: { userId: string; room: CallRoom }) => {
      try {
        console.log("[Call] User joined event:", {
          userId: data.userId,
          roomId,
          participants: [...data.room.participants],
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error("[Call] Error handling user-joined event:", {
          error,
          userId: data.userId,
          room: roomId
        });
      }
    });
  });
}
