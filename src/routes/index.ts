import { Router, type Request, type Response } from "express";

import userRouter from "./user.route";
import historyRouter from "./history.route";
import uploadRouter from "./upload.route";
import searchRouter from "./search.route";
import heartbeatRouter from "./heartbeat.route";
import paymentRouter from "./payment.route";
import reportRouter from "./report.route";
import sseRouter from "./sse.route";
import ratingRouter from "./rating.route";
import friendChatRouter from "./friend-chat.route";
import path from "node:path";
import fs from "node:fs";
import { router as bullRouter, BASE_PATH as BULL_PATH } from "./bull.route";

const router = Router();
const packageJsonPath = path.join(process.cwd(), "package.json");
const appVersion = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).version;
const templatePath = path.join(process.cwd(), "src", "templates", "index.html");
const templateHtml = fs.readFileSync(templatePath, "utf8");

router.use("/api/v1/users", userRouter);
router.use("/api/v1/search", searchRouter);
router.use("/api/v1/history", historyRouter);
router.use("/api/v1/upload", uploadRouter);
router.use("/api/v1/heartbeat", heartbeatRouter);
router.use("/api/v1/payment", paymentRouter);
router.use("/api/v1/reports", reportRouter);
router.use("/api/v1/ratings", ratingRouter);
router.use("/api/v1/friend-chat", friendChatRouter);
router.use("/sse", sseRouter);

// Bull Router Path
router.use(BULL_PATH, bullRouter);

router.use((req: Request, res: Response) => {
	console.log("appVersion", appVersion);
	res.setHeader("X-App-Version", appVersion);
	if (req.method === "GET") {
		res
			.status(404)
			.type("html")
			.send(templateHtml.replace("{{APP_VERSION}}", appVersion));
	} else {
		res.status(404).json({
			version: appVersion,
			error: "Not Found",
			message: "The requested resource does not exist",
			path: req.path,
		});
	}
});

export default router;
