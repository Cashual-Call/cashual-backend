import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import {
	paymentSuccessSchema,
	paymentErrorSchema,
	helioWebhookSchema,
	stripePaymentIntentSchema,
} from "../validation/payment.validation";
import { addDays, addMonths, addYears } from "date-fns";
import { DodoPaymentsService } from "../service/dodo.service";
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

	// ==================== DODOPAYMENTS METHODS ====================

	/**
	 * Create a DodoPayments payment link
	 */
	static async createDodoPaymentLink(
		req: Request,
		res: Response,
	): Promise<void> {
		try {
			// Validate request body
			const { planType } = stripePaymentIntentSchema.parse(req.body);

			// Find user by id
			const user = await prisma.user.findUnique({
				where: { id: req.user?.id as string },
			});

			if (!user) {
				res.status(404).json({
					success: false,
					message: "User not found",
				});
				return;
			}

			// Get the base URL from environment or request
			const baseUrl =
				process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`;
			const redirectUrl = `${baseUrl}/payment/dodo/success`;
			console.log("Redirect URL:", redirectUrl);

			// Create payment link using DodoPayments service
			const payment = await DodoPaymentsService.createPaymentLink(
				planType,
				user.id,
				user.email || req.user?.email || "",
				user.username || "User",
				redirectUrl,
			);

			console.log(
				`DodoPayments link created for user ${user.email || req.user?.email || ""}:`,
				{
					paymentId: payment.payment_id,
					planType,
				},
			);

			res.status(200).json({
				success: true,
				data: {
					payment_id: payment.payment_id,
					payment_link: payment.payment_link,
				},
			});
			return;
		} catch (error) {
			console.error("DodoPayments link creation error:", error);

			if (error instanceof Error) {
				res.status(400).json({
					success: false,
					message: error.message,
				});
				return;
			}

			res.status(500).json({
				success: false,
				message: "Failed to create payment link",
			});
			return;
		}
	}

	/**
	 * Get a static DodoPayments checkout URL
	 */
	static async getDodoStaticCheckoutUrl(
		req: Request,
		res: Response,
	): Promise<void> {
		try {
			// Validate request body
			const { planType } = stripePaymentIntentSchema.parse(req.body);

			// Get the base URL from environment or request
			const baseUrl =
				process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`;
			const redirectUrl = `${baseUrl}/payment/dodo/success`;

			// Create static checkout URL
			const checkoutUrl = DodoPaymentsService.createStaticCheckoutUrl(
				planType,
				redirectUrl,
			);

			console.log(`DodoPayments static URL generated for plan ${planType}`);

			res.status(200).json({
				success: true,
				data: {
					checkout_url: checkoutUrl,
				},
			});
			return;
		} catch (error) {
			console.error("DodoPayments static URL generation error:", error);

			if (error instanceof Error) {
				res.status(400).json({
					success: false,
					message: error.message,
				});
				return;
			}

			res.status(500).json({
				success: false,
				message: "Failed to generate checkout URL",
			});
			return;
		}
	}

	/**
	 * Handle DodoPayments webhook events
	 */
	static async handleDodoWebhook(req: Request, res: Response): Promise<void> {
		try {
			const webhookSecret = process.env.DODO_PAYMENTS_WEBHOOK_SECRET;

			if (!webhookSecret) {
				console.error("DODO_PAYMENTS_WEBHOOK_SECRET is not configured");
				res.status(500).json({
					success: false,
					message: "Webhook secret not configured",
				});
				return;
			}

			// Get webhook headers
			const webhookId = req.headers["webhook-id"] as string;
			const webhookSignature = req.headers["webhook-signature"] as string;
			const webhookTimestamp = req.headers["webhook-timestamp"] as string;

			if (!webhookId || !webhookSignature || !webhookTimestamp) {
				res.status(400).json({
					success: false,
					message: "Missing webhook headers",
				});
				return;
			}

			// Verify webhook signature
			const webhook = new Webhook(webhookSecret);
			const rawBody = JSON.stringify(req.body);

			await webhook.verify(rawBody, {
				"webhook-id": webhookId,
				"webhook-signature": webhookSignature,
				"webhook-timestamp": webhookTimestamp,
			});

			const payload = req.body;

			console.log(`DodoPayments webhook received:`, payload);

			// Handle different event types
			// DodoPayments webhook structure varies by event
			// Common events: payment.succeeded, payment.failed, subscription.created, subscription.activated

			const eventType = payload.event_type || payload.event;

			if (
				payload.status === "succeeded" ||
				payload.status === "active" ||
				eventType === "payment.succeeded" ||
				eventType === "subscription.created" ||
				eventType === "subscription.activated"
			) {
				await this.handleDodoPaymentSuccess(payload);
			} else if (
				payload.status === "failed" ||
				eventType === "payment.failed" ||
				eventType === "subscription.failed"
			) {
				await this.handleDodoPaymentFailed(payload);
			}

			res.status(200).json({
				success: true,
				message: "Webhook processed",
			});
			return;
		} catch (error) {
			console.error("DodoPayments webhook error:", error);

			res.status(400).json({
				success: false,
				message:
					error instanceof Error ? error.message : "Webhook processing failed",
			});
			return;
		}
	}

	/**
	 * Handle successful DodoPayments payment
	 */
	private static async handleDodoPaymentSuccess(payload: any) {
		const { metadata, payment_id, subscription_id } = payload;
		const { userId, planType } = metadata || {};

		// Use subscription_id or payment_id as unique identifier
		const paymentId = subscription_id || payment_id;

		if (!userId || !planType) {
			console.error("Missing metadata in DodoPayments webhook:", payload);
			return;
		}

		if (!paymentId) {
			console.error(
				"Missing payment_id or subscription_id in DodoPayments webhook:",
				payload,
			);
			return;
		}

		try {
			// Check if payment was already processed
			const existingSubscription = await prisma.subscription.findUnique({
				where: {
					paymentId: paymentId,
				},
			});

			if (existingSubscription) {
				console.log("DodoPayments payment already processed:", paymentId);
				return;
			}

			// Find user
			const user = await prisma.user.findUnique({
				where: { id: userId },
			});

			if (!user) {
				console.error("User not found:", userId);
				return;
			}

			// Calculate subscription end date
			const proEnd = calculateProEndDate(
				planType as "week" | "month" | "annual",
			);

			// Update user's pro status
			await prisma.user.update({
				where: { id: userId },
				data: {
					isPro: true,
					proEnd: proEnd,
				},
			});

			// Create subscription record
			await prisma.subscription.create({
				data: {
					userId: userId,
					plan: mapPlanType(planType as "week" | "month" | "annual"),
					startedAt: new Date(),
					expiresAt: proEnd,
					paymentId: paymentId,
				},
			});

			console.log(`DodoPayments payment succeeded for user:`, {
				userId,
				paymentId,
				planType,
				proEnd: proEnd.toISOString(),
			});
		} catch (error) {
			console.error("Error handling DodoPayments payment success:", error);
		}
	}

	/**
	 * Handle failed DodoPayments payment
	 */
	private static async handleDodoPaymentFailed(payload: any) {
		const { metadata } = payload;

		console.error(`DodoPayments payment failed:`, {
			metadata,
			error: payload.error,
		});
	}

	/**
	 * Verify DodoPayments payment and update user subscription
	 */
	static async verifyDodoPayment(req: Request, res: Response): Promise<void> {
		try {
			const { paymentId } = req.body;

			if (!paymentId) {
				res.status(400).json({
					success: false,
					message: "Payment ID is required",
				});
				return;
			}

			// Get user
			const user = await prisma.user.findUnique({
				where: { id: req.user?.id as string },
			});

			if (!user) {
				res.status(404).json({
					success: false,
					message: "User not found",
				});
				return;
			}

			// Retrieve payment/subscription from DodoPayments
			let subscription;
			try {
				subscription = await DodoPaymentsService.getSubscription(paymentId);
			} catch (error) {
				console.error("Failed to retrieve subscription:", error);
				res.status(400).json({
					success: false,
					message: "Invalid payment ID or payment not found",
				});
				return;
			}

			// Check if subscription is active
			if (subscription.status !== "active") {
				res.status(400).json({
					success: false,
					message: `Subscription is not active. Current status: ${subscription.status}`,
				});
				return;
			}

			// Get metadata
			const { userId, planType } = subscription.metadata || {};

			// Verify the payment belongs to this user
			if (userId !== user.id) {
				res.status(403).json({
					success: false,
					message: "Payment does not belong to this user",
				});
				return;
			}

			if (!planType) {
				res.status(400).json({
					success: false,
					message: "Plan type not found in payment metadata",
				});
				return;
			}

			// Check if payment was already processed
			const existingSubscription = await prisma.subscription.findUnique({
				where: {
					paymentId: paymentId,
				},
			});

			if (existingSubscription) {
				// Payment already processed, return existing data
				res.status(200).json({
					success: true,
					data: {
						isPro: user.isPro,
						proEnd: user.proEnd,
					},
					message: "Payment already processed",
				});
				return;
			}

			// Calculate subscription end date
			const proEnd = calculateProEndDate(
				planType as "week" | "month" | "annual",
			);

			// Update user's pro status
			const updatedUser = await prisma.user.update({
				where: { id: user.id },
				data: {
					isPro: true,
					proEnd: proEnd,
				},
			});

			// Create subscription record
			await prisma.subscription.create({
				data: {
					userId: user.id,
					plan: mapPlanType(planType as "week" | "month" | "annual"),
					startedAt: new Date(),
					expiresAt: proEnd,
					paymentId: paymentId,
				},
			});

			console.log(`DodoPayments payment verified for user:`, {
				userId: user.id,
				paymentId,
				planType,
				proEnd: proEnd.toISOString(),
			});

			res.status(200).json({
				success: true,
				data: {
					isPro: updatedUser.isPro,
					proEnd: updatedUser.proEnd,
				},
			});
			return;
		} catch (error) {
			console.error("DodoPayments verification error:", error);

			if (error instanceof Error) {
				res.status(400).json({
					success: false,
					message: error.message,
				});
				return;
			}

			res.status(500).json({
				success: false,
				message: "Failed to verify payment",
			});
			return;
		}
	}
}
