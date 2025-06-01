import { TodoistMCP } from "./todoist-mcp.js";
import { handleOAuthInit, handleOAuthCallback, handleOAuthDiscovery } from "./oauth.js";
import { renderOAuthSetupPage, renderSuccessPage } from "./ui.js";
import { getToken, setToken, deleteUser } from "./database.js";

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