import { z } from "zod";

export const paymentSuccessSchema = z.object({
	transaction: z.string().min(1, "Transaction ID is required"),
	amount: z.string().min(1, "Amount is required"),
	planType: z.enum(["week", "month", "annual"], {
		errorMap: () => ({ message: "Plan type must be week, month, or annual" }),
	}),
	paymentPK: z.string().optional(),
	swapTransactionSignature: z.string().optional(),
	blockchainSymbol: z.string().optional(),
});

export const paymentErrorSchema = z.object({
	transaction: z.string().optional(),
	errorMessage: z.string().optional(),
	planType: z.enum(["week", "month", "annual"], {
		errorMap: () => ({ message: "Plan type must be week, month, or annual" }),
	}),
});

export const helioWebhookSchema = z.object({
	event: z.enum(["PAYMENT_SUCCESS", "PAYMENT_FAILED", "PAYMENT_PENDING"]),
	transaction: z.string(),
	amount: z.number(),
	currency: z.string(),
	paymentPK: z.string().optional(),
	metadata: z.record(z.any()).optional(),
});

// DodoPayments payment link schema
export const dodoPaymentLinkSchema = z.object({
	planType: z.enum(["week", "month", "annual"], {
		errorMap: () => ({ message: "Plan type must be week, month, or annual" }),
	}),
});

// Alias for backward compatibility with controller code
export const stripePaymentIntentSchema = dodoPaymentLinkSchema;

// DodoPayments webhook schema
export const dodoWebhookSchema = z.object({
	event_type: z.string().optional(),
	status: z.string().optional(),
	payment_id: z.string(),
	metadata: z.record(z.any()).optional(),
	error: z.any().optional(),
	customer: z
		.object({
			email: z.string().optional(),
			name: z.string().optional(),
		})
		.optional(),
	amount: z.number().optional(),
	currency: z.string().optional(),
});

export type PaymentSuccessRequest = z.infer<typeof paymentSuccessSchema>;
export type PaymentErrorRequest = z.infer<typeof paymentErrorSchema>;
export type HelioWebhookPayload = z.infer<typeof helioWebhookSchema>;
export type StripePaymentIntentRequest = z.infer<
	typeof stripePaymentIntentSchema
>;
export type DodoPaymentLinkRequest = z.infer<typeof dodoPaymentLinkSchema>;
export type DodoWebhookPayload = z.infer<typeof dodoWebhookSchema>;
