import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const prisma = new PrismaClient();

interface CallRoom {
  id: string;
  participants: string[];
  status: 'active' | 'ended';
  startTime: Date;
  endTime?: Date;
}

export function setupCallHandlers(io: Server, redis: Redis) {
  io.of('/call').on('connection', (socket: Socket) => {
    console.log('Call client connected:', socket.id);

    // Join a call room
    socket.on('joinCall', async (roomId: string, userId: string) => {
      try {
        socket.join(roomId);
        
        // Get or create call room
        const roomKey = `call:${roomId}`;
        let room: CallRoom;
        
        const existingRoom = await redis.get(roomKey);
        if (existingRoom) {
          room = JSON.parse(existingRoom);
          if (!room.participants.includes(userId)) {
            room.participants.push(userId);
            await redis.set(roomKey, JSON.stringify(room));
          }
        } else {
          room = {
            id: roomId,
            participants: [userId],
            status: 'active',
            startTime: new Date()
          };
          await redis.set(roomKey, JSON.stringify(room));
        }

        // Notify others in the room
        socket.to(roomId).emit('userJoined', { userId, room });

        // Send room state to the new participant
        socket.emit('roomState', room);
      } catch (error) {
        console.error('Error joining call:', error);
        socket.emit('error', 'Failed to join call');
      }
    });

    // Handle WebRTC signaling
    socket.on('signal', (data: { roomId: string; signal: any; to: string }) => {
      socket.to(data.roomId).emit('signal', {
        signal: data.signal,
        from: socket.id
      });
    });

    // Handle call end
    socket.on('endCall', async (roomId: string) => {
      try {
        const roomKey = `call:${roomId}`;
        const room = await redis.get(roomKey);
        
        if (room) {
          const callRoom: CallRoom = JSON.parse(room);
          callRoom.status = 'ended';
          callRoom.endTime = new Date();
          
          // Save call history to database
          await prisma.call.create({
            data: {
              initiatorId: callRoom.participants[0],
              receiverId: callRoom.participants[1],
              durationSec: callRoom.endTime.getTime() - callRoom.startTime.getTime(),
              startedAt: callRoom.startTime,
              endedAt: callRoom.endTime
            }
          });

          // Clean up Redis
          await redis.del(roomKey);
          
          // Notify all participants
          io.of('/call').to(roomId).emit('callEnded', callRoom);
        }
      } catch (error) {
        console.error('Error ending call:', error);
        socket.emit('error', 'Failed to end call');
      }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      try {
        // Find all rooms the user is in
        const rooms = Array.from(socket.rooms);
        for (const roomId of rooms) {
          if (roomId !== socket.id) { // Skip the socket's own room
            const roomKey = `call:${roomId}`;
            const room = await redis.get(roomKey);
            
            if (room) {
              const callRoom: CallRoom = JSON.parse(room);
              callRoom.participants = callRoom.participants.filter(p => p !== socket.id);
              
              if (callRoom.participants.length === 0) {
                // If no participants left, end the call
                await redis.del(roomKey);
                io.of('/call').to(roomId).emit('callEnded', { ...callRoom, status: 'ended' });
              } else {
                await redis.set(roomKey, JSON.stringify(callRoom));
                socket.to(roomId).emit('userLeft', { userId: socket.id, room: callRoom });
              }
            }
          }
        }
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    });
  });
} 