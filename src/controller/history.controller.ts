import { Request, Response } from "express";
import ChatDBService from "../service/chat-db.service";
import { prisma } from "../lib/prisma";

export class HistoryController {
  private chatDBService: ChatDBService;

  constructor() {
    this.chatDBService = new ChatDBService();

    this.getChatHistory = this.getChatHistory.bind(this);
    this.getCallHistory = this.getCallHistory.bind(this);
    this.getRooms = this.getRooms.bind(this);
  }

  async getRooms(req: Request, res: Response) {
    const publicKey = req.user?.publicKey || "";

    const rooms = await prisma.room.findMany({
      where: {
        OR: [
          { user1: { publicKey: publicKey } },
          { user2: { publicKey: publicKey } },
        ],
      },
      include: {
        user1: true,
        user2: true,
      },
    });

    res.json({ data: rooms });
  }

  async getChatHistory(req: Request, res: Response) {
    const publicKey = req.user?.publicKey || "";

    // TODO: CREATE USER SERVICE
    const user = await prisma.user.findUnique({
      where: { publicKey },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const { chatRoomId } = req.query;

    const chatHistory = await this.chatDBService.getMessages(
      chatRoomId as string
    );
    res.json({data: chatHistory});
  }

  async getCallHistory(req: Request, res: Response) {
    const publicKey = req.user?.publicKey || "";

    const user = await prisma.user.findUnique({
      where: { publicKey },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const callHistory: any[] = []; //TODO: await this.callDBService.getCalls(publicKey);
    res.json({ data: callHistory });
  }
}
