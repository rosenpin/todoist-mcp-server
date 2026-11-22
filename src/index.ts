import { deleteUser, getToken } from "./database.js";
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { handleAuthorize, handleOAuthCallback, handleOAuthInit } from "./oauth.js";
import { TodoistMCPv3 } from "./todoist-mcp.js";
import { TodoistMCPv2, TodoistMCP } from "./cleanup-do.js";
import { favicon, renderOAuthSetupPage, renderSuccessPage } from "./ui-loader.js";

// Export Durable Object classes for Cloudflare Workers
export { TodoistMCPv3, TodoistMCPv2, TodoistMCP };

// Existing routes: setup UI, ?user_id= MCP URLs (SSE + Streamable HTTP), admin
const app = {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);

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

    if (url.pathname === "/favicon.svg" || url.pathname === "/favicon.ico") {
      return new Response(favicon, {
        headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
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

    // OAuth endpoints (discovery, /token and /register are served by OAuthProvider)
    if (url.pathname === "/auth") {
      return await handleOAuthInit(url, env);
    }

    if (url.pathname === "/authorize") {
      return await handleAuthorize(request, env);
    }

    if (url.pathname === "/callback") {
      return await handleOAuthCallback(request, env);
    }

    // Root endpoint - show UI for non-SSE requests
    if (url.pathname === "/" && request.method === "GET" && request.headers.get("accept")?.includes("text/html")) {
      const userId = url.searchParams.get("user_id");

      if (userId && env.DB && await getToken(env.DB, userId)) {
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
    // Streamable HTTP (Gemini, newer clients): POST JSON-RPC to the URL itself, or follow-ups carrying mcp-session-id
    const isStreamableHttp = url.pathname === "/" &&
      (request.method !== "GET" || request.headers.has("mcp-session-id"));

    console.log("Request analysis:", { isStreamMethod, isMessage, isStreamableHttp });

    if (isStreamMethod || isMessage || isStreamableHttp) {
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

      // Create a new request with the modified URL (body teed so closeWhenAnswered can read request ids)
      const modifiedRequest = new Request(modifiedUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.clone().body,
        // @ts-ignore - duplex is needed for streaming bodies in Node.js
        duplex: "half",
      });

      // Set request URL in context for agents library
      ctx.props = ctx.props || {};
      ctx.props.requestUrl = modifiedUrl.toString();

      console.log("Handling MCP request via agents library", { userId, sessionId: modifiedUrl.searchParams.get("sessionId") });
      if (isStreamableHttp) {
        return closeWhenAnswered(request, TodoistMCPv3.serve("/").fetch(modifiedRequest, env, ctx));
      }
      return await TodoistMCPv3.serveSSE("/*").fetch(modifiedRequest, env, ctx);
    }

    // Set request URL in context for agents library (for non-MCP requests)
    ctx.props = ctx.props || {};
    ctx.props.requestUrl = request.url;

    // Plain GET on the MCP URL (Gemini probes this): Streamable HTTP has no standalone GET stream here
    if (url.pathname === "/") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { "Allow": "POST, DELETE", "Access-Control-Allow-Origin": "*" },
      });
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

// agents@0.0.94 leaves Streamable HTTP response streams open ~10s after the last reply, and clients
// (Gemini) wait for the stream to end. Close it once every JSON-RPC request in the POST is answered.
// ponytail: drop this after upgrading `agents`, which closes the stream itself
async function closeWhenAnswered(request: Request, responsePromise: Promise<Response>): Promise<Response> {
  const pending = new Set<unknown>();
  if (request.method === "POST") {
    try {
      for (const msg of [await request.json()].flat() as any[]) {
        if (msg?.method !== undefined && msg.id !== undefined) pending.add(msg.id);
      }
    } catch {}
  }
  const response = await responsePromise;
  if (!pending.size || !response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
    return response;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const closer = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);
      buffer += decoder.decode(chunk, { stream: true });
      let end;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const data = buffer.slice(0, end).split("\n").find((line) => line.startsWith("data: "));
        buffer = buffer.slice(end + 2);
        try {
          const msg = data && JSON.parse(data.slice(6));
          if (msg && ("result" in msg || "error" in msg)) pending.delete(msg.id);
        } catch {}
      }
      if (!pending.size) controller.terminate();
    },
  });
  response.body.pipeTo(closer.writable).catch(() => {});
  return new Response(closer.readable, response);
}

// Public origins this worker answers on; OAuth resource metadata must name the exact origin a client used.
// ponytail: hardcoded list, add new custom domains here
const ORIGINS = [
  "https://todoistmcp.rosenpin.io",
  "https://todoist-mcp-server.real-tomer-rosenfeld.workers.dev",
];

const mcpApiHandler = {
  fetch(request: Request, env: any, ctx: any) {
    ctx.props = { ...ctx.props, requestUrl: request.url };
    return closeWhenAnswered(request, TodoistMCPv3.serve("/mcp").fetch(request.clone(), env, ctx));
  },
};

// /mcp: OAuth-protected Streamable HTTP endpoint (Gemini, Claude, ChatGPT). Everything else -> app.
// One provider per origin: the issuer follows the request origin, the protected resource is fixed per provider.
const providers = new Map(ORIGINS.map((origin) => [new URL(origin).host, new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: mcpApiHandler,
  defaultHandler: app as any,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  resourceMetadata: {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    resource_name: "Todoist MCP",
  },
})]));

export default {
  fetch(request: Request, env: any, ctx: any) {
    const provider = providers.get(new URL(request.url).host) ?? providers.get(new URL(ORIGINS[0]).host)!;
    return provider.fetch(request, env, ctx);
  },
};
