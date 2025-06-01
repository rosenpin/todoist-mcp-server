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
        message: "🔒 **Subscription Required**\n\nTo use Todoist MCP tools, please visit our website to manage your subscription.\n\n💰 **$2.99/month** • 🎁 **3-day free trial for new users**\n\nVisit: https://todoist-mcp-server.real-tomer-rosenfeld.workers.dev to get started!" 
      };
    }

    const subscriptionManager = new SubscriptionManager(env.STRIPE_SECRET_KEY);
    await subscriptionManager.initialize();

    const context = { requestUrl };
    const isActive = await subscriptionManager.isSubscriptionActive(userId, context);

    if (!isActive) {
      return {
        isActive: false,
        message: "🔒 **Subscription Required**\n\nYour Todoist MCP subscription is inactive. Please visit our website to manage your subscription.\n\n💰 **$2.99/month** • 🎁 **3-day free trial for new users**\n\nVisit: https://todoist-mcp-server.real-tomer-rosenfeld.workers.dev to subscribe or renew!"
      };
    }

    return { isActive: true };
  } catch (error) {
    console.error("Error checking subscription:", error);
    // In case of error, allow access to prevent service disruption
    return { isActive: true };
  }
}

export function createSubscriptionError(message: string): any {
  return {
    type: "error",
    error: {
      code: "SUBSCRIPTION_REQUIRED",
      message: message
    }
  };
}