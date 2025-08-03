import { Request, Response } from "express";
import { RoomStateService } from "../service/room-state.service";
import { verifyToken } from "../middleware/socket.middleware";

export class HeartbeatController {
  constructor(private readonly roomStateService: RoomStateService) {
    this.heartbeat = this.heartbeat.bind(this);
  }

  heartbeat = async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1] as string;
    const { roomId, senderId, ...rest } = verifyToken(token);

    if (!roomId) {
      return res.status(400).json({
        success: false,
        error: "Missing Room Id",
      });
    }

    const result = await this.roomStateService.heartbeat(roomId, senderId);

    const message =
      result.state?.state === "offline"
        ? `User ${senderId} is offline`
        : result.state?.state === "disconnected"
        ? `User ${senderId} is disconnected`
        : `Heartbeat successful for user ${senderId} in room ${roomId}`;

    if (result.success) {
      res.status(200).json({
        success: true,
        message,
        count: result.index,
        state: result.state,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        roomId,
        user: req.user?.publicKey,
      });
    }
  };
}
