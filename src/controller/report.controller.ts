import { Request, Response } from "express";
import { ReportService } from "../service/report.service";
import { redis } from "../lib/redis";

export class ReportController {
  private reportService: ReportService;
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor() {
    this.reportService = new ReportService();

    this.createReport = this.createReport.bind(this);
    this.getReportById = this.getReportById.bind(this);
    this.getAllReports = this.getAllReports.bind(this);
    this.getReportsByReporter = this.getReportsByReporter.bind(this);
    this.getReportsByReportedUser = this.getReportsByReportedUser.bind(this);
    this.deleteReport = this.deleteReport.bind(this);
    this.getReportStats = this.getReportStats.bind(this);
  }

  createReport = async (req: Request, res: Response) => {
    try {
      const { reporterId, reportedUserId, reason } = req.body;

      // Validate required fields
      if (!reporterId || !reportedUserId || !reason) {
        return res.status(400).json({
          error: "Missing required fields: reporterId, reportedUserId, and reason are required",
        });
      }

      const report = await this.reportService.createReport({
        reporterId,
        reportedUserId,
        reason,
      });

      // Invalidate relevant caches
      await Promise.all([
        redis.del("reports:all"),
        redis.del(`reports:reporter:${reporterId}`),
        redis.del(`reports:reported:${reportedUserId}`),
        redis.del("reports:stats"),
      ]);

      res.status(201).json({
        success: true,
        data: report,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (
          error.message === "Reporter user not found" ||
          error.message === "Reported user not found"
        ) {
          return res.status(404).json({ error: error.message });
        } else if (
          error.message === "Cannot report yourself" ||
          error.message === "You have already reported this user"
        ) {
          return res.status(400).json({ error: error.message });
        }
      }
      res.status(500).json({ error: "Failed to create report" });
    }
  };

  getReportById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Try to get from cache first
      const cachedReport = await redis.get(`report:${id}`);
      if (cachedReport) {
        return res.json({
          success: true,
          data: JSON.parse(cachedReport),
        });
      }

      const report = await this.reportService.getReportById(id);

      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      // Cache the report data
      await redis.setex(`report:${id}`, this.CACHE_TTL, JSON.stringify(report));

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch report" });
    }
  };

  getAllReports = async (req: Request, res: Response) => {
    try {
      const skip = parseInt(req.query.skip as string) || 0;
      const take = parseInt(req.query.take as string) || 10;
      const orderBy = (req.query.orderBy as "asc" | "desc") || "desc";

      // Create cache key based on query params
      const cacheKey = `reports:all:${skip}:${take}:${orderBy}`;

      // Try to get from cache first
      const cachedReports = await redis.get(cacheKey);
      if (cachedReports) {
        return res.json({
          success: true,
          ...JSON.parse(cachedReports),
        });
      }

      const result = await this.reportService.getAllReports({
        skip,
        take,
        orderBy,
      });

      // Cache the reports list
      await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));

      res.json({
        success: true,
        data: result.reports,
        total: result.total,
        skip,
        take,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  };

  getReportsByReporter = async (req: Request, res: Response) => {
    try {
      const { reporterId } = req.params;

      // Try to get from cache first
      const cachedReports = await redis.get(`reports:reporter:${reporterId}`);
      if (cachedReports) {
        return res.json({
          success: true,
          data: JSON.parse(cachedReports),
        });
      }

      const reports = await this.reportService.getReportsByReporter(reporterId);

      // Cache the reports
      await redis.setex(
        `reports:reporter:${reporterId}`,
        this.CACHE_TTL,
        JSON.stringify(reports)
      );

      res.json({
        success: true,
        data: reports,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch reports by reporter" });
    }
  };

  getReportsByReportedUser = async (req: Request, res: Response) => {
    try {
      const { reportedUserId } = req.params;

      // Try to get from cache first
      const cachedReports = await redis.get(`reports:reported:${reportedUserId}`);
      if (cachedReports) {
        return res.json({
          success: true,
          data: JSON.parse(cachedReports),
        });
      }

      const reports = await this.reportService.getReportsByReportedUser(
        reportedUserId
      );

      // Cache the reports
      await redis.setex(
        `reports:reported:${reportedUserId}`,
        this.CACHE_TTL,
        JSON.stringify(reports)
      );

      res.json({
        success: true,
        data: reports,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch reports for reported user" });
    }
  };

  deleteReport = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Get the report first to invalidate related caches
      const report = await this.reportService.getReportById(id);

      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      await this.reportService.deleteReport(id);

      // Invalidate caches
      await Promise.all([
        redis.del(`report:${id}`),
        redis.del("reports:all"),
        redis.del(`reports:reporter:${report.reporterId}`),
        redis.del(`reports:reported:${report.reportedUserId}`),
        redis.del("reports:stats"),
      ]);

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete report" });
    }
  };

  getReportStats = async (req: Request, res: Response) => {
    try {
      // Try to get from cache first
      const cachedStats = await redis.get("reports:stats");
      if (cachedStats) {
        return res.json({
          success: true,
          data: JSON.parse(cachedStats),
        });
      }

      const stats = await this.reportService.getReportStats();

      // Cache the stats with shorter TTL (5 minutes)
      await redis.setex("reports:stats", 300, JSON.stringify(stats));

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch report statistics" });
    }
  };
}





