// import type Redis from "ioredis";
// // import { ensureRedisConnection } from "../config/redis.config";


// export class SearchService {
//   private redis: Redis;

//   constructor(redis: Redis) {
//     this.redis = redis;
//     this.setupRedisListeners();
//   }

//   private setupRedisListeners(): void {
//     this.redis.on("connect", () => {
//       console.log("Redis connected");
//     });

//     this.redis.on("error", (err) => {
//       console.error("Redis error:", err);
//     });

//     this.redis.on("close", () => {
//       console.log("Redis connection closed");
//     });

//     this.redis.on("reconnecting", () => {
//       console.log("Redis reconnecting...");
//     });
//   }

//   /**
//    * Store user's connection data
//    */
//   async storeUserConnection(socketId: string): Promise<void> {
//     try {
//       await ensureRedisConnection(this.redis);
      
//       // Add user to the global user set
//       await this.redis.sadd("all:users", socketId);
      
//       // Initialize or update user hash
//       await this.redis.hset(`user:${socketId}`, {
//         id: socketId,
//         isSearching: false,
//         interests: JSON.stringify([]),
//         lastActive: Date.now(),
//         activeChatId: ""
//       });
      
//       // Set TTL for user data (e.g., 24 hours)
//       await this.redis.expire(`user:${socketId}`, 86400);
//     } catch (error) {
//       console.error("Error storing user connection:", error);
//       throw new Error("Failed to store user connection");
//     }
//   }

//   /**
//    * Start searching for other users
//    */
//   async startSearch(socketId: string, interests: string[] = []): Promise<void> {
//     try {
//       await ensureRedisConnection(this.redis);
      
//       // Mark user as searching
//       await this.redis.hset(`user:${socketId}`, {
//         isSearching: true,
//         interests: JSON.stringify(interests),
//         lastActive: Date.now()
//       });
      
//       // Add user to searching set
//       await this.redis.sadd("searching:users", socketId);
      
//       // Add user to interest-based sets
//       for (const interest of interests) {
//         await this.redis.sadd(`interest:${interest.toLowerCase()}`, socketId);
//         // Set expiry for interest sets
//         await this.redis.expire(`interest:${interest.toLowerCase()}`, 3600); // 1 hour
//       }
//     } catch (error) {
//       console.error("Error starting search:", error);
//       throw new Error("Failed to start search");
//     }
//   }

//   /**
//    * Stop searching for other users
//    */
//   async stopSearch(socketId: string): Promise<void> {
//     try {
//       await ensureRedisConnection(this.redis);
      
//       // Get user's interests
//       const userInterests = JSON.parse(
//         await this.redis.hget(`user:${socketId}`, "interests") || "[]"
//       );
      
//       // Remove user from searching set
//       await this.redis.srem("searching:users", socketId);
      
//       // Remove user from interest-based sets
//       for (const interest of userInterests) {
//         await this.redis.srem(`interest:${interest.toLowerCase()}`, socketId);
//       }
      
//       // Update user status
//       await this.redis.hset(`user:${socketId}`, {
//         isSearching: false,
//         lastActive: Date.now()
//       });
//     } catch (error) {
//       console.error("Error stopping search:", error);
//       throw new Error("Failed to stop search");
//     }
//   }

//   /**
//    * Handle user disconnection
//    */
//   async handleDisconnect(socketId: string, reason: string): Promise<void> {
//     try {
//       await ensureRedisConnection(this.redis);
//       console.log(`User disconnected: ${socketId}, reason: ${reason}`);
      
//       // Get user data
//       const userData = await this.redis.hgetall(`user:${socketId}`);
      
//       if (userData) {
//         // Remove from searching if active
//         if (userData.isSearching === "true") {
//           await this.stopSearch(socketId);
//         }
        
//         // Handle active chat if any
//         if (userData.activeChatId) {
//           // Notify other users in chat about disconnection
//           await this.redis.publish("chat:userDisconnected", JSON.stringify({
//             userId: socketId,
//             chatId: userData.activeChatId
//           }));
//         }
//       }
      
//       // Keep user data for reconnection grace period (10 minutes)
//       await this.redis.expire(`user:${socketId}`, 600);
//     } catch (error) {
//       console.error("Error handling disconnect:", error);
//     }
//   }

//   /**
//    * Find a match for the user
//    */
//   async findMatch(socketId: string, interests: string[] = []): Promise<string | null> {
//     try {
//       await ensureRedisConnection(this.redis);
//       let potentialMatch: string | null = null;
      
//       // First try to match based on interests if the user has any
//       if (interests.length > 0) {
//         for (const interest of interests) {
//           // Get users interested in the same topic
//           const usersWithSameInterest = await this.redis.smembers(`interest:${interest.toLowerCase()}`);
          
//           // Filter out the current user
//           const otherUsers = usersWithSameInterest.filter(id => id !== socketId);
          
//           if (otherUsers.length > 0) {
//             // Pick a random user from the matching list
//             potentialMatch = otherUsers[Math.floor(Math.random() * otherUsers.length)];
//             break;
//           }
//         }
//       }
      
