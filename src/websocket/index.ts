import { Server } from 'socket.io';
import Redis from 'ioredis';
import { setupChatHandlers } from './chat';
// import { setupSearchHandlers } from './search';
import { setupCallHandlers } from './call';

export function setupWebSocketHandlers(io: Server) {
  // Initialize all WebSocket handlers
  setupChatHandlers(io);
  // setupSearchHandlers(io, redis);
  setupCallHandlers(io);

  // Global error handling
  io.on('error', (error) => {
    console.error('WebSocket server error:', error);
  });

  // Global connection handling
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('error', (error) => {
      console.error(`Socket ${socket.id} error:`, error);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
} 