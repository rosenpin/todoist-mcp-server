#!/usr/bin/env python3
"""Main entry point for the Todoist MCP server."""

import asyncio
import sys

from auth_manager import AuthManager
from mcp_server import TodoistMCPServer


async def main() -> None:
    """Run the MCP server with stdio transport."""
    server = TodoistMCPServer()

    # Check if we have a stored API token or need to prompt for one
    auth_manager = AuthManager()
    try:
        # This will prompt if no token is stored
        auth_manager.get_api_token()
    except ValueError:
        print("Error: No API token provided", file=sys.stderr)
        sys.exit(1)

    # Run the server
    await server.run_stdio()


if __name__ == "__main__":
    asyncio.run(main())
