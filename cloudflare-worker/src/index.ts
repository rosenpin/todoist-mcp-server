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
    
    // Extract session ID from URL (used by Claude integrations)
    const sessionId = url.searchParams.get("sessionId") || "default";

    console.log("Initializing TodoistMCP server", { requestUrl, sessionId });

    // Get user's Todoist token from storage
    const todoistToken = await this.getUserToken(sessionId);
    if (!todoistToken) {
      console.log("No Todoist token found for session:", sessionId);
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
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "Task content/title",
          },
          projectId: {
            type: "string",
            description: "Project ID (optional)",
          },
          description: {
            type: "string",
            description: "Task description (optional)",
          },
          labels: {
            type: "array",
            items: { type: "string" },
            description: "List of label names (optional)",
          },
          priority: {
            type: "number",
            description: "Priority (1-4, default: 1)",
            minimum: 1,
            maximum: 4,
          },
          dueString: {
            type: "string",
            description: "Due date in natural language (e.g., 'tomorrow', 'next week')",
          },
        },
        required: ["content"],
      },
      async (args: any) => {
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
      const env = this.props?.env;
      if (env?.DB) {
        // Create kvstore table if it doesn't exist
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS kvstore (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          )
        `).run();
        console.log("D1 storage initialized successfully");
      } else {
        console.log("D1 storage not available");
      }
    } catch (error) {
      console.error("Error initializing storage:", error);
    }
  }

  // Helper method to get user's Todoist token from storage
  private async getUserToken(sessionId: string): Promise<string | null> {
    try {
      const env = this.props?.env;
      if (!env?.DB) {
        console.error("D1 storage not available - cannot retrieve user token");
        return null;
      }
      
      const result = await env.DB.prepare(
        "SELECT value FROM kvstore WHERE key = ?"
      ).bind(`todoist_token_${sessionId}`).first();
      
      if (result) {
        console.log("Found stored token for session:", sessionId);
        return result.value as string;
      }
      
      console.log("No token found for session:", sessionId);
      return null;
    } catch (error) {
      console.error("Error getting user token:", error);
      return null;
    }
  }

  // Helper method to store user's Todoist token
  private async setUserToken(sessionId: string, token: string): Promise<void> {
    try {
      const env = this.props?.env;
      if (!env?.DB) {
        console.error("D1 storage not available - cannot store user token");
        throw new Error("Storage not available - please try again later");
      }
      
      await env.DB.prepare(
        "INSERT OR REPLACE INTO kvstore (key, value) VALUES (?, ?)"
      ).bind(`todoist_token_${sessionId}`, token).run();
      
      console.log("Stored Todoist token for session:", sessionId);
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
        type: "object",
        properties: {
          todoist_token: {
            type: "string",
            description: "Your Todoist API token (get it from https://todoist.com/prefs/integrations)",
          },
        },
        required: ["todoist_token"],
      },
      async (args: any) => {
        console.log("Executing setup_todoist tool");
        try {
          const sessionId = new URL(this.props.requestUrl as string).searchParams.get("sessionId") || "default";
          
          // Validate token by making a test API call
          const testClient = new TodoistClient(args.todoist_token);
          await testClient.getProjects(); // This will throw if token is invalid
          
          // Store the token
          await this.setUserToken(sessionId, args.todoist_token);
          
          return {
            content: [
              {
                type: "text",
                text: `✅ **Todoist API token configured successfully!**\n\n🔄 **Please refresh Claude integrations** (remove and re-add this server) to enable all Todoist tools.\n\n📋 Available tools after refresh:\n• list_projects\n• get_tasks  \n• create_task\n• update_task\n• complete_task\n• uncomplete_task`,
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

    // Root endpoint - info page (for non-SSE requests)
    if (url.pathname === "/" && !request.headers.get("accept")?.includes("text/event-stream")) {
      return new Response(`
        <!DOCTYPE html>
        <html>
        <head><title>Todoist MCP Server</title></head>
        <body>
          <h1>🚀 Todoist MCP Server</h1>
          <p>This server provides Todoist integration for Claude via MCP.</p>
          <p><strong>Server URL:</strong> <code>${url.origin}</code></p>
          <p><strong>Health Check:</strong> <a href="/health">/health</a></p>
          <p><strong>Transport:</strong> SSE (Server-Sent Events)</p>
          
          <h2>🔧 Setup Instructions:</h2>
          <ol>
            <li>Add this server URL to Claude integrations</li>
            <li>Use the <strong>setup_todoist</strong> tool to configure your API token</li>
            <li>Get your token from: <a href="https://todoist.com/prefs/integrations" target="_blank">Todoist Settings → Integrations</a></li>
            <li>Refresh Claude integrations to access all tools</li>
          </ol>

          <h2>📋 Available Tools (after setup):</h2>
          <ul>
            <li><strong>setup_todoist</strong> - Configure your Todoist API token</li>
            <li><strong>list_projects</strong> - List all Todoist projects</li>
            <li><strong>get_tasks</strong> - Get tasks with optional filtering</li>
            <li><strong>create_task</strong> - Create new tasks in Todoist</li>
            <li><strong>update_task</strong> - Update existing tasks</li>
            <li><strong>complete_task</strong> - Mark tasks as completed</li>
            <li><strong>uncomplete_task</strong> - Mark completed tasks as active</li>
          </ul>
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

    // Set request URL and environment in context for agents library
    ctx.props = ctx.props || {};
    ctx.props.requestUrl = request.url;
    ctx.props.env = env;

    if (isMessage) {
      console.log("Handling POST message request via SSE");
      return await TodoistMCP.serveSSE("/*").fetch(request, env, ctx);
    }

    if (isStreamMethod) {
      const isSse = request.method === "GET";
      console.log("Handling stream request", { isSse });
      
      if (isSse) {
        console.log("Serving SSE connection");
        return await TodoistMCP.serveSSE("/*").fetch(request, env, ctx);
      } else {
        console.log("Serving regular MCP connection");
        return await TodoistMCP.serve("/*").fetch(request, env, ctx);
      }
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