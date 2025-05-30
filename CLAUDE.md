# Claude memory

- always use ruff for formatting
- always use mypy for type checking
- use uv venv with source .venv/bin/activate

# todoist-mcp-server
- The main server file is `/workspaces/todoist-mcp-server/src/final_server.py`
- DO NOT create multiple server files (like native_server.py, simple_server.py, streamable_server.py)
- Always update final_server.py when making changes to the server implementation
- The server uses FastMCP with SSE transport for Claude integrations
- Integration routing is done via query parameters (?integration_id=xxx)
