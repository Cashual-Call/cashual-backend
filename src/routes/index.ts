import { Router, Request, Response } from "express";

import userRouter from "./user.route";
import historyRouter from "./history.route";
import uploadRouter from "./upload.route";
import searchRouter from "./search.route";
import heartbeatRouter from "./heartbeat.route";
import paymentRouter from "./payment.route";
import reportRouter from "./report.route";
import sseRouter from "./sse.route";
import path from "node:path";
import { router as bullRouter, BASE_PATH as BULL_PATH } from "./bull.route";

const router = Router();

router.use("/api/v1/users", userRouter);
router.use("/api/v1/search", searchRouter);
router.use("/api/v1/history", historyRouter);
router.use("/api/v1/upload", uploadRouter);
router.use("/api/v1/heartbeat", heartbeatRouter);
router.use("/api/v1/payment", paymentRouter);
router.use("/api/v1/reports", reportRouter);
router.use("/sse", sseRouter);

// Bull Router Path
router.use(BULL_PATH, bullRouter);

router.use((req: Request, res: Response) => {
	if (req.method === "GET") {
		res
			.status(404)
			.sendFile(path.join(process.cwd(), "src", "templates", "index.html"));
	} else {
		res.status(404).json({
			error: "Not Found",
			message: "The requested resource does not exist",
			path: req.path,
		});
	}
});

export default router;
