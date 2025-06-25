import { Worker } from 'bullmq';
import { redis as connection } from '../lib/redis';
import { MatchService } from '../service/match.service';
import { matchQueue } from '../lib/queue';

const matchServiceChat = new MatchService("chat");
const matchServiceCall = new MatchService("call");

// Create a queue
// Create a worker to process jobs
const worker = new Worker(
  'match-queue',
  async (job) => {
    await matchServiceChat.bestMatch();
    await matchServiceCall.bestMatch();
  },
  { connection }
);

// Add a recurring job that runs every 2 seconds
export const addRecurringJob = async () => {
  await matchQueue.add(
    'match-job',
    {},
    {
      repeat: {
        every: 2000, // 2 seconds in milliseconds
      },
    }
  );
};

// Handle worker events
worker.on('completed', (job) => {
//   console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});

// Cleanup function
const cleanup = async () => {
  await worker.close();
  await matchQueue.close();
  await connection.quit();
};

// Handle process termination
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
