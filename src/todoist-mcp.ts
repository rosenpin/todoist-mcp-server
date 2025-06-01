import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TodoistClient } from "./todoist-client.js";
import { getUserToken, setUserToken, initializeStorage } from "./storage.js";
import { registerTaskTools } from "./tools/task-tools.js";
import { registerProjectTools } from "./tools/project-tools.js";
import { registerSectionTools } from "./tools/section-tools.js";
import { registerLabelTools } from "./tools/label-tools.js";
import { registerCommentTools } from "./tools/comment-tools.js";
import { registerSetupTool } from "./tools/setup-tool.js";
import { checkUserSubscription, createSubscriptionError } from "./subscription-utils.js";

// Define the MCP agent for Todoist
export class TodoistMCP extends McpAgent {
  server = new McpServer({
    name: "TodoistMCP",
    version: "1.0.0",
  });

  async init() {
    // Initialize storage if available
    await initializeStorage(this.sql);

    // Extract environment and request details  
    const requestUrl = this.props.requestUrl as string;
    const url = new URL(requestUrl);

    // Extract user ID from URL (for user-specific token storage)
    const userId = url.searchParams.get("user_id") || url.searchParams.get("sessionId") || "default";

    console.log("Initializing TodoistMCP server", { requestUrl, userId });

    // Get user's Todoist token from storage
    const storageContext = {
      sql: this.sql,
      requestUrl
    };
    
    const todoistToken = await getUserToken(storageContext, userId);
    
    if (!todoistToken) {
      console.log("No Todoist token found for user:", userId);
      // Register a setup tool instead of actual Todoist tools
      registerSetupTool(
        this.server,
        (userId: string, token: string) => setUserToken(storageContext, userId, token),
        requestUrl
      );
      console.log("TodoistMCP server initialized with setup tool only - no token configured");
      return;
    }

    // Check subscription status before registering tools
    const subscriptionCheck = await checkUserSubscription(userId, requestUrl, this.env);
    
    if (!subscriptionCheck.isActive) {
      console.log("User subscription inactive:", userId);
      // Register a limited tool that shows subscription error
      const { z } = await import("zod");
      
      this.server.tool(
        "subscription_required",
        "Your subscription is inactive. Use this tool to get subscription information and payment link.",
        {
          action: z.enum(["show_subscription_info"]).optional().describe("Action to perform"),
        },
        async (args) => {
          return {
            content: [{
              type: "text",
              text: `🔒 **Subscription Required**\n\n${subscriptionCheck.message || "Your subscription is inactive. Please subscribe to access Todoist tools."}\n\n${subscriptionCheck.paymentUrl ? `💳 **Subscribe here:** ${subscriptionCheck.paymentUrl}` : "📞 **Please contact support** to activate your subscription."}\n\n🎁 **New users get a 3-day free trial!**\n\n💰 **Price:** $2.99/month\n\n⭐ **What you get:**\n• Full access to all Todoist MCP tools\n• Create, update, and manage tasks\n• Project and section management\n• Label and comment features\n• Unlimited API usage`
            }]
          };
        }
      );
      
      console.log("TodoistMCP server initialized with subscription check only - subscription inactive");
      return;
    }

    const todoistClient = new TodoistClient(todoistToken);

    // Register all tool categories
    registerProjectTools(this.server, todoistClient);
    registerTaskTools(this.server, todoistClient);
    registerSectionTools(this.server, todoistClient);
    registerLabelTools(this.server, todoistClient);
    registerCommentTools(this.server, todoistClient);

    console.log("TodoistMCP server initialized with tools:", [
      "list_projects", "get_tasks", "create_task", "update_task", "complete_task", "uncomplete_task",
      "create_project", "update_project", "delete_project",
      "get_sections", "create_section",
      "get_labels", "create_label",
      "get_comments", "create_comment"
    ]);
  }
}