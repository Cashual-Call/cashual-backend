import { Request, Response } from "express";
import { RoomStateService } from "../service/room-state.service";

export class HeartbeatController {
  constructor(private readonly roomStateService: RoomStateService) {
    this.heartbeat = this.heartbeat.bind(this);
  }

  heartbeat = async (req: Request, res: Response) => {
    const { roomId, userId } = req.body;
    const message = await this.roomStateService.heartbeat(roomId, userId);
    res.status(200).json({ message });
  };
}
