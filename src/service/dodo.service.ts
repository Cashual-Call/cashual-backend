import DodoPayments from 'dodopayments';
import { type PlanType } from '../constants/pricing';

if (!process.env.DODO_PAYMENTS_API_KEY) {
  throw new Error("DODO_PAYMENTS_API_KEY is not defined in environment variables");
}

// Debug: Log API key format (safely)
const apiKey = process.env.DODO_PAYMENTS_API_KEY;
console.log("DodoPayments API Key loaded:", apiKey.substring(0, 10) + "...");

const client = new DodoPayments({
  bearerToken: apiKey,
  environment: 'test_mode'
});

// Product ID mapping
const DODO_PRODUCT_IDS: Record<PlanType, string> = {
  week: process.env.DODO_PRODUCT_ID_WEEK || "pdt_jXLftNYyKEW82CPb1106H",
  month: process.env.DODO_PRODUCT_ID_MONTH || "pdt_jXLftNYyKEW82CPb1106H",
  annual: process.env.DODO_PRODUCT_ID_ANNUAL || "pdt_jXLftNYyKEW82CPb1106H",
};

export class DodoPaymentsService {
  /**
   * Create a payment link for a specific plan
   */
  static async createPaymentLink(
    planType: PlanType,
    userId: string,
    userEmail: string,
    userName: string,
    redirectUrl?: string
  ) {
    try {
      const productId = DODO_PRODUCT_IDS[planType];

      if (!productId) {
        throw new Error(`Product ID not configured for plan: ${planType}`);
      }

      const subscription = await client.subscriptions.create({
        payment_link: true,
        customer: {
          email: userEmail,
          name: userName,
        },
        product_id: productId,
        quantity: 1,
        billing: {
          city: "N/A",
          country: "US",
          state: "N/A",
          street: "N/A",
          zipcode: "0",
        },
        metadata: {
          userId,
          userEmail,
          planType,
          source: "cashual-subscription",
        },
        ...(redirectUrl && { redirect_url: redirectUrl }),
      });

      const payment = subscription;

      return {
        payment_id: payment.payment_id,
        payment_link: payment.payment_link,
      };
    } catch (error) {
      console.error("DodoPayments payment link creation error:", error);
      throw error;
    }
  }

  /**
   * Create a static checkout URL (no API call needed)
   */
  static createStaticCheckoutUrl(
    planType: PlanType,
    redirectUrl?: string,
    quantity: number = 1
  ): string {
    const productId = DODO_PRODUCT_IDS[planType];

    if (!productId) {
      throw new Error(`Product ID not configured for plan: ${planType}`);
    }

    let url = `https://checkout.dodopayments.com/buy/${productId}?quantity=${quantity}`;
    
    if (redirectUrl) {
      url += `&redirect_url=${encodeURIComponent(redirectUrl)}`;
    }

    return url;
  }

  /**
   * Retrieve payment details by payment ID
   */
  static async getPayment(paymentId: string) {
    try {
      const payment = await client.payments.retrieve(paymentId);
      return payment;
    } catch (error) {
      console.error("DodoPayments payment retrieval error:", error);
      throw error;
    }
  }

  /**
   * Retrieve subscription details by payment ID
   */
  static async getSubscription(paymentId: string) {
    try {
      const subscription = await client.subscriptions.retrieve(paymentId);
      return subscription;
    } catch (error) {
      console.error("DodoPayments subscription retrieval error:", error);
      throw error;
    }
  }

  /**
   * Get product details
   */
  static async getProduct(productId: string) {
    try {
      const product = await client.products.retrieve(productId);
      return product;
    } catch (error) {
      console.error("DodoPayments product retrieval error:", error);
      throw error;
    }
  }

  /**
   * List all payments (with optional filtering)
   */
  static async listPayments() {
    try {
      const payments = await client.payments.list();
      return payments;
    } catch (error) {
      console.error("DodoPayments list payments error:", error);
      throw error;
    }
  }
}

