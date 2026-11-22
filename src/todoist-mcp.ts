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
      this.stripUnsupportedSchemaKeywords();
      return;
    }

    const todoistClient = new TodoistClient(todoistToken);
    registerProjectTools(this.server, todoistClient);
    registerTaskTools(this.server, todoistClient);
    registerSectionTools(this.server, todoistClient);
    registerLabelTools(this.server, todoistClient);
    registerCommentTools(this.server, todoistClient);
    this.stripUnsupportedSchemaKeywords();
  }

  // Gemini only accepts an OpenAPI subset of JSON Schema and rejects $schema / additionalProperties,
  // which the SDK's zod conversion emits on every tool.
  // ponytail: wraps the SDK's private tools/list handler; drop this once the SDK can emit plain schemas
  private stripUnsupportedSchemaKeywords() {
    const handlers = (this.server.server as any)._requestHandlers as Map<string, (req: any, extra: any) => Promise<any>>;
    const listTools = handlers.get("tools/list");
    if (!listTools) return;
    const strip = (node: any): void => {
      if (Array.isArray(node)) return node.forEach(strip);
      if (node && typeof node === "object") {
        delete node.$schema;
        delete node.additionalProperties;
        Object.values(node).forEach(strip);
      }
    };
    handlers.set("tools/list", async (req, extra) => {
      const result = await listTools(req, extra);
      result.tools.forEach((tool: any) => strip(tool.inputSchema));
      return result;
    });
  }
}
