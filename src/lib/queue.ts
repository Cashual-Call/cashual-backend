import Bull from "bull";
import { prisma } from "./prisma";

// Create message queue
export const messageQueue = new Bull(
  "chat-messages",
  process.env.REDIS_URL || "redis://localhost:6379"
);

// Process messages
messageQueue.process(async (job) => {
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
});

// Handle failed jobs
messageQueue.on("failed", (job, error) => {
  console.error(`Job ${job.id} failed:`, error);
});

// Handle completed jobs
messageQueue.on("completed", (job, result) => {
  console.log(`Job ${job.id} completed with result:`, result);
});
