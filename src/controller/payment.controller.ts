import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import {
  paymentSuccessSchema,
  paymentErrorSchema,
  helioWebhookSchema,
  PaymentSuccessRequest,
  PaymentErrorRequest,
} from "../validation/payment.validation";
import { addDays, addMonths, addYears } from "date-fns";

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
function mapPlanType(planType: "week" | "month" | "annual"): "MONTHLY" | "YEARLY" {
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
  static async handlePaymentSuccess(req: Request, res: Response) {
    try {
      // Validate request body
      const validatedData = paymentSuccessSchema.parse(req.body);
      
      // Get user from authenticated session
      if (!req.user || !req.user.email) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated",
        });
      }

      const { transaction, amount, planType, paymentPK, swapTransactionSignature, blockchainSymbol } = validatedData;

      // Find user by email
      const user = await prisma.user.findUnique({
        where: { email: req.user.email },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Calculate subscription end date
      const proEnd = calculateProEndDate(planType);
      
      // Update user's pro status and end date
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
          plan: mapPlanType(planType),
          startedAt: new Date(),
          expiresAt: proEnd,
        },
      });

      // Log successful payment
      console.log(`Payment success for user ${user.email}:`, {
        transaction,
        amount,
        planType,
        proEnd: proEnd.toISOString(),
        paymentPK,
        swapTransactionSignature,
        blockchainSymbol,
      });

      return res.status(200).json({
        success: true,
        message: "Payment processed successfully",
        data: {
          isPro: updatedUser.isPro,
          proEnd: updatedUser.proEnd,
        },
      });
    } catch (error) {
      console.error("Payment success handler error:", error);
      
      if (error instanceof Error) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }
      
      return res.status(500).json({
        success: false,
        message: "Failed to process payment",
      });
    }
  }

  /**
   * Handle payment error from Helio
   * Logs the error for tracking purposes
   */
  static async handlePaymentError(req: Request, res: Response) {
    try {
      // Validate request body
      const validatedData = paymentErrorSchema.parse(req.body);
      
      // Get user from authenticated session
      if (!req.user || !req.user.email) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated",
        });
      }

      const { transaction, errorMessage, planType } = validatedData;

      // Log payment error
      console.error(`Payment error for user ${req.user.email}:`, {
        transaction,
        errorMessage,
        planType,
        timestamp: new Date().toISOString(),
      });

      return res.status(200).json({
        success: true,
        message: "Payment error logged",
      });
    } catch (error) {
      console.error("Payment error handler error:", error);
      
      if (error instanceof Error) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }
      
      return res.status(500).json({
        success: false,
        message: "Failed to log payment error",
      });
    }
  }

  /**
   * Handle Helio webhook callbacks
   * This can be used for server-side payment verification
   */
  static async handleHelioWebhook(req: Request, res: Response) {
    try {
      // Validate webhook payload
      const validatedData = helioWebhookSchema.parse(req.body);
      
      const { event, transaction, amount, currency, paymentPK, metadata } = validatedData;

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
      return res.status(200).json({
        success: true,
        message: "Webhook received",
      });
    } catch (error) {
      console.error("Helio webhook error:", error);
      
      // Return 200 even on error to prevent webhook retries
      return res.status(200).json({
        success: false,
        message: "Webhook processing failed",
      });
    }
  }

  /**
   * Get user's subscription status
   */
  static async getSubscriptionStatus(req: Request, res: Response) {
    try {
      if (!req.user || !req.user.email) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated",
        });
      }

      const user = await prisma.user.findUnique({
        where: { email: req.user.email },
        include: {
          subscriptions: {
            orderBy: { startedAt: "desc" },
            take: 1,
          },
        },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Check if subscription is still active
      const isActive = user.isPro && user.proEnd && new Date(user.proEnd) > new Date();

      return res.status(200).json({
        success: true,
        data: {
          isPro: user.isPro,
          proEnd: user.proEnd,
          isActive,
          subscription: user.subscriptions[0] || null,
        },
      });
    } catch (error) {
      console.error("Get subscription status error:", error);
      
      return res.status(500).json({
        success: false,
        message: "Failed to get subscription status",
      });
    }
  }
}

