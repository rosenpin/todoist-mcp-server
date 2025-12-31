# Claude memory

# todoist-mcp-server
- This is a TypeScript/Node.js project using the `agents` npm package
- The main server file is `/workspaces/todoist-mcp-server/src/index.ts`
- The server extends McpAgent from the agents package for SSE support
- Integration routing is done via query parameters (?integration_id=xxx)
- Uses Cloudflare Workers for deployment
- D1 database for persistent storage (tokens, oauth states)

