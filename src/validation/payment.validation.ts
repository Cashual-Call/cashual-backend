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


export type PaymentSuccessRequest = z.infer<typeof paymentSuccessSchema>;
export type PaymentErrorRequest = z.infer<typeof paymentErrorSchema>;
export type HelioWebhookPayload = z.infer<typeof helioWebhookSchema>;
