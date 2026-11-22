# Todoist MCP Server

A hosted [Model Context Protocol](https://modelcontextprotocol.io) server for Todoist. Connect it to Claude, ChatGPT, Gemini CLI, Cursor, VS Code or any other MCP client and manage your tasks in plain language.

**Live service: [todoistmcp.rosenpin.io](https://todoistmcp.rosenpin.io)**

## Quick start

1. Open [todoistmcp.rosenpin.io](https://todoistmcp.rosenpin.io) and connect your Todoist account.
2. Copy your personal server URL. Keep it private: it grants access to your Todoist account.
3. Add it to your client:

| Client | How |
| --- | --- |
| Claude (web / desktop) | Settings → Connectors → Add custom connector |
| Claude Code | `claude mcp add --transport http todoist "<URL>"` |
| ChatGPT | Settings → Apps & Connectors → Advanced → Developer mode, then Create |
| Gemini CLI | `~/.gemini/settings.json`: `{"mcpServers": {"todoist": {"httpUrl": "<URL>"}}}` |
| Cursor | `~/.cursor/mcp.json`: `{"mcpServers": {"todoist": {"url": "<URL>"}}}` |
| VS Code | `.vscode/mcp.json`: `{"servers": {"todoist": {"type": "http", "url": "<URL>"}}}` |

The server speaks Streamable HTTP and, for older clients, SSE, both on the same URL.

## Tools

- **Tasks:** `get_tasks`, `create_task`, `update_task`, `complete_task`, `uncomplete_task`
- **Projects:** `list_projects`, `create_project`, `update_project`, `delete_project`
- **Sections:** `get_sections`, `create_section`
- **Labels:** `get_labels`, `create_label`
- **Comments:** `get_comments`, `create_comment`

## Development

Runs on Cloudflare Workers with D1 for token storage and Durable Objects for MCP sessions.

```sh
npm install
cp .env.example .dev.vars   # fill in your Todoist OAuth app credentials
npm run dev
```

`public/` holds the web pages; `npm run build-templates` bundles them into `src/ui-templates-generated.ts`, and `dev` and `deploy` run it automatically.

## Support

Open an [issue](https://github.com/rosenpin/todoist-mcp-server/issues) or email i@rosenpin.io.
