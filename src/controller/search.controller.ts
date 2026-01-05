import { Request, Response } from "express";
import { MatchService } from "../service/match.service";
import { generateToken } from "../middleware/socket.middleware";
import { verifyUserId } from "../utils/user-id";
import { auth } from "../lib/auth";

export class SearchController {
  private matchService: MatchService;

  constructor(searchType: string) {
    this.matchService = new MatchService(searchType);

    this.startSearch = this.startSearch.bind(this);
    this.stopSearch = this.stopSearch.bind(this);
    this.heartbeat = this.heartbeat.bind(this);
    this.createPublicRoom = this.createPublicRoom.bind(this);
  }

  async startSearch(req: Request, res: Response) {
    const result = await this.matchService.addUser(
      req.user?.id || "",
      req.user?.username || req.user?.name || "",
      []
    );

    res.status(200).json({ message: "Search started", data: { user: result } });
    return;
  }

  async stopSearch(req: Request, res: Response) {
    const userId = req.user?.id || "";

    if (!userId) {
      throw new Error("User ID is required");
    }

    await this.matchService.removeUser(userId);

    res.status(200).json({ message: "Search stopped" });
    return;
  }

  async heartbeat(req: Request, res: Response) {
    const { userId } = req.params;

    if (!userId) {
      throw new Error("User ID is required");
    }

    const user = await verifyUserId(userId);

    if (!user) {
      throw new Error("User is Not Validated");
    }

    await this.matchService.updateUserHeartbeat(userId);

    res.status(200).json({ message: "Heartbeat updated" });
    return;
  }

  async createPublicRoom(req: Request, res: Response) {
    const data = {
      senderId: req.user?.username || req.user?.name || "",
      receiverId: "public-room",
      roomId: "general",
    };
    const jwt = generateToken(data);

    res.status(200).json({
      message: "Public room Token created",
      data: {
        jwt,
        data,
      },
    });
    return;
  }

  async getStatus(req: Request, res: Response) {
    const { userId } = req.params;

    if (!userId) {
      throw new Error("User ID is required");
    }

    const user = await verifyUserId(userId);
  }
}
