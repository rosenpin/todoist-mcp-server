import { deleteUser, getToken, setToken } from "./database.js";
import { handleOAuthCallback, handleOAuthDiscovery, handleOAuthInit } from "./oauth.js";
import { TodoistMCPv3 } from "./todoist-mcp.js";
import { TodoistMCPv2, TodoistMCP } from "./cleanup-do.js";
import { renderOAuthSetupPage, renderSuccessPage } from "./ui-loader.js";

// Export Durable Object classes for Cloudflare Workers
export { TodoistMCPv3, TodoistMCPv2, TodoistMCP };

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


    // Admin cleanup endpoint: wipes storage from old Durable Objects
    // Usage: POST /admin/cleanup with Authorization header containing Cloudflare API token
    if (url.pathname === "/admin/cleanup" && request.method === "POST") {
      const authToken = request.headers.get("Authorization")?.replace("Bearer ", "");
      if (!authToken) {
        return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      try {
        const accountId = "72dbb7479fb1fd924dc864a342dd0718";

        // List all DO namespaces
        const nsResp = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/durable_objects/namespaces`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        const nsData = await nsResp.json() as any;
        if (!nsData.success) {
          return new Response(JSON.stringify({ error: "Failed to list namespaces", details: nsData.errors }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const classBindings: Record<string, any> = {
          "TodoistMCP": env.CLEANUP_V1,
          "TodoistMCPv2": env.CLEANUP_V2,
        };

        const results: Record<string, { total: number; cleaned: number; errors: number }> = {};

        for (const [className, binding] of Object.entries(classBindings)) {
          if (!binding) continue;

          const ns = nsData.result?.find((ns: any) => ns.class === className);
          if (!ns) {
            results[className] = { total: 0, cleaned: 0, errors: 0 };
            continue;
          }

          // List all objects in this namespace (paginated)
          let allObjects: any[] = [];
          let cursor: string | undefined;
          do {
            const params = new URLSearchParams();
            if (cursor) params.set("cursor", cursor);
            const objResp = await fetch(
              `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/durable_objects/namespaces/${ns.id}/objects?${params}`,
              { headers: { Authorization: `Bearer ${authToken}` } }
            );
            const objData = await objResp.json() as any;
            if (!objData.success) break;
            allObjects = allObjects.concat(objData.result || []);
            cursor = objData.result_info?.cursor;
          } while (cursor);

          let cleaned = 0;
          let errors = 0;

          for (const obj of allObjects) {
            try {
              const id = binding.idFromString(obj.id);
              const stub = binding.get(id);
              await stub.fetch(new Request("https://cleanup/delete", { method: "POST" }));
              cleaned++;
            } catch (e) {
              errors++;
            }
          }

          results[className] = { total: allObjects.length, cleaned, errors };
        }

        return new Response(JSON.stringify(results), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Cleanup error:", error);
        return new Response(JSON.stringify({ error: "Cleanup failed", message: String(error) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
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

      if (userId) {
        const htmlContent = renderSuccessPage(url.origin, userId);
        return new Response(htmlContent, {
          headers: {
            "Content-Type": "text/html",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } else {
        const htmlContent = renderOAuthSetupPage();
        return new Response(htmlContent, {
          headers: {
            "Content-Type": "text/html",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    }

    // MCP/SSE handling
    const isStreamMethod = request.headers.get("accept")?.includes("text/event-stream");
    const isMessage = request.method === "POST" &&
      url.pathname.includes("/message") &&
      url.pathname !== "/message";

    console.log("Request analysis:", { isStreamMethod, isMessage });

    if (isStreamMethod || isMessage) {
      // Require user_id to prevent orphaned Durable Objects from being created
      // for every connection (bots, scanners, misconfigured clients).
      // Without this, the agents library creates a new DO per connection,
      // which bloats storage toward the 2GB free tier limit.
      const userId = url.searchParams.get("user_id") || url.searchParams.get("sessionId");
      if (!userId) {
        return new Response(JSON.stringify({
          error: "Missing user_id parameter. Connect via the setup page to get your MCP URL.",
        }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      const modifiedUrl = new URL(request.url);
      if (!modifiedUrl.searchParams.has("sessionId")) {
        modifiedUrl.searchParams.set("sessionId", userId);
      }

      // Create a new request with the modified URL
      const modifiedRequest = new Request(modifiedUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
        // @ts-ignore - duplex is needed for streaming bodies in Node.js
        duplex: "half",
      });

      // Set request URL in context for agents library
      ctx.props = ctx.props || {};
      ctx.props.requestUrl = modifiedUrl.toString();

      console.log("Handling MCP request via agents library", { userId, sessionId: modifiedUrl.searchParams.get("sessionId") });
      return await TodoistMCPv3.serveSSE("/*").fetch(modifiedRequest, env, ctx);
    }

    // Set request URL in context for agents library (for non-MCP requests)
    ctx.props = ctx.props || {};
    ctx.props.requestUrl = request.url;

    // Default 404 response
    return new Response("Not Found", {
      status: 404,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};