//       // If no match found by interests, try random matching
//       if (!potentialMatch) {
//         const allSearchingUsers = await this.redis.smembers("searching:users");
//         const otherUsers = allSearchingUsers.filter(id => id !== socketId);
        
//         if (otherUsers.length > 0) {
//           potentialMatch = otherUsers[Math.floor(Math.random() * otherUsers.length)];
//         }
//       }
      
//       if (potentialMatch) {
//         // Create a new chat session
//         const chatId = `chat:${Date.now()}:${Math.random().toString(36).substring(2, 9)}`;
        
//         // Remove both users from searching pools
//         await this.redis.srem("searching:users", socketId);
//         await this.redis.srem("searching:users", potentialMatch);
        
//         // Remove users from interest-based sets
//         const currentUserInterests = JSON.parse(
//           await this.redis.hget(`user:${socketId}`, "interests") || "[]"
//         );
//         const matchUserInterests = JSON.parse(
//           await this.redis.hget(`user:${potentialMatch}`, "interests") || "[]"
//         );
        
//         for (const interest of currentUserInterests) {
//           await this.redis.srem(`interest:${interest.toLowerCase()}`, socketId);
//         }
        
//         for (const interest of matchUserInterests) {
//           await this.redis.srem(`interest:${interest.toLowerCase()}`, potentialMatch);
//         }
        
//         // Add users to chat
//         await this.redis.sadd(`chat:${chatId}:users`, [socketId, potentialMatch]);
        
//         // Update user records
//         await this.redis.hset(`user:${socketId}`, {
//           isSearching: false,
//           activeChatId: chatId
//         });
        
//         await this.redis.hset(`user:${potentialMatch}`, {
//           isSearching: false,
//           activeChatId: chatId
//         });
        
//         // Set chat expiry (e.g., 24 hours)
//         await this.redis.expire(`chat:${chatId}:users`, 86400);

//         return chatId;
//       }
      
//       return null;
//     } catch (error) {
//       console.error("Error finding match:", error);
//       throw new Error("Failed to find a match");
//     }
//   }

//   /**
//    * Perform content search based on query and filters
//    */
//   async performSearch(
//     query: string,
//     filters?: {
//       type?: "user" | "chat" | "message";
//       dateRange?: { start: string; end: string };
//       tags?: string[];
//     }
//   ): Promise<SearchResult[]> {
//     // This would normally use a search engine like Elasticsearch
//     // For simplicity, we'll simulate a search with Redis
    
//     const results: SearchResult[] = [];
    
//     try {
//       await ensureRedisConnection(this.redis);
      
//       // Example: search messages
//       if (!filters?.type || filters.type === "message") {
//         // Fetch recent message IDs (in a real app, you'd use Redis Search)
//         const messageIds = await this.redis.zrevrange("recent:messages", 0, 50);
        
//         for (const msgId of messageIds) {
//           const messageData = await this.redis.hgetall(`message:${msgId}`);
          
//           if (messageData && messageData.content && 
//               messageData.content.toLowerCase().includes(query.toLowerCase())) {
            
//             results.push({
//               id: msgId,
//               type: "message",
//               content: messageData.content,
//               metadata: {
//                 sender: messageData.sender,
//                 timestamp: messageData.timestamp,
//                 chatId: messageData.chatId
//               }
//             });
//           }
//         }
//       }
      
//       // Example: search users (by username, bio, etc.)
//       if (!filters?.type || filters.type === "user") {
//         // In a real app, you'd use Redis Search for this
//         const userIds = await this.redis.smembers("all:users");
        
//         for (const userId of userIds) {
//           const userData = await this.redis.hgetall(`user:${userId}`);
          
//           // Check if username or bio contains the query
//           if (userData && 
//               ((userData.username && userData.username.toLowerCase().includes(query.toLowerCase())) ||
//                (userData.bio && userData.bio.toLowerCase().includes(query.toLowerCase())))) {
            
//             results.push({
//               id: userId,
//               type: "user",
//               content: userData.username || userData.id,
//               metadata: {
//                 bio: userData.bio,
//                 lastActive: userData.lastActive
//               }
//             });
//           }
//         }
//       }
      
//       // Apply additional filters
//       let filteredResults = [...results];
      
//       // Filter by date range if specified
//       if (filters?.dateRange) {
//         const { start, end } = filters.dateRange;
//         const startDate = new Date(start).getTime();
//         const endDate = new Date(end).getTime();
        
//         filteredResults = filteredResults.filter(result => {
//           const timestamp = 
//             result.type === "message" ? parseInt(result.metadata.timestamp) :
//             result.type === "user" ? parseInt(result.metadata.lastActive) : 0;
          
//           return timestamp >= startDate && timestamp <= endDate;
//         });
//       }
      
//       // Filter by tags if specified
//       if (filters?.tags && filters.tags.length > 0) {
//         filteredResults = filteredResults.filter(result => {
//           // Check if the item has tags that match any in the filter
//           const itemTags = result.metadata.tags || [];
//           return filters.tags!.some(tag => itemTags.includes(tag));
//         });
//       }
      
//       return filteredResults.slice(0, 20); // Limit to 20 results
//     } catch (error) {
//       console.error("Error performing search:", error);
//       throw new Error("Search failed");
//     }
//   }
// }