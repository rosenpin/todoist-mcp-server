import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TodoistClient } from "./todoist-client.js";
import { getToken, setToken } from "./database.js";
import { registerTaskTools } from "./tools/task-tools.js";
import { registerProjectTools } from "./tools/project-tools.js";
import { registerSectionTools } from "./tools/section-tools.js";
import { registerLabelTools } from "./tools/label-tools.js";
import { registerCommentTools } from "./tools/comment-tools.js";
import { registerSetupTool } from "./tools/setup-tool.js";

// v3: Fresh DO namespace to clear accumulated storage from v2
export class TodoistMCPv3 extends McpAgent<{ DB: D1Database }> {
  server = new McpServer({
    name: "TodoistMCP",
    version: "1.0.0",
  });

  async init() {
    // Tokens used to be cached here; D1 is the only source of truth now, so a deleted account can't linger.
    this.sql`DROP TABLE IF EXISTS kvstore`;

    const requestUrl = this.props.requestUrl as string;
    const url = new URL(requestUrl);
    // OAuth clients (/mcp) carry userId in props; ?user_id= URLs carry it in the query
    const userId = (this.props.userId as string) || url.searchParams.get("user_id") || url.searchParams.get("sessionId") || "default";
    const db = this.env.DB;

    const todoistToken = await getToken(db, userId);
    if (!todoistToken) {
      registerSetupTool(this.server, (token) => setToken(db, userId, token), url.origin);
      return;
    }

    const todoistClient = new TodoistClient(todoistToken);
    registerProjectTools(this.server, todoistClient);
    registerTaskTools(this.server, todoistClient);
    registerSectionTools(this.server, todoistClient);
    registerLabelTools(this.server, todoistClient);
    registerCommentTools(this.server, todoistClient);
  }
}
