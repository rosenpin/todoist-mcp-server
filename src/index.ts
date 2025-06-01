import { TodoistMCP } from "./todoist-mcp.js";
import { handleOAuthInit, handleOAuthCallback, handleOAuthDiscovery } from "./oauth.js";
import { renderOAuthSetupPage, renderSuccessPage } from "./ui.js";
import { getToken, setToken, deleteUser, ensureSubscriptions } from "./database.js";
import { SubscriptionManager } from "./subscription.js";

// Export Durable Object class for Cloudflare Workers
export { TodoistMCP };

// Cloudflare Worker export
export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);

    console.log("Incoming request:", {
      method: request.method,
      pathname: url.pathname,
      headers: Object.fromEntries(request.headers.entries()),
    });

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Accept",
        },
      });
    }

    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "healthy",
        server: "todoist-mcp-cloudflare",
        version: "1.0.0",
        transport: "sse",
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Internal token endpoints for Durable Objects
    if (url.pathname === "/internal/get-token" && request.method === "POST") {
      try {
        const { userId } = await request.json() as { userId: string };
        const db = env.DB;

        if (!db) {
          return new Response(JSON.stringify({ error: "Database not available" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }

        const token = await getToken(db, userId);
        return new Response(JSON.stringify({ token }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("Error getting token:", error);
        return new Response(JSON.stringify({ error: "Internal error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    if (url.pathname === "/internal/set-token" && request.method === "POST") {
      try {
        const { userId, token } = await request.json() as { userId: string; token: string };
        const db = env.DB;

        if (!db) {
          return new Response(JSON.stringify({ error: "Database not available" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }

        await setToken(db, userId, token);
        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("Error storing token:", error);
        return new Response(JSON.stringify({ error: "Internal error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // Delete account endpoint
    if (url.pathname === "/delete-account" && request.method === "POST") {
      try {
        const { userId } = await request.json() as { userId: string };
        const db = env.DB;

        if (!db) {
          return new Response(JSON.stringify({ error: "Database not available" }), {
            status: 500,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        await deleteUser(db, userId);
        return new Response(JSON.stringify({ success: true }), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      } catch (error) {
        console.error("Error deleting user account:", error);
        return new Response(JSON.stringify({ error: "Failed to delete account" }), {
          status: 500,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
    }

    // Subscription endpoints
    if (url.pathname === "/internal/get-subscription" && request.method === "POST") {
      try {
        const { userId } = await request.json() as { userId: string };
        const db = env.DB;

        if (!db) {
          return new Response(JSON.stringify({ error: "Database not available" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }

        await ensureSubscriptions(db);
        const result = await db.prepare("SELECT * FROM subscriptions WHERE user_id = ?").bind(userId).first();
        const subscription = result ? JSON.parse(result.subscription_data) : null;
        
        return new Response(JSON.stringify({ subscription }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("Error getting subscription:", error);
        return new Response(JSON.stringify({ error: "Internal error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    if (url.pathname === "/internal/set-subscription" && request.method === "POST") {
      try {
        const { userId, data } = await request.json() as { userId: string; data: any };
        const db = env.DB;

        if (!db) {
          return new Response(JSON.stringify({ error: "Database not available" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }

        await ensureSubscriptions(db);
        await db.prepare(
          "INSERT OR REPLACE INTO subscriptions (user_id, subscription_data, updated_at) VALUES (?, ?, ?)"
        ).bind(userId, JSON.stringify(data), new Date().toISOString()).run();

        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("Error storing subscription:", error);
        return new Response(JSON.stringify({ error: "Internal error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // Payment endpoints
    if (url.pathname === "/create-subscription" && request.method === "POST") {
      try {
        // Check if subscriptions are enabled
        if (env.SUBSCRIPTION_ENABLED !== "true") {
          return new Response(JSON.stringify({ 
            error: "Subscriptions are currently disabled",
            paymentUrl: null 
          }), {
            status: 200,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        const { userId, email } = await request.json() as { userId: string; email?: string };
        
        if (!env.STRIPE_SECRET_KEY) {
          return new Response(JSON.stringify({ error: "Stripe not configured" }), {
            status: 500,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        const subscriptionManager = new SubscriptionManager(env.STRIPE_SECRET_KEY);
        await subscriptionManager.initialize();
        
        const paymentUrl = await subscriptionManager.createPaymentLink(userId);
        
        return new Response(JSON.stringify({ paymentUrl }), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      } catch (error) {
        console.error("Error creating subscription:", error);
        return new Response(JSON.stringify({ error: "Failed to create subscription" }), {
          status: 500,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
    }

    if (url.pathname === "/subscription-status" && request.method === "POST") {
      try {
        const { userId } = await request.json() as { userId: string };
        
        // If subscriptions are disabled, return active status
        if (env.SUBSCRIPTION_ENABLED !== "true") {
          return new Response(JSON.stringify({ 
            isActive: true, 
            subscription: { status: 'active', note: 'Subscriptions disabled' }
          }), {
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }
        
        if (!env.STRIPE_SECRET_KEY) {
          return new Response(JSON.stringify({ error: "Stripe not configured" }), {
            status: 500,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        const subscriptionManager = new SubscriptionManager(env.STRIPE_SECRET_KEY);
        await subscriptionManager.initialize();

        const context = { requestUrl: request.url };
        const isActive = await subscriptionManager.isSubscriptionActive(userId, context);
        const subscriptionData = await subscriptionManager.getStoredSubscriptionData(context, userId);
        
        return new Response(JSON.stringify({ 
          isActive, 
          subscription: subscriptionData 
        }), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      } catch (error) {
        console.error("Error checking subscription status:", error);
        return new Response(JSON.stringify({ error: "Failed to check subscription" }), {
          status: 500,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
    }

    // Stripe webhook endpoint
    if (url.pathname === "/webhook/stripe" && request.method === "POST") {
      try {
        if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
          return new Response("Webhook not configured", { status: 400 });
        }

        const subscriptionManager = new SubscriptionManager(env.STRIPE_SECRET_KEY);
        await subscriptionManager.initialize();

        const body = await request.text();
        const sig = request.headers.get('stripe-signature');

        if (!sig) {
          return new Response("No signature", { status: 400 });
        }

        // Note: Stripe webhook signature verification would be done here
        // For now, we'll parse the event directly
        const event = JSON.parse(body);

        const context = { requestUrl: request.url };
        await subscriptionManager.handleWebhook(event, context);

        return new Response("OK");
      } catch (error) {
        console.error("Error handling webhook:", error);
        return new Response("Webhook error", { status: 400 });
      }
    }

    // OAuth endpoints
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      return handleOAuthDiscovery(url);
    }

    if (url.pathname === "/auth") {
      return await handleOAuthInit(url, env);
    }

    if (url.pathname === "/callback") {
      return await handleOAuthCallback(url, env);
    }

    // Registration endpoint
    if (url.pathname === "/register" && request.method === "POST") {
      return new Response(JSON.stringify({
        client_id: "todoist-mcp-client",
        registration_access_token: "demo-token",
        client_secret: "demo-secret",
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Root endpoint - show UI for non-SSE requests
    if (url.pathname === "/" && !request.headers.get("accept")?.includes("text/event-stream")) {
      const userId = url.searchParams.get("user_id");

      const htmlContent = userId 
        ? renderSuccessPage(url.origin, userId)
        : renderOAuthSetupPage();

      return new Response(htmlContent, {
        headers: {
          "Content-Type": "text/html",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // MCP/SSE handling
    const isStreamMethod = request.headers.get("accept")?.includes("text/event-stream");
    const isMessage = request.method === "POST" && 
                     url.pathname.includes("/message") && 
                     url.pathname !== "/message";

    console.log("Request analysis:", { isStreamMethod, isMessage });

    // Set request URL in context for agents library
    ctx.props = ctx.props || {};
    ctx.props.requestUrl = request.url;

    if (isStreamMethod || isMessage) {
      console.log("Handling MCP request via agents library");
      return await TodoistMCP.serveSSE("/*").fetch(request, env, ctx);
    }

    // Default 404 response
    return new Response("Not Found", {
      status: 404,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};