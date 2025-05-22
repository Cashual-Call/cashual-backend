// import { Server, Socket } from "socket.io";
// import Redis from "ioredis";
// import { SearchController } from "../service/match.service";
// import { SearchEvent } from "../config/search";

// interface SearchResult {
//   id: string;
//   type: "user" | "chat" | "message";
//   content: string;
//   metadata: Record<string, any>;
// }

// interface SearchQuery {
//   query: string;
//   filters?: {
//     type?: "user" | "chat" | "message";
//     dateRange?: { start: string; end: string };
//     tags?: string[];
//   };
// }

// interface UserSearchStatus {
//   isSearching: boolean;
//   interests: string[];
//   lastActive: number;
// }

// // Redis connection options
// const redisOptions = {
//   retryStrategy: (times: number) => {
//     const delay = Math.min(times * 50, 2000);
//     return delay;
//   },
//   maxRetriesPerRequest: 3,
//   enableReadyCheck: true,
//   reconnectOnError: (err: Error) => {
//     const targetError = "READONLY";
//     if (err.message.includes(targetError)) {
//       return true;
//     }
//     return false;
//   }
// };

// // Helper function to ensure Redis connection
// const ensureRedisConnection = async (redis: Redis) => {
//   if (!redis.status || redis.status !== "ready") {
//     try {
//       await redis.connect();
//     } catch (err) {
//       console.error("Failed to reconnect to Redis:", err);
//       throw new Error("Redis connection failed");
//     }
//   }
// };

// export function setupSearchHandlers(io: Server, redis: Redis) {
//   // Handle Redis connection events
//   redis.on("connect", () => {
//     console.log("Redis connected");
//   });

//   redis.on("error", (err) => {
//     console.error("Redis error:", err);
//   });

//   redis.on("close", () => {
//     console.log("Redis connection closed");
//   });

//   redis.on("reconnecting", () => {
//     console.log("Redis reconnecting...");
//   });

//   io.of("/search").on("connection", (socket: Socket) => {
//     console.log("Search client connected:", socket.id);
    
//     const searchController = new SearchController(socket, redis);
    
//     // // Store user connection
//     // searchController.storeUserConnection();

//     // // Start searching for matches
//     // socket.on(SearchEvent.START_SEARCH, async (interests: string[] = []) => {
//     //   await searchController.startSearch(interests);
//     // });

//     // // Stop searching
//     // socket.on(SearchEvent.STOP_SEARCH, async () => {
//     //   await searchController.stopSearch();
//     // });

//     // // Text search for content
//     // socket.on(SearchEvent.SEARCH, async (searchQuery: any) => {
//     //   await searchController.performSearch(searchQuery);
//     // });

//     // // Handle disconnection
//     // socket.on("disconnect", async (reason: string) => {
//     //   await searchController.handleDisconnect(reason);
//     // });

//     // Add error handler for the socket
//     socket.on("error", async (error) => {
//       console.error("Socket error for client:", socket.id, error);
//       socket.emit(SearchEvent.ERROR, "An error occurred with your connection");
//     });
//   });
// }

// async function findMatch(socket: Socket, redis: Redis, interests: string[] = []) {
//   try {
//     await ensureRedisConnection(redis);
//     let potentialMatch: string | null = null;
    
//     // First try to match based on interests if the user has any
//     if (interests.length > 0) {
//       for (const interest of interests) {
//         // Get users interested in the same topic
//         const usersWithSameInterest = await redis.smembers(`interest:${interest.toLowerCase()}`);
        
//         // Filter out the current user
//         const otherUsers = usersWithSameInterest.filter(id => id !== socket.id);
        
//         if (otherUsers.length > 0) {
//           // Pick a random user from the matching list
//           potentialMatch = otherUsers[Math.floor(Math.random() * otherUsers.length)];
//           break;
//         }
//       }
//     }
    
//     // If no match found by interests, try random matching
//     if (!potentialMatch) {
//       const allSearchingUsers = await redis.smembers("searching:users");
//       const otherUsers = allSearchingUsers.filter(id => id !== socket.id);
      
//       if (otherUsers.length > 0) {
//         potentialMatch = otherUsers[Math.floor(Math.random() * otherUsers.length)];
//       }
//     }
    
//     if (potentialMatch) {
//       // Create a new chat session
//       const chatId = `chat:${Date.now()}:${Math.random().toString(36).substring(2, 9)}`;
      
//       // Remove both users from searching pools
//       await redis.srem("searching:users", socket.id);
//       await redis.srem("searching:users", potentialMatch);
      
