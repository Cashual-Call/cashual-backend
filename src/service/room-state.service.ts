import { redis } from "../lib/redis";

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

export class RoomStateService {
  constructor() {
    this.heartbeat = this.heartbeat.bind(this);
    this.makeDisconnect = this.makeDisconnect.bind(this);
    this.removeDisconnectedUsers = this.removeDisconnectedUsers.bind(this);
  }

  async heartbeat(roomId: string, userId: string): Promise<boolean> {
    try {
      const timenow: number = Date.now();
      const roomStateRaw = await redis.get(`room:${roomId}`);

      if (!roomStateRaw) {
        return false;
      }

      const roomState = JSON.parse(roomStateRaw) as RoomState;

      let userUpdated = false;

      if (roomState.user1.id === userId) {
        roomState.user1.lastHeartbeat = timenow;
        roomState.user1.heartbeatCount++;
        userUpdated = true;
      } else if (roomState.user2.id === userId) {
        roomState.user2.lastHeartbeat = timenow;
        roomState.user2.heartbeatCount++;
        userUpdated = true;
      }

      if (!userUpdated) {
        return false; // user not found in the room
      }

      await redis.set(`room:${roomId}`, JSON.stringify(roomState));
      return true;
    } catch (error) {
      console.error(`Heartbeat error for room ${roomId}:`, error);
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
