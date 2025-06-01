import { TodoistMCP } from "./todoist-mcp.js";

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

    // Token lookup endpoint for internal use by Durable Objects
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

        // Ensure table exists
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS kvstore (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          )
        `).run();

        const result = await db.prepare(
          "SELECT value FROM kvstore WHERE key = ?"
        ).bind(`todoist_token_${userId}`).first();

        return new Response(JSON.stringify({
          token: result?.value || null
        }), {
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

    // Token storage endpoint for internal use by Durable Objects
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

        // Ensure table exists
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS kvstore (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          )
        `).run();

        await db.prepare(
          "INSERT OR REPLACE INTO kvstore (key, value) VALUES (?, ?)"
        ).bind(`todoist_token_${userId}`, token).run();

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

    // OAuth discovery endpoint
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      return new Response(JSON.stringify({
        issuer: url.origin,
        authorization_endpoint: `${url.origin}/auth`,
        token_endpoint: `${url.origin}/token`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Setup endpoint - handle token submission
    if (url.pathname === "/setup" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const token = formData.get("token") as string;

        if (!token) {
          throw new Error("No token provided");
        }

        // Validate token by testing API call
        const testResponse = await fetch('https://api.todoist.com/rest/v2/projects', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!testResponse.ok) {
          throw new Error("Invalid Todoist API token");
        }

        // Generate unique user ID
        const userId = crypto.randomUUID();

        // Store in D1 database
        const db = env.DB;
        if (db) {
          // Create table if it doesn't exist
          await db.prepare(`
            CREATE TABLE IF NOT EXISTS kvstore (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            )
          `).run();

          // Store the token
          await db.prepare(
            "INSERT OR REPLACE INTO kvstore (key, value) VALUES (?, ?)"
          ).bind(`todoist_token_${userId}`, token).run();

          console.log(`Stored token for user ${userId} in D1`);
        }

        // Redirect to success page
        return new Response(null, {
          status: 302,
          headers: {
            "Location": `/?user_id=${userId}`,
            "Access-Control-Allow-Origin": "*",
          },
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Setup failed";
        return new Response(`
          <!DOCTYPE html>
          <html>
          <head><title>Setup Error</title></head>
          <body>
            <h1>❌ Setup Error</h1>
            <p><strong>Error:</strong> ${errorMessage}</p>
            <p><a href="/">← Try again</a></p>
          </body>
          </html>
        `, {
          status: 400,
          headers: {
            "Content-Type": "text/html",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
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

    // Root endpoint - auth page for token setup (for non-SSE requests)
    if (url.pathname === "/" && !request.headers.get("accept")?.includes("text/event-stream")) {
      const userId = url.searchParams.get("user_id");

      if (userId) {
        // Show success page with integration URL
        return new Response(`
          <!DOCTYPE html>
          <html>
          <head><title>Todoist MCP Server - Ready!</title></head>
          <body>
            <h1>✅ Your Todoist MCP Server is Ready!</h1>
            <p>Your personal integration URL:</p>
            <input type="text" value="${url.origin}/?user_id=${userId}" readonly style="width: 100%; padding: 10px; font-family: monospace; background: #f0f0f0;">
            
            <h2>🔧 Setup Instructions:</h2>
            <ol>
              <li><strong>Copy the URL above</strong></li>
              <li>Go to Claude integrations</li>
              <li>Add the copied URL as a new MCP server</li>
              <li>Start using Todoist tools in Claude!</li>
            </ol>

            <h2>📋 Available Tools:</h2>
            <ul>
              <li><strong>Tasks:</strong> get_tasks, create_task, update_task, complete_task, uncomplete_task</li>
              <li><strong>Projects:</strong> list_projects, create_project, update_project, delete_project</li>
              <li><strong>Sections:</strong> get_sections, create_section</li>
              <li><strong>Labels:</strong> get_labels, create_label</li>
              <li><strong>Comments:</strong> get_comments, create_comment</li>
            </ul>

            <p><a href="/">← Set up another token</a></p>
          </body>
          </html>
        `, {
          headers: {
            "Content-Type": "text/html",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // Show auth form
      return new Response(`
        <!DOCTYPE html>
        <html>
        <head><title>Todoist MCP Server - Setup</title></head>
        <body>
          <h1>🚀 Todoist MCP Server Setup</h1>
          <p>Configure your Todoist API token to get a personalized integration URL for Claude.</p>
          
          <form action="/setup" method="POST" style="max-width: 500px;">
            <h2>📋 Setup Your Token:</h2>
            <ol>
              <li>Go to <a href="https://todoist.com/prefs/integrations" target="_blank">Todoist Settings → Integrations</a></li>
              <li>Copy your API token</li>
              <li>Paste it below:</li>
            </ol>
            
            <label for="token"><strong>Todoist API Token:</strong></label><br>
            <input type="text" id="token" name="token" required 
                   style="width: 100%; padding: 10px; margin: 10px 0; font-family: monospace;"
                   placeholder="Enter your Todoist API token..."><br>
            
            <button type="submit" style="padding: 10px 20px; background: #e44332; color: white; border: none; cursor: pointer;">
              Create Integration URL
            </button>
          </form>
          
          <p><strong>Privacy:</strong> Your token is stored securely and only used to access your Todoist data.</p>
        </body>
        </html>
      `, {
        headers: {
          "Content-Type": "text/html",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // SSE detection - Claude sends SSE requests to root path "/"
    const isStreamMethod =
      request.headers.get("accept")?.includes("text/event-stream");

    // Message detection
    const isMessage =
      request.method === "POST" &&
      url.pathname.includes("/message") &&
      url.pathname !== "/message";

    console.log("Request analysis:", { isStreamMethod, isMessage });

    // Set request URL in context for agents library
    ctx.props = ctx.props || {};
    ctx.props.requestUrl = request.url;

    // Handle MCP connections - let agents library handle all MCP traffic
    if (isStreamMethod || isMessage) {
      console.log("Handling MCP request via agents library");
      return await TodoistMCP.serveSSE("/*").fetch(request, env, ctx);
    }

    // Default response for other paths
    return new Response("Not Found", {
      status: 404,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};