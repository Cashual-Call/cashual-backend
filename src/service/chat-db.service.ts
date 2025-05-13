import ChatRoomService from "./chat-room.service";
import { messageQueue } from "../lib/queue";

export default class ChatDBService {
  private chatRoomService: ChatRoomService;

  constructor() {
    this.chatRoomService = new ChatRoomService();
  }

  async addMessage(
    message: string,
    senderId: string,
    receiverId: string,
    chatRoomId: string
  ) {
    const chatRoom = await this.chatRoomService.getChatRoom(chatRoomId);

    if (!chatRoom) {
      throw new Error("Chat room not found");
    }

    const job = await messageQueue.add({
      content: message,
      senderId,
      receiverId,
      chatRoomId,
    });

    const result = await job.finished();
    return result;
  }

  private async getQueuedMessages(chatRoomId: string) {
    const jobs = await messageQueue.getJobs(['waiting', 'active']);
    return jobs
      .filter(job => job.data.chatRoomId === chatRoomId)
      .map(job => ({
        id: job.id,
        content: job.data.content,
        senderId: job.data.senderId,
        receiverId: job.data.receiverId,
        chatRoomId: job.data.chatRoomId,
        sentAt: job.timestamp,
        status: 'queued'
      }));
  }

  async getMessages(chatRoomId: string) {
    // Get processed messages from database
    const processedMessages = await this.chatRoomService.getMessages(chatRoomId);
    
    // Get queued messages
    const queuedMessages = await this.getQueuedMessages(chatRoomId);
    
    // Combine and sort all messages by sentAt
    const allMessages = [...processedMessages, ...queuedMessages].sort(
      (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
    );

    return allMessages;
  }  
}
