import ChatRoomService from "./chat-room.service";
import { messageQueue } from "../lib/queue";
import { v4 as uuidv4 } from "uuid";
export default class ChatDBService {
  private chatRoomService: ChatRoomService;

  constructor() {
    this.chatRoomService = new ChatRoomService();
  }

  async addMessage(
    message: string,
    senderId: string,
    receiverId: string,
    roomId: string
  ) {
    // TODO: Add chat room to database
    const chatRoom = await this.chatRoomService.getRoom(roomId);

    if (!chatRoom) {
      throw new Error("Chat room not found");
    }

    const messageObj = {
      id: uuidv4(),
      content: message,
      senderId,
      receiverId,
      roomId,
      timestamp: new Date().toISOString(),
    }

    await messageQueue.add('processMessage', messageObj);

    // Wait for job completion and return result
    return messageObj;
  }

  private async getQueuedMessages(chatRoomId: string) {
    // Get jobs in waiting and active states
    const waitingJobs = await messageQueue.getJobs(['waiting', 'active']);
    
    return waitingJobs
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