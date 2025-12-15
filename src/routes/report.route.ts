import { Router, RequestHandler } from "express";
import { ReportController } from "../controller/report.controller";
import { verifyToken } from "../middleware/auth.middleware";

const reportController = new ReportController();

const router = Router();

// Create a new report
router.post("/", verifyToken, reportController.createReport as RequestHandler);

// Get all reports (admin only, add admin middleware if you have one)
router.get("/", verifyToken, reportController.getAllReports as RequestHandler);

// Get report statistics
router.get(
	"/stats",
	verifyToken,
	reportController.getReportStats as RequestHandler,
);

// Get report by ID
router.get(
	"/:id",
	verifyToken,
	reportController.getReportById as RequestHandler,
);

// Get reports by reporter (user who made the reports)
router.get(
	"/reporter/:reporterId",
	verifyToken,
	reportController.getReportsByReporter as RequestHandler,
);

// Get reports by reported user (user who was reported)
router.get(
	"/reported/:reportedUserId",
	verifyToken,
	reportController.getReportsByReportedUser as RequestHandler,
);

// Delete a report (admin only, add admin middleware if you have one)
router.delete(
	"/:id",
	verifyToken,
	reportController.deleteReport as RequestHandler,
);

export default router;
