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

    // OAuth initiation endpoint
    if (url.pathname === "/auth") {
      const state = crypto.randomUUID();
      const clientId = env.CLIENT_ID;
      
      if (!clientId) {
        return new Response("OAuth not configured - CLIENT_ID missing", { status: 500 });
      }

      // Store state for validation (using current timestamp, could be improved)
      const db = env.DB;
      if (db) {
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS oauth_states (
            state TEXT PRIMARY KEY,
            created_at INTEGER NOT NULL
          )
        `).run();
        
        await db.prepare(
          "INSERT INTO oauth_states (state, created_at) VALUES (?, ?)"
        ).bind(state, Date.now()).run();
      }

      const authUrl = new URL("https://todoist.com/oauth/authorize");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("scope", "data:read_write");
      authUrl.searchParams.set("state", state);

      return new Response(null, {
        status: 302,
        headers: {
          "Location": authUrl.toString(),
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // OAuth callback endpoint
    if (url.pathname === "/callback") {
      try {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        
        if (!code || !state) {
          throw new Error("Missing authorization code or state");
        }

        // Validate state
        const db = env.DB;
        if (db) {
          const stateRecord = await db.prepare(
            "SELECT created_at FROM oauth_states WHERE state = ?"
          ).bind(state).first();
          
          if (!stateRecord) {
            throw new Error("Invalid state parameter");
          }
          
          // Clean up used state
          await db.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();
          
          // Check if state is not too old (5 minutes max)
          if (Date.now() - stateRecord.created_at > 5 * 60 * 1000) {
            throw new Error("State parameter expired");
          }
        }

        // Exchange code for access token
        const tokenResponse = await fetch("https://todoist.com/oauth/access_token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: env.CLIENT_ID,
            client_secret: env.CLIENT_SECRET,
            code: code,
          }),
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          throw new Error(`Token exchange failed: ${errorText}`);
        }

        const tokenData = await tokenResponse.json() as { access_token: string };
        const accessToken = tokenData.access_token;

        if (!accessToken) {
          throw new Error("No access token received");
        }

        // Validate token by testing API call
        const testResponse = await fetch('https://api.todoist.com/rest/v2/projects', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!testResponse.ok) {
          throw new Error("Received invalid access token");
        }

        // Generate unique user ID
        const userId = crypto.randomUUID();

        // Store the access token
        if (db) {
          await db.prepare(`
            CREATE TABLE IF NOT EXISTS kvstore (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            )
          `).run();

          await db.prepare(
            "INSERT OR REPLACE INTO kvstore (key, value) VALUES (?, ?)"
          ).bind(`todoist_token_${userId}`, accessToken).run();

          console.log(`Stored OAuth token for user ${userId} in D1`);
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
        const errorMessage = error instanceof Error ? error.message : "OAuth failed";
        return new Response(`
          <!DOCTYPE html>
          <html>
          <head><title>OAuth Error</title></head>
          <body>
            <h1>❌ OAuth Error</h1>
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

      // Show OAuth auth page
      return new Response(`
        <!DOCTYPE html>
        <html>
        <head><title>Todoist MCP Server - Setup</title></head>
        <body>
          <h1>🚀 Todoist MCP Server Setup</h1>
          <p>Connect your Todoist account to get a personalized integration URL for Claude.</p>
          
          <div style="max-width: 500px;">
            <h2>🔐 Secure OAuth Setup:</h2>
            <p>We'll securely connect to your Todoist account using OAuth 2.0 - no need to handle API tokens manually!</p>
            
            <a href="/auth" style="display: inline-block; padding: 15px 30px; background: #e44332; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
              🔗 Connect with Todoist
            </a>
            
            <h3>📝 What happens next:</h3>
            <ol>
              <li>You'll be redirected to Todoist to authorize access</li>
              <li>We'll create your personalized MCP integration URL</li>
              <li>Add the URL to Claude to start using Todoist tools!</li>
            </ol>
          </div>
          
          <p><strong>Privacy:</strong> We only request the minimum permissions needed and your data stays secure.</p>
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