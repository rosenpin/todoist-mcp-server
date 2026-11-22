import { McpAgent } from "agents/mcp";
import { McpServer as LegacyMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpServer } from "@modelcontextprotocol/server";
import { TodoistClient } from "./todoist-client.js";
import { getToken, setToken } from "./database.js";
import { registerTaskTools } from "./tools/task-tools.js";
import { registerProjectTools } from "./tools/project-tools.js";
import { registerSectionTools } from "./tools/section-tools.js";
import { registerLabelTools } from "./tools/label-tools.js";
import { registerCommentTools } from "./tools/comment-tools.js";
import { registerSetupTool } from "./tools/setup-tool.js";

const SERVER_INFO = { name: "TodoistMCP", version: "1.0.0" };

// Registers the Todoist tools for this user, or only the setup tool if they have no token yet.
async function registerTools(server: McpServer, db: D1Database, userId: string, origin: string) {
  const todoistToken = await getToken(db, userId);
  if (!todoistToken) {
    registerSetupTool(server, (token) => setToken(db, userId, token), origin);
    stripUnsupportedSchemaKeywords(server);
    return;
  }

  const todoistClient = new TodoistClient(todoistToken);
  registerProjectTools(server, todoistClient);
  registerTaskTools(server, todoistClient);
  registerSectionTools(server, todoistClient);
  registerLabelTools(server, todoistClient);
  registerCommentTools(server, todoistClient);
  stripUnsupportedSchemaKeywords(server);
}

// Gemini accepts only an OpenAPI subset of JSON Schema and rejects $schema / additionalProperties,
// which zod's JSON Schema conversion emits on every tool.
// ponytail: wraps the SDK's private tools/list handler (same map in SDK v1 and v2); drop if the SDK can omit them
function stripUnsupportedSchemaKeywords(server: McpServer) {
  const handlers = (server.server as any)._requestHandlers as Map<string, (req: any, ctx: any) => Promise<any>>;
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
  handlers.set("tools/list", async (req, ctx) => {
    const result = await listTools(req, ctx);
    result.tools.forEach((tool: any) => strip(tool.inputSchema));
    return result;
  });
}

// Streamable HTTP (/mcp and /?user_id=): a fresh stateless server per request, no Durable Object.
export async function createTodoistServer(db: D1Database, userId: string, origin: string): Promise<McpServer> {
  const server = new McpServer(SERVER_INFO);
  await registerTools(server, db, userId, origin);
  return server;
}

// Legacy SSE transport (GET / + POST /message) still needs a sessionful Durable Object.
// v3: Fresh DO namespace to clear accumulated storage from v2
// ponytail: delete once SSE clients are gone (watch for "legacy SSE" in logs)
export class TodoistMCPv3 extends McpAgent<{ DB: D1Database }> {
  server = new LegacyMcpServer(SERVER_INFO);

  async init() {
    // Tokens used to be cached here; D1 is the only source of truth now, so a deleted account can't linger.
    this.sql`DROP TABLE IF EXISTS kvstore`;

    const url = new URL(this.props!.requestUrl as string);
    const userId = url.searchParams.get("user_id") || url.searchParams.get("sessionId") || "default";
    console.log("legacy SSE session", { userId });
    // registerTool has the same shape in SDK v1 and v2
    await registerTools(this.server as unknown as McpServer, this.env.DB, userId, url.origin);
  }
}
