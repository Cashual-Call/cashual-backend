import { ExpressAdapter } from "@bull-board/express";
import { createBullBoard } from "@bull-board/api";
import { messageQueue, matchQueue } from "../lib/queue";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";

const BASE_PATH = "/admin/queues";

const serverAdapter = new ExpressAdapter();

serverAdapter.setBasePath(BASE_PATH);

createBullBoard({
	queues: [new BullMQAdapter(messageQueue), new BullMQAdapter(matchQueue)],
	serverAdapter,
});

const router = serverAdapter.getRouter();

export { router, BASE_PATH };
