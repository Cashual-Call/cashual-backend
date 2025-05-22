import { Queue, Worker, QueueEvents } from "bullmq";
import { prisma } from "./prisma";
import { redis as connection } from "./redis";

// Create message queue
export const messageQueue = new Queue("chat-messages", { connection });

export const availableUserQueue = new Queue("available-users", { connection });

export const matchQueue = new Queue("match-queue", { connection });

// Create queue events
const messageQueueEvents = new QueueEvents("chat-messages", { connection });

// TODO: HANDLE CODE IN DIFFERENT FILES
// Process messages
const messageWorker = new Worker(
  "chat-messages",
  async (job) => {
    const { content, senderId, receiverId, chatRoomId } = job.data;

    try {
      const message = await prisma.text.create({
        data: {
          content,
          senderId,
          receiverId,
          chatRoomId,
        },
      });

      return message;
    } catch (error) {
      console.error("Error processing message:", error);
      throw error;
    }
  },
  { connection }
);

// Handle failed jobs
messageQueueEvents.on("failed", ({ jobId, failedReason }) => {
  console.error(`Job ${jobId} failed:`, failedReason);
});

// Handle completed jobs
messageQueueEvents.on("completed", ({ jobId, returnvalue }) => {
  console.log(`Job ${jobId} completed with result:`, returnvalue);
});
