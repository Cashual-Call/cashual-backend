import winston from "winston";
import WinstonCloudWatch from "winston-cloudwatch";

// Configure Winston logger for CloudWatch
const logger = winston.createLogger({
	level: process.env.LOG_LEVEL || "info",
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.errors({ stack: true }),
		winston.format.json(),
	),
	defaultMeta: { service: "cashual-backend" },
	transports: [
		// Console transport for local development
		new winston.transports.Console({
			format: winston.format.combine(
				winston.format.colorize(),
				winston.format.simple(),
			),
		}),
		// CloudWatch transport for production
		...(process.env.NODE_ENV === "production"
			? [
					new WinstonCloudWatch({
						logGroupName:
							process.env.CLOUDWATCH_LOG_GROUP || "cashual-backend-logs",
						logStreamName: `${
							process.env.CLOUDWATCH_LOG_STREAM || "app"
						}-${Date.now()}`,
						awsRegion: process.env.AWS_REGION || "eu-north-1",
						awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
						awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
						messageFormatter: ({ level, message, meta }) =>
							`[${level}]: ${message} ${meta ? JSON.stringify(meta) : ""}`,
					}),
				]
			: []),
	],
});

// Add error handling for the logger itself
logger.on("error", (error) => {
	console.error("Logger error:", error);
});

export default logger;
