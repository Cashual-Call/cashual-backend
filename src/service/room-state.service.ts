import { redis } from "../lib/redis";
import { PointService } from "./point.service";

interface IUser {
  id: string;
  lastHeartbeat: number;
  heartbeatCount: number;
  state: "online" | "offline" | "disconnected";
}

interface RoomState {
  roomId: string;
  roomType: "chat" | "call";
  user1: IUser;
  user2: IUser;
}

const HEARTBEAT_TIMEOUT = 10000;
const HEARTBEATS_PER_POINT = 10; // How many heartbeats needed to earn a point

export class RoomStateService {
  private pointService: PointService;

  constructor() {
    this.pointService = new PointService();
    this.heartbeat = this.heartbeat.bind(this);
    this.makeDisconnect = this.makeDisconnect.bind(this);
    this.removeDisconnectedUsers = this.removeDisconnectedUsers.bind(this);
    this.initializeRoomState = this.initializeRoomState.bind(this);
    this.awardHeartbeatPoints = this.awardHeartbeatPoints.bind(this);
  }

  private async awardHeartbeatPoints(
    userId: string,
    heartbeatCount: number,
    roomType: "chat" | "call"
  ): Promise<void> {
    // Award points every HEARTBEATS_PER_POINT heartbeats
    if (heartbeatCount % HEARTBEATS_PER_POINT === 0) {
      const pointsToAward = calculatePoints(heartbeatCount, roomType);
      const description = `Heartbeat activity in ${roomType} room (${heartbeatCount} heartbeats)`;
      
      try {
        await this.pointService.addPoints(userId, pointsToAward, description);
        console.log(`Awarded ${pointsToAward} points to user ${userId} for ${roomType} activity`);
      } catch (error) {
        console.error(`Failed to award heartbeat points to user ${userId}:`, error);
      }
    }
  }

  async heartbeat(
    roomId: string,
    userId: string,
    username: string,
  ): Promise<{ success: boolean; error?: string; index?: number; state?: IUser }> {
    try {
      const timenow: number = Date.now();
      const roomStateRaw = await redis.get(`room:${roomId}`);

      if (!roomStateRaw) {
        return {
          success: false,
          error: `Room state not found for room ${roomId}. Room may not be initialized yet.`,
        };
      }

      const roomState = JSON.parse(roomStateRaw) as RoomState;

      let userUpdated = false;
      let heartbeatCount = 0;
      let userState: any;

      if (roomState.user1.id === username) {
        roomState.user1.lastHeartbeat = timenow;
        roomState.user1.heartbeatCount++;
        heartbeatCount = roomState.user1.heartbeatCount;
        userState = roomState.user2;
        userUpdated = true;
        
        // Award points for heartbeat activity
        await this.awardHeartbeatPoints(userId, heartbeatCount, roomState.roomType);
      } else if (roomState.user2.id === username) {
        roomState.user2.lastHeartbeat = timenow;
        roomState.user2.heartbeatCount++;
        heartbeatCount = roomState.user2.heartbeatCount;
        userState = roomState.user2;
        userUpdated = true;
        
        // Award points for heartbeat activity
        await this.awardHeartbeatPoints(userId, heartbeatCount, roomState.roomType);
      }

      if (!userUpdated) {
        return {
          success: false,
          error: `User ${username} not found in room ${roomId}. Expected users: ${roomState.user1.id}, ${roomState.user2.id}`,
        };
      }

      await redis.set(`room:${roomId}`, JSON.stringify(roomState));
      return { success: true, index: heartbeatCount, state: userState };
    } catch (error) {
      console.error(`Heartbeat error for room ${roomId}:`, error);
      return {
        success: false,
        error: `Internal error during heartbeat processing: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  async initializeRoomState(
    roomId: string,
    roomType: "chat" | "call",
    user1Id: string,
    user2Id: string
  ): Promise<boolean> {
    try {
      const timenow: number = Date.now();

      const roomState: RoomState = {
        roomId,
        roomType,
        user1: {
          id: user1Id,
          lastHeartbeat: timenow,
          heartbeatCount: 0,
          state: "online",
        },
        user2: {
          id: user2Id,
          lastHeartbeat: timenow,
          heartbeatCount: 0,
          state: "online",
        },
      };

      await redis.set(`room:${roomId}`, JSON.stringify(roomState));
      console.log(
        `Room state initialized for room ${roomId} with users ${user1Id} and ${user2Id}`
      );
      return true;
    } catch (error) {
      console.error(`Error initializing room state for room ${roomId}:`, error);
      return false;
    }
  }

  async makeDisconnect() {
    const timenow: number = Date.now();

    const allRooms = await redis.keys("room:*");
    for (const room of allRooms) {
      const roomStateRaw = await redis.get(room);
      if (!roomStateRaw) {
        continue;
      }

      const roomState = JSON.parse(roomStateRaw) as RoomState;

      if (
        roomState.user1.state === "online" &&
        roomState.user1.lastHeartbeat < timenow - HEARTBEAT_TIMEOUT
      ) {
        roomState.user1.state = "offline";
      } else if (
        roomState.user1.state === "offline" &&
        roomState.user1.lastHeartbeat < timenow - HEARTBEAT_TIMEOUT
      ) {
        roomState.user1.state = "disconnected";
      }

      if (
        roomState.user2.state === "online" &&
        roomState.user2.lastHeartbeat < timenow - HEARTBEAT_TIMEOUT
      ) {
        roomState.user2.state = "offline";
      } else if (
        roomState.user2.state === "offline" &&
        roomState.user2.lastHeartbeat < timenow - HEARTBEAT_TIMEOUT
      ) {
        roomState.user2.state = "disconnected";
      }

      await redis.set(room, JSON.stringify(roomState));
    }
  }

  async removeDisconnectedUsers() {
    const allRooms = await redis.keys("room:*");
    for (const room of allRooms) {
      const roomStateRaw = await redis.get(room);
      if (!roomStateRaw) {
        continue;
      }

      const roomState = JSON.parse(roomStateRaw) as RoomState;
      if (roomState.user1.state === "disconnected") {
        await redis.del(room);
      }

      if (roomState.user2.state === "disconnected") {
        await redis.del(room);
      }

      await redis.set(room, JSON.stringify(roomState));
    }
  }
}
