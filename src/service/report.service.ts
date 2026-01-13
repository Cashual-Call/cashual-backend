import { Report } from "../generated/client";
import { prisma } from "../lib/prisma";

export class ReportService {
	constructor() {
		this.createReport = this.createReport.bind(this);
		this.getReportById = this.getReportById.bind(this);
		this.getAllReports = this.getAllReports.bind(this);
		this.getReportsByReporter = this.getReportsByReporter.bind(this);
		this.getReportsByReportedUser = this.getReportsByReportedUser.bind(this);
		this.deleteReport = this.deleteReport.bind(this);
		this.getReportStats = this.getReportStats.bind(this);
	}

	async createReport(reportData: {
		reporterId: string;
		reportedUserId: string;
		reason: string;
	}): Promise<Report> {
		try {
			// Check if reporter and reported user exist
			const [reporter, reportedUser] = await Promise.all([
				prisma.user.findUnique({ where: { id: reportData.reporterId } }),
				prisma.user.findUnique({ where: { id: reportData.reportedUserId } }),
			]);

			if (!reporter) {
				throw new Error("Reporter user not found");
			}

			if (!reportedUser) {
				throw new Error("Reported user not found");
			}

			// Check if reporter is trying to report themselves
			if (reportData.reporterId === reportData.reportedUserId) {
				throw new Error("Cannot report yourself");
			}

			// Check if there's already a report from this reporter for this user (optional)
			const existingReport = await prisma.report.findFirst({
				where: {
					reporterId: reportData.reporterId,
					reportedUserId: reportData.reportedUserId,
				},
			});

			if (existingReport) {
				throw new Error("You have already reported this user");
			}

			return await prisma.report.create({
				data: reportData,
				include: {
					reporter: {
						select: {
							id: true,
							username: true,
							name: true,
							avatarUrl: true,
							image: true,
						},
					},
					reportedUser: {
						select: {
							id: true,
							username: true,
							name: true,
							avatarUrl: true,
							image: true,
						},
					},
				},
			});
		} catch (error) {
			if (error instanceof Error) {
				throw error;
			}
			throw new Error("Failed to create report");
		}
	}

	async getReportById(id: string): Promise<Report | null> {
		try {
			return await prisma.report.findUnique({
				where: { id },
				include: {
					reporter: {
						select: {
							id: true,
							username: true,
							name: true,
							avatarUrl: true,
							image: true,
						},
					},
					reportedUser: {
						select: {
							id: true,
							username: true,
							name: true,
							avatarUrl: true,
							image: true,
						},
					},
				},
			});
		} catch (error) {
			throw new Error("Failed to fetch report");
		}
	}

	async getAllReports(params?: {
		skip?: number;
		take?: number;
		orderBy?: "asc" | "desc";
	}): Promise<{ reports: Report[]; total: number }> {
		try {
			const { skip = 0, take = 10, orderBy = "desc" } = params || {};

			const [reports, total] = await Promise.all([
				prisma.report.findMany({
					skip,
					take,
					orderBy: {
						createdAt: orderBy,
					},
					include: {
						reporter: {
							select: {
								id: true,
								username: true,
								name: true,
								avatarUrl: true,
								image: true,
							},
						},
						reportedUser: {
							select: {
								id: true,
								username: true,
								name: true,
								avatarUrl: true,
								image: true,
							},
						},
					},
				}),
				prisma.report.count(),
			]);

			return { reports, total };
		} catch (error) {
			throw new Error("Failed to fetch reports");
		}
	}

	async getReportsByReporter(reporterId: string): Promise<Report[]> {
		try {
			return await prisma.report.findMany({
				where: { reporterId },
				orderBy: {
					createdAt: "desc",
				},
				include: {
					reportedUser: {
						select: {
							id: true,
							username: true,
							name: true,
							avatarUrl: true,
							image: true,
						},
					},
				},
			});
		} catch (error) {
			throw new Error("Failed to fetch reports by reporter");
		}
	}

	async getReportsByReportedUser(reportedUserId: string): Promise<Report[]> {
		try {
			return await prisma.report.findMany({
				where: { reportedUserId },
				orderBy: {
					createdAt: "desc",
				},
				include: {
					reporter: {
						select: {
							id: true,
							username: true,
							name: true,
							avatarUrl: true,
							image: true,
						},
					},
				},
			});
		} catch (error) {
			throw new Error("Failed to fetch reports for reported user");
		}
	}

	async deleteReport(id: string): Promise<void> {
		try {
			await prisma.report.delete({
				where: { id },
			});
		} catch (error) {
			throw new Error("Failed to delete report");
		}
	}

	async getReportStats(): Promise<{
		totalReports: number;
		reportsToday: number;
		reportsThisWeek: number;
		reportsThisMonth: number;
		topReportedUsers: Array<{
			userId: string;
			username: string | null;
			name: string;
			reportCount: number;
		}>;
	}> {
		try {
			const now = new Date();
			const todayStart = new Date(now.setHours(0, 0, 0, 0));
			const weekStart = new Date(now.setDate(now.getDate() - 7));
			const monthStart = new Date(now.setMonth(now.getMonth() - 1));

			const [
				totalReports,
				reportsToday,
				reportsThisWeek,
				reportsThisMonth,
				topReported,
			] = await Promise.all([
				prisma.report.count(),
				prisma.report.count({
					where: {
						createdAt: {
							gte: todayStart,
						},
					},
				}),
				prisma.report.count({
					where: {
						createdAt: {
							gte: weekStart,
						},
					},
				}),
				prisma.report.count({
					where: {
						createdAt: {
							gte: monthStart,
						},
					},
				}),
				prisma.report.groupBy({
					by: ["reportedUserId"],
					_count: {
						reportedUserId: true,
					},
					orderBy: {
						_count: {
							reportedUserId: "desc",
						},
					},
					take: 10,
				}),
			]);

			// Get user details for top reported users
			const topReportedUsers = await Promise.all(
				topReported.map(async (item) => {
					const user = await prisma.user.findUnique({
						where: { id: item.reportedUserId },
						select: {
							id: true,
							username: true,
							name: true,
						},
					});
					return {
						userId: item.reportedUserId,
						username: user?.username || null,
						name: user?.name || "Unknown",
						reportCount: item._count.reportedUserId,
					};
				}),
			);

			return {
				totalReports,
				reportsToday,
				reportsThisWeek,
				reportsThisMonth,
				topReportedUsers,
			};
		} catch (error) {
			throw new Error("Failed to fetch report statistics");
		}
	}
}
