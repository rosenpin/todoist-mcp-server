import Stripe from 'stripe';

interface SubscriptionContext {
  sql?: any;
  requestUrl: string;
}

interface CustomerData {
  customerId: string;
  subscriptionId?: string;
  status: 'trial' | 'active' | 'inactive' | 'cancelled';
  trialEnd?: Date;
  currentPeriodEnd?: Date;
}

const REAL_PRODUCT_ID = 'prod_SPr7UngeVFKIc2'
const TEST_PRODUCT_ID = 'prod_SPrnBOeb2hFVJR';
const PRODUCT_ID = TEST_PRODUCT_ID; // Using test product for development
const TRIAL_DAYS = 3;

export class SubscriptionManager {
  private stripe: Stripe;
  private priceId: string = '';

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey);
  }

  async initialize(): Promise<void> {
    // Create or get the recurring monthly price
    this.priceId = await this.createRecurringPrice();
  }

  private async createRecurringPrice(): Promise<string> {
    try {
      // Check if price already exists
      const prices = await this.stripe.prices.list({
        product: PRODUCT_ID,
        type: 'recurring',
        active: true,
      });

      const existingPrice = prices.data.find(price =>
        price.unit_amount === 299 &&
        price.currency === 'usd' &&
        price.recurring?.interval === 'month'
      );

      if (existingPrice) {
        return existingPrice.id;
      }

      // Create new recurring price
      const price = await this.stripe.prices.create({
        unit_amount: 299, // $2.99 in cents
        currency: 'usd',
        recurring: {
          interval: 'month',
        },
        product: PRODUCT_ID,
      });

      return price.id;
    } catch (error) {
      console.error('Error creating recurring price:', error);
      throw error;
    }
  }

  async getOrCreateCustomer(userId: string, email?: string): Promise<string> {
    try {
      // Try to find existing customer by metadata
      const customers = await this.stripe.customers.list({
        email: email,
        limit: 1,
      });

      if (customers.data.length > 0) {
        const customer = customers.data[0];
        if (customer.metadata.userId === userId) {
          return customer.id;
        }
      }

      // Create new customer
      const customer = await this.stripe.customers.create({
        email: email,
        metadata: {
          userId: userId,
        },
      });

      return customer.id;
    } catch (error) {
      console.error('Error creating/getting customer:', error);
      throw error;
    }
  }

  async createSubscriptionWithTrial(customerId: string): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{
          price: this.priceId,
        }],
        trial_period_days: TRIAL_DAYS,
        payment_behavior: 'default_incomplete',
        payment_settings: {
          save_default_payment_method: 'on_subscription',
        },
        expand: ['latest_invoice.payment_intent'],
      });

      return subscription;
    } catch (error) {
      console.error('Error creating subscription:', error);
      throw error;
    }
  }

  async getSubscriptionStatus(userId: string): Promise<CustomerData | null> {
    try {
      // Find customer by userId metadata
      const customers = await this.stripe.customers.search({
        query: `metadata['userId']:'${userId}'`,
        limit: 1,
      });

      if (customers.data.length === 0) {
        return null;
      }

      const customer = customers.data[0];

      // Get active subscriptions
      const subscriptions = await this.stripe.subscriptions.list({
        customer: customer.id,
        status: 'all',
        limit: 1,
      });

      if (subscriptions.data.length === 0) {
        return {
          customerId: customer.id,
          status: 'inactive',
        };
      }

      const subscription = subscriptions.data[0];
      const now = new Date();
      const currentPeriodEnd = new Date((subscription as any).current_period_end * 1000);
      const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

      let status: CustomerData['status'] = 'inactive';

      if (subscription.status === 'trialing' && trialEnd && trialEnd > now) {
        status = 'trial';
      } else if (subscription.status === 'active') {
        status = 'active';
      } else if (subscription.status === 'canceled') {
        status = 'cancelled';
      }

      return {
        customerId: customer.id,
        subscriptionId: subscription.id,
        status,
        trialEnd: trialEnd || undefined,
        currentPeriodEnd,
      };
    } catch (error) {
      console.error('Error getting subscription status:', error);
      return null;
    }
  }

  async createPaymentLink(userId: string): Promise<string> {
    try {
      const customerId = await this.getOrCreateCustomer(userId);

      // Create a subscription checkout session
      const session = await this.stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price: this.priceId,
          quantity: 1,
        }],
        mode: 'subscription',
        subscription_data: {
          trial_period_days: TRIAL_DAYS,
          metadata: {
            userId: userId,
          },
        },
        success_url: `${this.getBaseUrl(userId)}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${this.getBaseUrl(userId)}/cancelled`,
        metadata: {
          userId: userId,
        },
      });

      return session.url!;
    } catch (error) {
      console.error('Error creating payment link:', error);
      throw error;
    }
  }

  private getBaseUrl(_userId: string): string {
    // This would be your server's base URL
    return `https://todoist-mcp-server.real-tomer-rosenfeld.workers.dev`;
  }

  async handleWebhook(event: Stripe.Event, context: SubscriptionContext): Promise<void> {
    try {
      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          const subscription = event.data.object as Stripe.Subscription;
          await this.updateSubscriptionInStorage(subscription, context);
          break;

        case 'invoice.payment_succeeded':
          const invoice = event.data.object as Stripe.Invoice;
          if ((invoice as any).subscription) {
            console.log(`Payment succeeded for subscription: ${(invoice as any).subscription}`);
          }
          break;

        case 'invoice.payment_failed':
          const failedInvoice = event.data.object as Stripe.Invoice;
          if ((failedInvoice as any).subscription) {
            console.log(`Payment failed for subscription: ${(failedInvoice as any).subscription}`);
          }
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      console.error('Error handling webhook:', error);
      throw error;
    }
  }

  private async updateSubscriptionInStorage(subscription: Stripe.Subscription, context: SubscriptionContext): Promise<void> {
    try {
      const customer = await this.stripe.customers.retrieve(subscription.customer as string) as Stripe.Customer;
      const userId = customer.metadata?.userId;

      if (!userId) {
        console.error('No userId found in customer metadata');
        return;
      }

      const subscriptionData: CustomerData = {
        customerId: customer.id,
        subscriptionId: subscription.id,
        status: this.mapStripeStatus(subscription.status),
        trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : undefined,
        currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
      };

      await this.storeSubscriptionData(context, userId, subscriptionData);
    } catch (error) {
      console.error('Error updating subscription in storage:', error);
    }
  }

  private mapStripeStatus(stripeStatus: string): CustomerData['status'] {
    switch (stripeStatus) {
      case 'trialing':
        return 'trial';
      case 'active':
        return 'active';
      case 'canceled':
      case 'unpaid':
      case 'past_due':
        return 'cancelled';
      default:
        return 'inactive';
    }
  }

  private async storeSubscriptionData(context: SubscriptionContext, userId: string, data: CustomerData): Promise<void> {
    const key = `subscription_${userId}`;
    const value = JSON.stringify(data);

    try {
      // Store in agents SQL if available
      if (context.sql) {
        context.sql`
          INSERT OR REPLACE INTO kvstore (key, value) VALUES (${key}, ${value})
        `;
      }

      // Also store via internal API
      const baseUrl = new URL(context.requestUrl);
      await fetch(`${baseUrl.origin}/internal/set-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, data }),
      });
    } catch (error) {
      console.error('Error storing subscription data:', error);
    }
  }

  async getStoredSubscriptionData(context: SubscriptionContext, userId: string): Promise<CustomerData | null> {
    const key = `subscription_${userId}`;

    try {
      // Try agents SQL first
      if (context.sql) {
        const result = context.sql<{ value: string }>`
          SELECT value FROM kvstore WHERE key = ${key}
        `;
        if (result.length > 0) {
          return JSON.parse(result[0].value);
        }
      }

      // Fallback to internal API
      const baseUrl = new URL(context.requestUrl);
      const response = await fetch(`${baseUrl.origin}/internal/get-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (response.ok) {
        const data = await response.json() as { subscription?: CustomerData };
        return data.subscription || null;
      }
    } catch (error) {
      console.error('Error getting stored subscription data:', error);
    }

    return null;
  }

  async isSubscriptionActive(userId: string, context: SubscriptionContext): Promise<boolean> {
    try {
      // First check stored data for quick lookup
      const storedData = await this.getStoredSubscriptionData(context, userId);
      const now = new Date();

      if (storedData) {
        // Check trial period
        if (storedData.status === 'trial' && storedData.trialEnd && storedData.trialEnd > now) {
          return true;
        }

        // Check active subscription
        if (storedData.status === 'active' && storedData.currentPeriodEnd && storedData.currentPeriodEnd > now) {
          return true;
        }
      }

      // Fallback to live Stripe check
      const subscriptionStatus = await this.getSubscriptionStatus(userId);
      if (!subscriptionStatus) {
        return false;
      }

      // Update stored data with fresh info
      await this.storeSubscriptionData(context, userId, subscriptionStatus);

      return subscriptionStatus.status === 'trial' || subscriptionStatus.status === 'active';
    } catch (error) {
      console.error('Error checking subscription status:', error);
      return false;
    }
  }
}