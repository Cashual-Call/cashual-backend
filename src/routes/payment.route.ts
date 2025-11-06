import { Router } from "express";
import { PaymentController } from "../controller/payment.controller";
import { verifyToken } from "../middleware/auth.middleware";

const router = Router();

// ==================== HELIO PAYMENT ROUTES ====================

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

// ==================== DODOPAYMENTS ROUTES ====================

/**
 * @route   POST /api/v1/payment/dodo/create-link
 * @desc    Create a DodoPayments payment link
 * @access  Private (requires authentication)
 */
// router.post("/dodo/create-link", verifyToken, PaymentController.createDodoPaymentLink);

/**
 * @route   POST /api/v1/payment/dodo/checkout-url
 * @desc    Get a static DodoPayments checkout URL
 * @access  Private (requires authentication)
 */
// router.post("/dodo/checkout-url", verifyToken, PaymentController.getDodoStaticCheckoutUrl);

/**
 * @route   POST /api/v1/payment/dodo/webhook
 * @desc    Handle DodoPayments webhook callbacks
 * @access  Public (webhook from DodoPayments servers)
 * @note    This endpoint is secured with DodoPayments webhook signature verification
 */
// router.post("/dodo/webhook", PaymentController.handleDodoWebhook);

/**
 * @route   POST /api/v1/payment/dodo/verify
 * @desc    Verify a DodoPayments payment and update user subscription
 * @access  Private (requires authentication)
 */
// router.post("/dodo/verify", verifyToken, PaymentController.verifyDodoPayment);

export default router;


