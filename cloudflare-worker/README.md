# Todoist MCP Cloudflare Worker

A Todoist MCP server implementation using Cloudflare Workers and the `agents` library, following the proven git-mcp pattern.

## Features

- ✅ **Working with Claude integrations** - Uses the proven `agents` library pattern
- 🔧 **Three Todoist tools**: `list_projects`, `list_tasks`, `add_task`
- 🌐 **SSE Transport** - Handles Server-Sent Events properly
- 📝 **Demo responses** - Ready to test immediately
- 🚀 **Cloudflare Workers** - Fast, global deployment

## Quick Deploy

1. **Get Cloudflare API Token**:
   - Go to https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
   - Create token with "Edit Cloudflare Workers" permissions
   - Set environment variable: `export CLOUDFLARE_API_TOKEN=your_token_here`

2. **Deploy**:
   ```bash
   cd /workspaces/todoist-mcp-server/cloudflare-worker
   npm install
   npx wrangler deploy
   ```

3. **Get your URL**:
   After deployment, you'll get a URL like: `https://todoist-mcp-server.your-username.workers.dev`

4. **Add to Claude integrations**:
   Use the full HTTPS URL in Claude integrations - no additional setup needed!

## Tools Available

### `list_projects`
Lists all Todoist projects (currently returns demo data).

### `list_tasks` 
Lists tasks from a specific project or all tasks.
- Optional parameter: `project_name`

### `add_task`
Adds a new task to Todoist.
- Required: `content` (task description)
- Optional: `project_name`, `due_date`

## Development

```bash
# Start local development server
npm run dev

# View logs
npm run tail
```

## Why This Works

This implementation follows the exact pattern used by git-mcp:
- Uses the `agents` library with `McpAgent` class
- Handles SSE transport automatically
- Proper request routing and protocol detection
- CORS headers for browser compatibility

Unlike the previous WebSocket attempts, this uses the proven SSE pattern that Claude integrations expect.