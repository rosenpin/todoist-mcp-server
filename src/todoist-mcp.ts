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

// Define the MCP agent for Todoist
// v3: Fresh DO namespace to clear accumulated storage from v2
export class TodoistMCPv3 extends McpAgent {
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