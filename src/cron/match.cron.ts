import { Queue, Worker } from 'bullmq';
import { redis as connection } from '../lib/redis';
import { AvailableUserService } from '../service/available-user.service';
import { MatchService } from '../service/match.service';

const availableUserService = new AvailableUserService("chat");
const matchService = new MatchService("chat");

// Create a queue
const matchQueue = new Queue('match-queue', { connection });

// Create a worker to process jobs
const worker = new Worker(
  'match-queue',
  async (job) => {
    // const availableUsers = await availableUserService.getAvailableUsers();
    // TODO: implement match logic
    // matchService.setMatch(availableUsers[0].userId, availableUsers[1].userId);


    // console.log(`Processing job ${job.id} at ${new Date().toISOString()}`);
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
  console.log(`Job ${job.id} completed`);
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
