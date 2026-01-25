import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import {
	paymentSuccessSchema,
	paymentErrorSchema,
	helioWebhookSchema,
} from "../validation/payment.validation";
import { addDays, addMonths, addYears } from "date-fns";
import { Webhook } from "standardwebhooks";

/**
 * Calculate subscription end date based on plan type
 */
function calculateProEndDate(planType: "week" | "month" | "annual"): Date {
	const now = new Date();

	switch (planType) {
		case "week":
			return addDays(now, 7);
		case "month":
			return addMonths(now, 1);
		case "annual":
			return addYears(now, 1);
		default:
			throw new Error("Invalid plan type");
	}
}

/**
 * Map frontend plan types to Prisma Plan enum
 */
function mapPlanType(
	planType: "week" | "month" | "annual",
): "MONTHLY" | "YEARLY" {
	// Week plans are treated as monthly for subscription tracking
	if (planType === "week" || planType === "month") {
		return "MONTHLY";
	}
	return "YEARLY";
}

function getHelioWebhookHeaders(
	req: Request,
): { "webhook-id": string; "webhook-timestamp": string; "webhook-signature": string } | null {
	const webhookId = req.header("webhook-id");
	const webhookTimestamp = req.header("webhook-timestamp");
	const webhookSignature = req.header("webhook-signature");

	if (!webhookId || !webhookTimestamp || !webhookSignature) {
		return null;
	}

	return {
		"webhook-id": webhookId,
		"webhook-timestamp": webhookTimestamp,
		"webhook-signature": webhookSignature,
	};
}

export class PaymentController {
	/**
	 * Handle successful payment from Helio
	 * Updates user's isPro status and creates subscription record
	 */
	static async handlePaymentSuccess(
		req: Request,
		res: Response,
	): Promise<void> {
		try {
			// Validate request body
			const validatedData = paymentSuccessSchema.parse(req.body);

			const {
				transaction,
				amount,
				planType,
				paymentPK,
				swapTransactionSignature,
				blockchainSymbol,
			} = validatedData;

			// Calculate subscription end date
			const proEnd = calculateProEndDate(planType);

			// Update user's pro status and end date
			const updatedUser = await prisma.user.update({
				where: { id: req.user?.id as string },
				data: {
					isPro: true,
					proEnd: proEnd,
				},
			});

			// Create subscription record
			await prisma.subscription.create({
				data: {
					userId: req.user?.id as string,
					plan: mapPlanType(planType),
					startedAt: new Date(),
					expiresAt: proEnd,
				},
			});

			// Log successful payment
			console.log(
				`Payment success for user ${req.user?.email || req.user?.username}:`,
				{
					transaction,
					amount,
					planType,
					proEnd: proEnd.toISOString(),
					paymentPK,
					swapTransactionSignature,
					blockchainSymbol,
				},
			);

			res.status(200).json({
				success: true,
				message: "Payment processed successfully",
				data: {
					isPro: updatedUser.isPro,
					proEnd: updatedUser.proEnd,
				},
			});
			return;
		} catch (error) {
			console.error("Payment success handler error:", error);

			if (error instanceof Error) {
				res.status(400).json({
					success: false,
					message: error.message,
				});
				return;
			}

			res.status(500).json({
				success: false,
				message: "Failed to process payment",
			});
			return;
		}
	}

	/**
	 * Handle payment error from Helio
	 * Logs the error for tracking purposes
	 */
	static async handlePaymentError(req: Request, res: Response): Promise<void> {
		try {
			// Validate request body
			const validatedData = paymentErrorSchema.parse(req.body);

			const { transaction, errorMessage, planType } = validatedData;

			// Log payment error
			console.error(
				`Payment error for user ${req.user?.email || req.user?.username}:`,
				{
					transaction,
					errorMessage,
					planType,
					timestamp: new Date().toISOString(),
				},
			);

			res.status(200).json({
				success: true,
				message: "Payment error logged",
			});
			return;
		} catch (error) {
			console.error("Payment error handler error:", error);

			if (error instanceof Error) {
				res.status(400).json({
					success: false,
					message: error.message,
				});
				return;
			}

			res.status(500).json({
				success: false,
				message: "Failed to log payment error",
			});
			return;
		}
	}

	/**
	 * Handle Helio webhook callbacks
	 * This can be used for server-side payment verification
	 */
	static async handleHelioWebhook(req: Request, res: Response): Promise<void> {
		try {
			const webhookSecret = process.env.HELIO_WEBHOOK_SECRET;
			if (!webhookSecret) {
				console.error("HELIO_WEBHOOK_SECRET is not configured");
				res.status(500).json({
					success: false,
					message: "Webhook verification not configured",
				});
				return;
			}

			const headers = getHelioWebhookHeaders(req);
			if (!headers) {
				res.status(400).json({
					success: false,
					message: "Missing webhook headers",
				});
				return;
			}

			const rawBody = req.rawBody ?? JSON.stringify(req.body ?? {});
			const webhook = new Webhook(webhookSecret);
			try {
				webhook.verify(rawBody, headers);
			} catch (verifyError) {
				console.error("Helio webhook signature verification failed:", verifyError);
				res.status(401).json({
					success: false,
					message: "Invalid webhook signature",
				});
				return;
			}

			// Validate webhook payload
			const validatedData = helioWebhookSchema.parse(req.body);

			const { event, transaction, amount, currency, paymentPK, metadata } =
				validatedData;

			// Log webhook event
			console.log("Helio webhook received:", {
				event,
				transaction,
				amount,
				currency,
				paymentPK,
				metadata,
			});

			// Handle different webhook events
			switch (event) {
				case "PAYMENT_SUCCESS":
					// Additional server-side verification can be done here
					console.log(`Webhook: Payment ${transaction} succeeded`);
					break;

				case "PAYMENT_FAILED":
					console.log(`Webhook: Payment ${transaction} failed`);
					break;

				case "PAYMENT_PENDING":
					console.log(`Webhook: Payment ${transaction} pending`);
					break;
			}

			// Always return 200 to acknowledge webhook receipt
			res.status(200).json({
				success: true,
				message: "Webhook received",
			});
			return;
		} catch (error) {
			console.error("Helio webhook error:", error);

			// Return 200 even on error to prevent webhook retries
			res.status(200).json({
				success: false,
				message: "Webhook processing failed",
			});
			return;
		}
	}

	/**
	 * Get user's subscription status
	 */
	static async getSubscriptionStatus(
		req: Request,
		res: Response,
	): Promise<void> {
		try {
			const user = await prisma.user.findUnique({
				where: { id: req.user?.id as string },
				include: {
					subscriptions: {
						orderBy: { startedAt: "desc" },
						take: 1,
					},
				},
			});

			if (!user) {
				res.status(404).json({
					success: false,
					message: "User not found",
				});
				return;
			}

			// Check if subscription is still active
			const isActive =
				user.isPro && user.proEnd && new Date(user.proEnd) > new Date();

			res.status(200).json({
				success: true,
				data: {
					isPro: user.isPro,
					proEnd: user.proEnd,
					isActive,
					subscription: user.subscriptions[0] || null,
				},
			});
			return;
		} catch (error) {
			console.error("Get subscription status error:", error);

			res.status(500).json({
				success: false,
				message: "Failed to get subscription status",
			});
			return;
		}
	}
}
