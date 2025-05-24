#!/usr/bin/env python3
"""MCP server for Todoist integration."""

import asyncio
import logging
from typing import Any

from mcp.server import Server
from mcp.types import TextContent, Tool

from auth_manager import AuthManager
from config import SERVER_NAME
from todoist_client import TodoistClient

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TodoistMCPServer:
    """MCP server for Todoist task management."""

    def __init__(self) -> None:
        self.server: Server = Server(SERVER_NAME)
        self.auth_manager = AuthManager()
        self.todoist_client: TodoistClient | None = None
        self._setup_handlers()

    def _setup_handlers(self) -> None:
        """Set up MCP server handlers."""

        @self.server.list_tools()  # type: ignore[misc]
        async def list_tools() -> list[Tool]:
            return [
                Tool(
                    name="create_task",
                    description="Create a new task in Todoist",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "content": {
                                "type": "string",
                                "description": "The task content/title",
                            },
                            "description": {
                                "type": "string",
                                "description": "Optional task description",
                            },
                            "due_string": {
                                "type": "string",
                                "description": (
                                    "Natural language due date like 'tomorrow', "
                                    "'next Monday'"
                                ),
                            },
                            "priority": {
                                "type": "integer",
                                "description": "Priority from 1 (normal) to 4 (urgent)",
                                "minimum": 1,
                                "maximum": 4,
                            },
                        },
                        "required": ["content"],
                    },
                ),
                Tool(
                    name="list_tasks",
                    description="Get a list of tasks from Todoist",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "filter": {
                                "type": "string",
                                "description": "Filter like 'today', 'overdue'",
                            },
                            "priority": {
                                "type": "integer",
                                "description": "Filter by priority (1-4)",
                            },
                            "limit": {
                                "type": "integer",
                                "description": "Maximum number of tasks to return",
                                "default": 10,
                            },
                        },
                    },
                ),
                Tool(
                    name="complete_task",
                    description="Mark a task as complete",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "task_name": {
                                "type": "string",
                                "description": "Name of the task to complete",
                            }
                        },
                        "required": ["task_name"],
                    },
                ),
                Tool(
                    name="update_task",
                    description="Update an existing task",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "task_name": {
                                "type": "string",
                                "description": "Name of the task to update",
                            },
                            "content": {
                                "type": "string",
                                "description": "New task content",
                            },
                            "description": {
                                "type": "string",
                                "description": "New description",
                            },
                            "due_string": {
                                "type": "string",
                                "description": "New due date",
                            },
                            "priority": {
                                "type": "integer",
                                "description": "New priority (1-4)",
                            },
                        },
                        "required": ["task_name"],
                    },
                ),
                Tool(
                    name="delete_task",
                    description="Delete a task from Todoist",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "task_name": {
                                "type": "string",
                                "description": "Name of the task to delete",
                            }
                        },
                        "required": ["task_name"],
                    },
                ),
            ]

        @self.server.call_tool()  # type: ignore[misc]
        async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
            if not self.todoist_client:
                # In remote mode, the client is pre-initialized
                # In local mode, we need to get the token
                api_token = self.auth_manager.get_api_token()
                self.todoist_client = TodoistClient(api_token)

            if name == "create_task":
                result = self.todoist_client.create_task(
                    content=arguments["content"],
                    description=arguments.get("description"),
                    due_string=arguments.get("due_string"),
                    priority=arguments.get("priority"),
                )
                if result["success"]:
                    text = (
                        f"Task created: '{result['task']['content']}' "
                        f"(ID: {result['task']['id']})"
                    )
                else:
                    text = f"Error: {result['error']}"

            elif name == "list_tasks":
                result = self.todoist_client.list_tasks(
                    filter_str=arguments.get("filter"),
                    priority=arguments.get("priority"),
                    limit=arguments.get("limit", 10),
                )
                if result["success"]:
                    if result["count"] == 0:
                        text = "No tasks found matching the criteria."
                    else:
                        tasks = result["tasks"]
                        task_lines = []
                        for task in tasks:
                            line = f"• {task['content']}"
                            if task["due"]:
                                line += f" (Due: {task['due']})"
                            if task["priority"] > 1:
                                line += f" [P{task['priority']}]"
                            task_lines.append(line)
                        text = f"Found {result['count']} task(s):\n\n" + "\n".join(
                            task_lines
                        )
                else:
                    text = f"Error: {result['error']}"

            elif name == "complete_task":
                result = self.todoist_client.complete_task(arguments["task_name"])
                if result["success"]:
                    text = result["message"]
                else:
                    text = f"Error: {result['error']}"

            elif name == "update_task":
                result = self.todoist_client.update_task(
                    task_name=arguments["task_name"],
                    content=arguments.get("content"),
                    description=arguments.get("description"),
                    due_string=arguments.get("due_string"),
                    priority=arguments.get("priority"),
                )
                if result["success"]:
                    text = result["message"]
                else:
                    text = f"Error: {result['error']}"

            elif name == "delete_task":
                result = self.todoist_client.delete_task(arguments["task_name"])
                if result["success"]:
                    text = result["message"]
                else:
                    text = f"Error: {result['error']}"

            else:
                text = f"Unknown tool: {name}"

            return [TextContent(type="text", text=text)]

    async def run_stdio(self) -> None:
        """Run the MCP server with stdio transport."""
        from mcp.server.stdio import stdio_server

        async with stdio_server() as streams:
            await self.server.run(
                streams[0], streams[1], self.server.create_initialization_options()
            )


if __name__ == "__main__":
    server = TodoistMCPServer()
    asyncio.run(server.run_stdio())
