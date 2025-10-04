import { Router } from "express";
import { PaymentController } from "../controller/payment.controller";
import { verifyToken } from "../middleware/auth.middleware";

const router = Router();

/**
 * @route   POST /api/v1/payment/success
 * @desc    Handle successful payment from Helio
 * @access  Private (requires authentication)
 */
router.post("/success", verifyToken, PaymentController.handlePaymentSuccess);

/**
 * @route   POST /api/v1/payment/error
 * @desc    Handle payment error from Helio
 * @access  Private (requires authentication)
 */
router.post("/error", verifyToken, PaymentController.handlePaymentError);

/**
 * @route   POST /api/v1/payment/webhook
 * @desc    Handle Helio webhook callbacks
 * @access  Public (webhook from Helio servers)
 * @note    This endpoint should be secured with Helio webhook signature verification in production
 */
router.post("/webhook", PaymentController.handleHelioWebhook);

/**
 * @route   GET /api/v1/payment/status
 * @desc    Get user's subscription status
 * @access  Private (requires authentication)
 */
router.get("/status", verifyToken, PaymentController.getSubscriptionStatus);

export default router;

