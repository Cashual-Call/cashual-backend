import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';

const prisma = new PrismaClient();

interface ChatMessage {
  id: string;
  content: string;
  senderId: string;
  receiverId: string;
  timestamp: Date;
}

export function setupChatHandlers(io: Server, redis: Redis) {
  io.of('/chat').on('connection', (socket: Socket) => {
    console.log('Chat client connected:', socket.id);

    // Join a chat room
    socket.on('join', async (roomId: string) => {
      socket.join(roomId);
      console.log(`Client ${socket.id} joined room ${roomId}`);
    });

    // Leave a chat room
    socket.on('leave', (roomId: string) => {
      socket.leave(roomId);
      console.log(`Client ${socket.id} left room ${roomId}`);
    });

    // Handle new messages
    socket.on('message', async (data: Omit<ChatMessage, 'id' | 'timestamp'>) => {
      try {
        const message = await prisma.text.create({
          data: {
            content: data.content,
            senderId: data.senderId,
            receiverId: data.receiverId,
          },
        });

        // Broadcast to the room
        const roomId = [data.senderId, data.receiverId].sort().join('-');
        io.of('/chat').to(roomId).emit('message', message);

        // Store in Redis for recent messages
        await redis.lpush(`chat:${roomId}`, JSON.stringify(message));
        await redis.ltrim(`chat:${roomId}`, 0, 49); // Keep last 50 messages
      } catch (error) {
        console.error('Error saving message:', error);
        socket.emit('error', 'Failed to send message');
      }
    });

    // Get recent messages
    socket.on('getRecentMessages', async (roomId: string) => {
      try {
        const messages = await redis.lrange(`chat:${roomId}`, 0, -1);
        const parsedMessages = messages.map(msg => JSON.parse(msg));
        socket.emit('recentMessages', parsedMessages);
      } catch (error) {
        console.error('Error fetching recent messages:', error);
        socket.emit('error', 'Failed to fetch recent messages');
      }
    });

    socket.on('disconnect', () => {
      console.log('Chat client disconnected:', socket.id);
    });
  });
} 