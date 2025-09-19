import { Request, Response } from "express";
import { MatchService } from "../service/match.service";
import { verifyUserId } from "../utils/user-id";

export class SearchController {
  private matchService: MatchService;

  constructor(searchType: string) {
    this.matchService = new MatchService(searchType);

    this.startSearch = this.startSearch.bind(this);
    this.stopSearch = this.stopSearch.bind(this);
    this.getMatch = this.getMatch.bind(this);
    this.heartbeat = this.heartbeat.bind(this);
  }

  async startSearch(req: Request, res: Response) {
    const { userId } = req.params;

    const result = await this.matchService.addUser(userId, req.user?.username || "", []);

    res.status(200).json({ message: "Search started", data: { user: result } });
    return;
  }

  async stopSearch(req: Request, res: Response) {
    const { userId } = req.params;

    if (!userId) {
      throw new Error("User ID is required");
    }

    await this.matchService.removeUser(userId);

    res.status(200).json({ message: "Search stopped" });
    return;
  }

  async getMatch(req: Request, res: Response) {
    const { userId } = req.params;

    if (!userId) {
      throw new Error("User ID is required");
    }

    const match = await this.matchService.getMatchedJWT(userId);

    if (!match) {
      return res.status(404).json({ message: "No match found" });
    }

    res.status(200).json({ data: match, message: "Match found" });
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
}
