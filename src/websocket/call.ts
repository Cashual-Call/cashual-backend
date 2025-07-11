import { Server, Socket } from "socket.io";
import { redis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { CallEvent } from "../config/websocket";

// TODO: Add a limit to the number of participants in a call
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
    
    io.engine.emit(CallEvent.JOIN_ROOM, socket.id);

    // Join a call room
    socket.on(CallEvent.JOIN_ROOM, async (roomId: string) => {
      try {
        console.log("[Call] Attempting to join room:", roomId);
        // Rate limiting
        await rateLimiter.consume(socket.id);

        // Validate room ID
        if (!validateRoomId(roomId)) {
          console.log("[Call] Invalid room ID format:", roomId);
          throw new Error("Invalid room ID format");
        }

        socket.join(roomId);
        console.log("[Call] Socket joined room:", roomId);

        // Get or create call room
        const roomKey = `call:${roomId}`;
        let room: CallRoom;

        const existingRoom = await redis.get(roomKey);
        if (existingRoom) {
          console.log("[Call] Existing room found:", roomId);
          room = JSON.parse(existingRoom);
          
          // Check participant limit
          if (room.participants.length >= MAX_PARTICIPANTS) {
            console.log("[Call] Room is full:", { roomId, participants: room.participants });
            throw new Error("Room is full");
          }
          
          if (!room.participants.includes(socket.id)) {
            room.participants.push(socket.id);
            await redis.set(roomKey, JSON.stringify(room));
            console.log("[Call] Added participant to room:", { roomId, participant: socket.id });
          }
        } else {
          console.log("[Call] Creating new room:", roomId);
          room = {
            id: roomId,
            participants: [socket.id],
            status: "active",
            startTime: new Date(),
          };
          await redis.set(roomKey, JSON.stringify(room));
        }

        // Notify others in the room
        socket.to(roomId).emit("user-joined", { userId: socket.id, room });
        console.log("[Call] Notified room of new participant:", { roomId, userId: socket.id });

        // Send room state to the new participant
        socket.emit("roomState", room);
        console.log("[Call] Sent room state to participant:", { roomId, userId: socket.id });
      } catch (error: unknown) {
        console.error("[Call] Error joining call:", { roomId, error });
        if (error instanceof Error && error.name === "RateLimiterError") {
          socket.emit("error", "Too many requests. Please try again later.");
        } else {
          socket.emit("error", error instanceof Error ? error.message : "Failed to join call");
        }
      }
    });

    // Handle WebRTC offer
    socket.on(CallEvent.OFFER, (data: { roomId: string; offer: any }) => {
      console.log("[Call] Received offer:", { roomId: data.roomId });
      socket.to(data.roomId).emit("offer", {
        offer: data.offer,
      });
    });

    // Handle WebRTC answer
    socket.on(CallEvent.ANSWER, (data: { roomId: string; answer: any }) => {
      console.log("[Call] Received answer:", { roomId: data.roomId });
      socket.to(data.roomId).emit("answer", {
        answer: data.answer,
      });
    });

    // Handle ICE candidates
    socket.on(CallEvent.CANDIDATE, (data: { roomId: string; candidate: any }) => {
      console.log("[Call] Received ICE candidate:", { roomId: data.roomId });
      socket.to(data.roomId).emit("candidate", {
        candidate: data.candidate,
      });
    });

    // Handle call end
    socket.on(CallEvent.END_CALL, async (roomId: string) => {
      try {
        console.log("[Call] Ending call:", roomId);
        const roomKey = `call:${roomId}`;
        const room = await redis.get(roomKey);

        if (room) {
          const callRoom: CallRoom = JSON.parse(room);
          callRoom.status = "ended";
          callRoom.endTime = new Date();

          // Save call history to database
          await prisma.call.create({
            data: {
              initiatorId: callRoom.participants[0],
              receiverId: callRoom.participants[1],
              durationSec: Math.floor(
                (callRoom.endTime.getTime() - callRoom.startTime.getTime()) /
                  1000
              ),
              startedAt: callRoom.startTime,
              endedAt: callRoom.endTime,
            },
          });
          console.log("[Call] Saved call history to database:", { roomId });

          // Clean up Redis
          await redis.del(roomKey);
          console.log("[Call] Cleaned up Redis for room:", roomId);

          // Notify all participants
          io.of("/call").to(roomId).emit("callEnded", callRoom);
          console.log("[Call] Notified participants of call end:", roomId);
        }
      } catch (error) {
        console.error("[Call] Error ending call:", { roomId, error });
        socket.emit("error", "Failed to end call");
      }
    });

    // Handle disconnection
    socket.on(CallEvent.DISCONNECT, async () => {
      try {
        console.log("[Call] Handling disconnect:", socket.id);
        // Find all rooms the user is in
        const rooms = Array.from(socket.rooms);
        for (const roomId of rooms) {
          if (roomId !== socket.id) {
            // Skip the socket's own room
            const roomKey = `call:${roomId}`;
            const room = await redis.get(roomKey);

            if (room) {
              const callRoom: CallRoom = JSON.parse(room);
              callRoom.participants = callRoom.participants.filter(
                (p) => p !== socket.id
              );

              if (callRoom.participants.length === 0) {
                // If no participants left, end the call
                await redis.del(roomKey);
                console.log("[Call] No participants left, ending call:", roomId);
                io.of("/call")
                  .to(roomId)
                  .emit("callEnded", { ...callRoom, status: "ended" });
              } else {
                await redis.set(roomKey, JSON.stringify(callRoom));
                console.log("[Call] Participant left, updating room:", { roomId, remainingParticipants: callRoom.participants });
                socket
                  .to(roomId)
                  .emit("userLeft", { userId: socket.id, room: callRoom });
              }
            }
          }
        }
      } catch (error) {
        console.error("[Call] Error handling disconnect:", { socketId: socket.id, error });
      }
    });

    // Handle WebRTC signaling
    socket.on("signal", (data: { signal: any; to: string; from: string; room: string }) => {
      try {
        console.log("[Call] Received signal:", {
          from: data.from,
          to: data.to,
          room: data.room,
          signalType: data.signal?.type,
          timestamp: new Date().toISOString()
        });

        // Forward the signal to the target peer
        socket.to(data.to).emit("signal", {
          signal: data.signal,
          from: data.from,
          room: data.room
        });
        
        console.log("[Call] Forwarded signal to peer:", {
          to: data.to,
          from: data.from,
          room: data.room
        });
      } catch (error) {
        console.error("[Call] Error handling signal:", {
          error,
          from: data.from,
          to: data.to,
          room: data.room
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
          roomId: data.room.id,
          participants: data.room.participants,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error("[Call] Error handling user-joined event:", {
          error,
          userId: data.userId,
          room: data.room
        });
      }
    });
  });
}
