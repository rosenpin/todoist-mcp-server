import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TodoistClient } from "./todoist-client.js";
import { z } from "zod";

// Define the MCP agent for Todoist
export class TodoistMCP extends McpAgent {
  server = new McpServer({
    name: "TodoistMCP",
    version: "1.0.0",
  });

  async init() {
    // Initialize storage if available
    await this.initializeStorage();

    // Extract environment and request details  
    const requestUrl = this.props.requestUrl as string;
    const url = new URL(requestUrl);

    // Extract user ID from URL (for user-specific token storage)
    const userId = url.searchParams.get("user_id") || url.searchParams.get("sessionId") || "default";

    console.log("Initializing TodoistMCP server", { requestUrl, userId });

    // Get user's Todoist token from storage
    const todoistToken = await this.getUserToken(userId);
    if (!todoistToken) {
      console.log("No Todoist token found for user:", userId);
      // Register a setup tool instead of actual Todoist tools
      this.registerSetupTool();
      return;
    }

    const todoistClient = new TodoistClient(todoistToken);

    // Register list_projects tool
    this.server.tool(
      "list_projects",
      "List all Todoist projects",
      {
        type: "object",
        properties: {},
        required: [],
      },
      async () => {
        console.log("Executing list_projects tool");
        try {
          const projects = await todoistClient.getProjects();
          return {
            content: [
              {
                type: "text",
                text: `📋 **Your Todoist Projects:**\n\n${projects.map(p => `• **${p.name}** (${p.id})`).join('\n')}\n\n*Found ${projects.length} projects*`,
              },
            ],
          };
        } catch (error) {
          console.error("Error fetching projects:", error);
          return {
            content: [
              {
                type: "text",
                text: `❌ **Error fetching projects:** ${error}`,
              },
            ],
          };
        }
      }
    );

    // Register get_tasks tool  
    this.server.tool(
      "get_tasks",
      "Get tasks from Todoist with optional filtering",
      {
        type: "object",
        properties: {
          projectId: {
            type: "string",
            description: "Filter by project ID (optional)",
          },
          filterQuery: {
            type: "string",
            description: "Todoist filter query (optional)",
          },
          limit: {
            type: "number",
            description: "Maximum number of tasks (default: 20, max: 100)",
            minimum: 1,
            maximum: 100,
          },
        },
        required: [],
      },
      async (args: any) => {
        console.log("Executing get_tasks tool", args);
        try {
          const limit = Math.min(args.limit || 20, 100);

          // Build filter string
          const filterParts: string[] = [];

          if (args.projectId) {
            const projects = await todoistClient.getProjects();
            const project = projects.find(p => p.id === args.projectId);
            if (project) {
              filterParts.push(`#${project.name}`);
            }
          }

          if (args.filterQuery) {
            filterParts.push(args.filterQuery);
          }

          const filter = filterParts.length > 0 ? filterParts.join(' & ') : undefined;
          let tasks = await todoistClient.getTasks(filter);

          // Apply limit
          tasks = tasks.slice(0, limit);

          if (tasks.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: "📝 **No tasks found** matching your criteria.",
                },
              ],
            };
          }

          const tasksText = tasks.map(task =>
            `• **${task.content}** (${task.id})\n  Priority: ${task.priority}${task.dueString ? `\n  Due: ${task.dueString}` : ''}${task.description ? `\n  Description: ${task.description}` : ''}`
          ).join('\n\n');

          return {
            content: [
              {
                type: "text",
                text: `📝 **Your Tasks:**\n\n${tasksText}\n\n*Found ${tasks.length} tasks${filter ? ` with filter: ${filter}` : ''}*`,
              },
            ],
          };
        } catch (error) {
          console.error("Error fetching tasks:", error);
          return {
            content: [
              {
                type: "text",
                text: `❌ **Error fetching tasks:** ${error}`,
              },
            ],
          };
        }
      }
    );

    // Register create_task tool
    this.server.tool(
      "create_task",
      "Create a new task in Todoist",
      {
        content: z.string().describe("Task content/title"),
        projectId: z.string().optional().describe("Project ID (optional)"),
        description: z.string().optional().describe("Task description (optional)"),
        labels: z.array(z.string()).optional().describe("List of label names (optional)"),
        priority: z.number().optional().default(1).describe("Priority (1-4, default: 1)"),
        dueString: z.string().optional().describe("Due date in natural language (e.g., 'tomorrow', 'next week')"),
      },
      async (args, extra) => {
        console.log("Executing create_task tool", args);
        try {
          const task = await todoistClient.createTask({
            content: args.content,
            projectId: args.projectId,
            description: args.description,
            labels: args.labels,
            priority: args.priority || 1,
            dueString: args.dueString,
          });

          return {
            content: [
              {
                type: "text",
                text: `✅ **Task Created Successfully!**\n\n📋 **Task:** ${task.content}\n🆔 **ID:** ${task.id}\n📁 **Priority:** ${task.priority}${task.dueString ? `\n📅 **Due:** ${task.dueString}` : ''}${task.description ? `\n📝 **Description:** ${task.description}` : ''}`,
              },
            ],
          };
        } catch (error) {
          console.error("Error creating task:", error);
          return {
            content: [
              {
                type: "text",
                text: `❌ **Error creating task:** ${error}`,
              },
            ],
          };
        }
      }
    );

    // Register update_task tool
    this.server.tool(
      "update_task",
      "Update an existing task",
      {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "ID of the task to update",
          },
          content: {
            type: "string",
            description: "New task content/title (optional)",
          },
          description: {
            type: "string",
            description: "New task description (optional)",
          },
          labels: {
            type: "array",
            items: { type: "string" },
            description: "New list of label names (optional)",
          },
          priority: {
            type: "number",
            description: "New priority (1-4, optional)",
            minimum: 1,
            maximum: 4,
          },
          dueString: {
            type: "string",
            description: "New due date (optional)",
          },
        },
        required: ["taskId"],
      },
      async (args: any) => {
        console.log("Executing update_task tool", args);
        try {
          await todoistClient.updateTask(args.taskId, {
            content: args.content,
            description: args.description,
            labels: args.labels,
            priority: args.priority,
            dueString: args.dueString,
          });

          return {
            content: [
              {
                type: "text",
                text: `✅ **Task ${args.taskId} updated successfully!**`,
              },
            ],
          };
        } catch (error) {
          console.error("Error updating task:", error);
          return {
            content: [
              {
                type: "text",
                text: `❌ **Error updating task:** ${error}`,
              },
            ],
          };
        }
      }
    );

    // Register complete_task tool
    this.server.tool(
      "complete_task",
      "Mark a task as completed",
      {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "ID of the task to complete",
          },
        },
        required: ["taskId"],
      },
      async (args: any) => {
        console.log("Executing complete_task tool", args);
        try {
          await todoistClient.completeTask(args.taskId);
          return {
            content: [
              {
                type: "text",
                text: `✅ **Task ${args.taskId} marked as completed!**`,
              },
            ],
          };
        } catch (error) {
          console.error("Error completing task:", error);
          return {
            content: [
              {
                type: "text",
                text: `❌ **Error completing task:** ${error}`,
              },
            ],
          };
        }
      }
    );

    // Register uncomplete_task tool
    this.server.tool(
      "uncomplete_task",
      "Mark a completed task as active again",
      {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "ID of the task to uncomplete",
          },
        },
        required: ["taskId"],
      },
      async (args: any) => {
        console.log("Executing uncomplete_task tool", args);
        try {
          await todoistClient.uncompleteTask(args.taskId);
          return {
            content: [
              {
                type: "text",
                text: `🔄 **Task ${args.taskId} marked as active again!**`,
              },
            ],
          };
        } catch (error) {
          console.error("Error uncompleting task:", error);
          return {
            content: [
              {
                type: "text",
                text: `❌ **Error uncompleting task:** ${error}`,
              },
            ],
          };
        }
      }
    );

    console.log("TodoistMCP server initialized with tools:", [
      "list_projects", "get_tasks", "create_task", "update_task", "complete_task", "uncomplete_task"
    ]);
  }

  // Initialize storage if available
  private async initializeStorage(): Promise<void> {
    try {
      if (this.sql) {
        // Create kvstore table if it doesn't exist using agents library SQL
        this.sql`
          CREATE TABLE IF NOT EXISTS kvstore (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          )
        `;
        console.log("Agents SQL storage initialized successfully");
      } else {
        console.log("Agents SQL storage not available");
      }
    } catch (error) {
      console.error("Error initializing storage:", error);
    }
  }

  // Helper method to get user's Todoist token from storage
  private async getUserToken(userId: string): Promise<string | null> {
    try {
      // First try agents SQL storage
      if (this.sql) {
        try {
          const result = this.sql<{ value: string }>`
            SELECT value FROM kvstore WHERE key = ${`todoist_token_${userId}`}
          `;

          if (result.length > 0) {
            console.log("Found stored token in agents SQL for user:", userId);
            return result[0].value;
          }
        } catch (sqlError) {
          console.log("Agents SQL not available, trying D1 lookup");
        }
      }

      // Fallback to D1 via internal API
      try {
        const baseUrl = new URL(this.props.requestUrl as string);
        const response = await fetch(`${baseUrl.origin}/internal/get-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.token) {
            console.log("Found stored token in D1 for user:", userId);
            return data.token;
          }
        }
      } catch (fetchError) {
        console.error("Error fetching token from D1:", fetchError);
      }

      console.log("No token found for user:", userId);
      return null;
    } catch (error) {
      console.error("Error getting user token:", error);
      return null;
    }
  }

  // Helper method to store user's Todoist token
  private async setUserToken(userId: string, token: string): Promise<void> {
    try {
      // Try to store in agents SQL storage first
      if (this.sql) {
        try {
          this.sql`
            INSERT OR REPLACE INTO kvstore (key, value) VALUES (${`todoist_token_${userId}`}, ${token})
          `;
          console.log("Stored Todoist token in agents SQL for user:", userId);
        } catch (sqlError) {
          console.log("Agents SQL storage failed, will try D1");
        }
      }

      // Also store in D1 via internal API for persistence
      try {
        const baseUrl = new URL(this.props.requestUrl as string);
        const response = await fetch(`${baseUrl.origin}/internal/set-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, token })
        });

        if (response.ok) {
          console.log("Stored Todoist token in D1 for user:", userId);
        } else {
          console.error("Failed to store token in D1");
        }
      } catch (fetchError) {
        console.error("Error storing token in D1:", fetchError);
      }

    } catch (error) {
      console.error("Error storing user token:", error);
      throw error;
    }
  }

  // Register setup tool for users without configured tokens
  private registerSetupTool(): void {
    this.server.tool(
      "setup_todoist",
      "Configure your Todoist API token to enable task management",
      {
        token: z.string().describe("Your Todoist API token (get it from https://todoist.com/prefs/integrations)"),
      },
      async (args, extra) => {
        console.log("Executing setup_todoist tool");
        console.log("Token received (first 10 chars):", args.token?.substring(0, 10));
        console.log("Token length:", args.token?.length);

        try {
          const url = new URL(this.props.requestUrl as string);
          const userId = url.searchParams.get("user_id") || url.searchParams.get("sessionId") || "default";

          // Validate token by making a test API call
          const testClient = new TodoistClient(args.token);
          console.log("Testing API call with token...");
          await testClient.getProjects(); // This will throw if token is invalid
          console.log("API call successful!");

          // Store the token
          await this.setUserToken(userId, args.token);

          return {
            content: [
              {
                type: "text",
                text: `✅ **Todoist API token configured successfully!**\n\n💡 **For better user management**, consider using the web setup at: ${new URL(this.props.requestUrl as string).origin}\n\n🔄 **Please refresh Claude integrations** (remove and re-add this server) to enable all Todoist tools.\n\n📋 Available tools after refresh:\n• list_projects\n• get_tasks  \n• create_task\n• update_task\n• complete_task\n• uncomplete_task`,
              },
            ],
          };
        } catch (error) {
          console.error("Error setting up Todoist token:", error);
          const errorMessage = error instanceof Error ? error.message : String(error);

          if (errorMessage.includes("Storage not available")) {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ **Storage Error:** Database storage is not available.\n\n🔧 **This is a server configuration issue.** Please contact the server administrator.\n\n💡 The server needs proper SQL storage configuration to store user tokens securely.`,
                },
              ],
            };
          }

          return {
            content: [
              {
                type: "text",
                text: `❌ **Error configuring Todoist token:** ${errorMessage}\n\n💡 **Please check:**\n• Token is valid and copied correctly\n• You have access to https://todoist.com/prefs/integrations\n• Token has proper permissions`,
              },
            ],
          };
        }
      }
    );

    console.log("TodoistMCP server initialized with setup tool only - no token configured");
  }
}

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
        const { userId } = await request.json();
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
        const { userId, token } = await request.json();
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

        // Store token in D1/agents storage (we'll need to access the global storage here)
        // For now, we'll handle this when the MCP server initializes with this user_id

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
              <li><strong>list_projects</strong> - List all Todoist projects</li>
              <li><strong>get_tasks</strong> - Get tasks with optional filtering</li>
              <li><strong>create_task</strong> - Create new tasks in Todoist</li>
              <li><strong>update_task</strong> - Update existing tasks</li>
              <li><strong>complete_task</strong> - Mark tasks as completed</li>
              <li><strong>uncomplete_task</strong> - Mark completed tasks as active</li>
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