//       // Remove users from interest-based sets
//       const currentUserInterests = JSON.parse(await redis.hget(`user:${socket.id}`, "interests") || "[]");
//       const matchUserInterests = JSON.parse(await redis.hget(`user:${potentialMatch}`, "interests") || "[]");
      
//       for (const interest of currentUserInterests) {
//         await redis.srem(`interest:${interest.toLowerCase()}`, socket.id);
//       }
      
//       for (const interest of matchUserInterests) {
//         await redis.srem(`interest:${interest.toLowerCase()}`, potentialMatch);
//       }
      
//       // Add users to chat
//       await redis.sadd(`chat:${chatId}:users`, [socket.id, potentialMatch]);
      
//       // Update user records
//       await redis.hset(`user:${socket.id}`, {
//         isSearching: false,
//         activeChatId: chatId
//       });
      
//       await redis.hset(`user:${potentialMatch}`, {
//         isSearching: false,
//         activeChatId: chatId
//       });
      
//       // Notify both users
//       socket.emit("matchFound", { chatId });
      
//       // Notify the other user through Redis pub/sub
//       await redis.publish("chat:matchFound", JSON.stringify({
//         userId: potentialMatch,
//         chatId: chatId
//       }));
      
//       // Set chat expiry (e.g., 24 hours)
//       await redis.expire(`chat:${chatId}:users`, 86400);
//     } else {
//       // No match found, keep user in searching state
//       socket.emit("searching");
//     }
//   } catch (error) {
//     console.error("Error finding match:", error);
//     socket.emit("error", "Failed to find a match");
//   }
// }

// /**
//  * Perform content search based on query and filters
//  */
// async function performSearch(
//   redis: Redis, 
//   query: string, 
//   filters?: {
//     type?: "user" | "chat" | "message";
//     dateRange?: { start: string; end: string };
//     tags?: string[];
//   }
// ): Promise<SearchResult[]> {
//   // This would normally use a search engine like Elasticsearch
//   // For simplicity, we'll simulate a search with Redis
  
//   const results: SearchResult[] = [];
  
//   // For demonstration purposes - in a real implementation, 
//   // you would use Redis search capabilities or integrate with a search service
  
//   // Example: search messages
//   if (!filters?.type || filters.type === "message") {
//     // Fetch recent message IDs (in a real app, you'd use Redis Search)
//     const messageIds = await redis.zrevrange("recent:messages", 0, 50);
    
//     for (const msgId of messageIds) {
//       const messageData = await redis.hgetall(`message:${msgId}`);
      
//       if (messageData && messageData.content && 
//           messageData.content.toLowerCase().includes(query.toLowerCase())) {
        
//         results.push({
//           id: msgId,
//           type: "message",
//           content: messageData.content,
//           metadata: {
//             sender: messageData.sender,
//             timestamp: messageData.timestamp,
//             chatId: messageData.chatId
//           }
//         });
//       }
//     }
//   }
  
//   // Example: search users (by username, bio, etc.)
//   if (!filters?.type || filters.type === "user") {
//     // In a real app, you'd use Redis Search for this
//     const userIds = await redis.smembers("all:users");
    
//     for (const userId of userIds) {
//       const userData = await redis.hgetall(`user:${userId}`);
      
//       // Check if username or bio contains the query
//       if (userData && 
//           ((userData.username && userData.username.toLowerCase().includes(query.toLowerCase())) ||
//            (userData.bio && userData.bio.toLowerCase().includes(query.toLowerCase())))) {
        
//         results.push({
//           id: userId,
//           type: "user",
//           content: userData.username || userData.id,
//           metadata: {
//             bio: userData.bio,
//             lastActive: userData.lastActive
//           }
//         });
//       }
//     }
//   }
  
//   // Apply additional filters
//   let filteredResults = [...results];
  
//   // Filter by date range if specified
//   if (filters?.dateRange) {
//     const { start, end } = filters.dateRange;
//     const startDate = new Date(start).getTime();
//     const endDate = new Date(end).getTime();
    
//     filteredResults = filteredResults.filter(result => {
//       const timestamp = 
//         result.type === "message" ? parseInt(result.metadata.timestamp) :
//         result.type === "user" ? parseInt(result.metadata.lastActive) : 0;
      
//       return timestamp >= startDate && timestamp <= endDate;
//     });
//   }
  
//   // Filter by tags if specified
//   if (filters?.tags && filters.tags.length > 0) {
//     filteredResults = filteredResults.filter(result => {
//       // Check if the item has tags that match any in the filter
//       const itemTags = result.metadata.tags || [];
//       return filters.tags!.some(tag => itemTags.includes(tag));
//     });
//   }
  
//   return filteredResults.slice(0, 20); // Limit to 20 results
// }