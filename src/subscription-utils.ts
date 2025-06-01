import { SubscriptionManager } from './subscription.js';

interface SubscriptionCheckResult {
  isActive: boolean;
  message?: string;
  paymentUrl?: string;
}

export async function checkUserSubscription(
  userId: string, 
  requestUrl: string,
  env: any
): Promise<SubscriptionCheckResult> {
  try {
    // If subscriptions are disabled via feature flag, always allow access
    if (env.SUBSCRIPTION_ENABLED !== "true") {
      return { isActive: true };
    }

    // If Stripe is not configured, deny access
    if (!env.STRIPE_SECRET_KEY) {
      return { 
        isActive: false, 
        message: "Subscription service not configured" 
      };
    }

    const subscriptionManager = new SubscriptionManager(env.STRIPE_SECRET_KEY);
    await subscriptionManager.initialize();

    const context = { requestUrl };
    const isActive = await subscriptionManager.isSubscriptionActive(userId, context);

    if (!isActive) {
      // Generate payment link for inactive users
      try {
        const paymentUrl = await subscriptionManager.createPaymentLink(userId);
        return {
          isActive: false,
          message: "Your subscription is inactive. Please subscribe to continue using the Todoist MCP server.",
          paymentUrl
        };
      } catch (error) {
        console.error("Error creating payment link:", error);
        return {
          isActive: false,
          message: "Your subscription is inactive. Please contact support to reactivate your account."
        };
      }
    }

    return { isActive: true };
  } catch (error) {
    console.error("Error checking subscription:", error);
    // In case of error, allow access to prevent service disruption
    return { isActive: true };
  }
}

export function createSubscriptionError(message: string, paymentUrl?: string): any {
  return {
    type: "error",
    error: {
      code: "SUBSCRIPTION_REQUIRED",
      message: message,
      details: {
        paymentUrl: paymentUrl,
        trialInfo: "New users get a 3-day free trial"
      }
    }
  };
}