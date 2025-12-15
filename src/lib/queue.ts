import { Queue, Worker, QueueEvents } from "bullmq";
import { prisma } from "./prisma";
import { redis as connection } from "./redis";

// Shared configuration to ensure all keys hash to the same slot
const sharedQueueConfig = {
	connection,
	prefix: "{cashual}",
};

// Create Queues
export const messageQueue = new Queue("chat-messages", sharedQueueConfig);
export const matchQueue = new Queue("match-queue", sharedQueueConfig);

// Create Queue Events
const messageQueueEvents = new QueueEvents("chat-messages", sharedQueueConfig);

// Create Worker for chat messages
const messageWorker = new Worker(
	"chat-messages",
	async (job) => {
		const { content, senderId, receiverId, roomId } = job.data;

		try {
			const message = await prisma.text.create({
				data: {
					content,
					roomId,
					senderAnonId: senderId,
					receiverAnonId: receiverId,
				},
			});

			return message;
		} catch (error) {
			console.error("Error processing message:", error);
			throw error;
		}
	},
	sharedQueueConfig,
);

// Handle failed jobs
messageQueueEvents.on("failed", ({ jobId, failedReason }) => {
	console.error(`Job ${jobId} failed:`, failedReason);
});

// Handle completed jobs
messageQueueEvents.on("completed", ({ jobId, returnvalue }) => {
	console.log(`Job ${jobId} completed with result:`, returnvalue);
});
