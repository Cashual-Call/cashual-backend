import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const prisma = new PrismaClient();

interface SearchResult {
  id: string;
  type: 'user' | 'chat' | 'message';
  content: string;
  metadata: Record<string, any>;
}

export function setupSearchHandlers(io: Server, redis: Redis) {
  io.of('/search').on('connection', (socket: Socket) => {
    console.log('Search client connected:', socket.id);

    // Handle search requests
    socket.on('search', async (query: string) => {
      try {
        // Validate query is a string
        if (typeof query !== 'string') {
          throw new Error('Search query must be a string');
        }

        // Check Redis cache first
        const cacheKey = `search:${query}`;
        const cachedResults = await redis.get(cacheKey);

        if (cachedResults) {
          socket.emit('searchResults', JSON.parse(cachedResults));
          return;
        }

        // Perform search in database
        const results: SearchResult[] = [];

        // Search users
        const users = await prisma.user.findMany({
          where: {
            OR: [
              { username: { contains: query, mode: 'insensitive' } },
              // { email: { contains: query, mode: 'insensitive' } }
            ]
          },
          select: {
            id: true,
            username: true,
            // email: true,
            avatarUrl: true
          },
          take: 10
        });

        results.push(...users.map(user => ({
          id: user.id,
          type: 'user' as const,
          content: user.username || '',
          metadata: {
            // email: user.email,
            avatar: user.avatarUrl
          }
        })));

        // Search messages
        const messages = await prisma.text.findMany({
          where: {
            content: { contains: query, mode: 'insensitive' }
          },
          take: 10,
          include: {
            sender: true
          }
        });

        results.push(...messages.map(message => ({
          id: message.id,
          type: 'message' as const,
          content: message.content,
          metadata: {
            sender: message.sender.username,
            timestamp: message.sentAt
          }
        })));

        // Cache results for 5 minutes
        await redis.setex(cacheKey, 300, JSON.stringify(results));

        socket.emit('searchResults', results);
      } catch (error) {
        console.error('Error performing search:', error);
        socket.emit('error', 'Failed to perform search');
      }
    });

    socket.on('disconnect', () => {
      console.log('Search client disconnected:', socket.id);
    });
  });
} 