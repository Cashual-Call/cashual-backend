import { Request, Response } from "express";
import ChatDBService from "../service/chat-db.service";
import { prisma } from "../lib/prisma";

export class HistoryController {
  private chatDBService: ChatDBService;

  constructor() {
    this.chatDBService = new ChatDBService();

    this.getChatHistory = this.getChatHistory.bind(this);
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
    res.json(chatHistory);
  }
}
