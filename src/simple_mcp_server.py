#!/usr/bin/env python3
"""Simple MCP server following git-mcp pattern exactly."""

import os
import json
import logging
import httpx
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator
from typing import Any

from mcp.server.mcp import Server
from mcp.types import Tool, TextContent
from pydantic import AnyUrl
from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from starlette.routing import Route
from sse_starlette import EventSourceResponse

from .auth_handlers import AuthHandlers
from .auth_service import AuthService
from .todoist_client import TodoistClient
from .config import SERVER_NAME, SERVER_VERSION

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def get_public_ip() -> str:
    """Get the public IP of this instance."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                "http://169.254.169.254/latest/meta-data/public-ipv4"
            )
            if response.status_code == 200:
                return response.text.strip()
    except Exception as e:
        logger.warning(f"Could not get public IP from metadata: {e}")

    # Fallback to external service
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get("https://api.ipify.org")
            if response.status_code == 200:
                return response.text.strip()
    except Exception as e:
        logger.warning(f"Could not get public IP from ipify: {e}")

    return "localhost"


@asynccontextmanager
async def lifespan(app: Starlette) -> AsyncGenerator[None, None]:
    """Application lifespan manager."""
    # Get public IP for base URL
    public_ip = await get_public_ip()
    base_url = os.getenv("BASE_URL", f"http://{public_ip}:8765")

    # Initialize services
    app.state.auth_service = AuthService()
    app.state.auth_handlers = AuthHandlers(base_url=base_url)
    app.state.mcp_servers = {}

    logger.info(f"Started {SERVER_NAME} v{SERVER_VERSION} at {base_url}")
    yield
    logger.info("Shutting down...")


def create_mcp_server(integration_id: str, todoist_token: str) -> Server:
    """Create an MCP server instance for a specific integration."""
    server = Server(SERVER_NAME)
    todoist_client = TodoistClient(todoist_token)

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        """List available tools."""
        return [
            Tool(
                name="list_projects",
                description="Get all Todoist projects",
                inputSchema={
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            ),
            Tool(
                name="get_tasks",
                description="Get tasks from Todoist with optional filtering",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "project_id": {
                            "type": "string",
                            "description": "Filter by project ID"
                        },
                        "filter": {
                            "type": "string", 
                            "description": "Todoist filter query (e.g., 'today', 'overdue', '@label')"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of tasks to return",
                            "default": 50,
                            "minimum": 1,
                            "maximum": 100
                        }
                    },
                    "required": []
                }
            ),
            Tool(
                name="create_task",
                description="Create a new task in Todoist",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "content": {
                            "type": "string",
                            "description": "Task content/title"
                        },
                        "project_id": {
                            "type": "string",
                            "description": "Project ID to add task to"
                        },
                        "description": {
                            "type": "string",
                            "description": "Task description"
                        },
                        "labels": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "List of label names"
                        },
                        "priority": {
                            "type": "integer",
                            "description": "Priority (1=normal, 2=high, 3=urgent, 4=critical)",
                            "default": 1,
                            "minimum": 1,
                            "maximum": 4
                        },
                        "due_string": {
                            "type": "string",
                            "description": "Due date in natural language (e.g., 'tomorrow', 'next Monday')"
                        }
                    },
                    "required": ["content"]
                }
            ),
            Tool(
                name="update_task",
                description="Update an existing task",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "task_id": {
                            "type": "string",
                            "description": "ID of the task to update"
                        },
                        "content": {
                            "type": "string",
                            "description": "New task content/title"
                        },
                        "description": {
                            "type": "string",
                            "description": "New task description"
                        },
                        "labels": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "New list of label names"
                        },
                        "priority": {
                            "type": "integer",
                            "description": "New priority (1-4)",
                            "minimum": 1,
                            "maximum": 4
                        },
                        "due_string": {
                            "type": "string",
                            "description": "New due date in natural language"
                        }
                    },
                    "required": ["task_id"]
                }
            ),
            Tool(
                name="complete_task",
                description="Mark a task as completed",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "task_id": {
                            "type": "string",
                            "description": "ID of the task to complete"
                        }
                    },
                    "required": ["task_id"]
                }
            ),
            Tool(
                name="uncomplete_task",
                description="Mark a completed task as active again",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "task_id": {
                            "type": "string",
                            "description": "ID of the task to uncomplete"
                        }
                    },
                    "required": ["task_id"]
                }
            )
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
        """Handle tool calls."""
        try:
            if name == "list_projects":
                projects = todoist_client.get_projects()
                return [TextContent(type="text", text=json.dumps(projects, indent=2))]
            
            elif name == "get_tasks":
                project_id = arguments.get("project_id")
                filter_query = arguments.get("filter")
                limit = arguments.get("limit", 50)
                
                # Build filter parts
                filter_parts = []
                if project_id:
                    project = next((p for p in todoist_client.get_projects() if p["id"] == project_id), None)
                    if project:
                        filter_parts.append(f"#{project['name']}")
                if filter_query:
                    filter_parts.append(filter_query)
                
                final_filter = " & ".join(filter_parts) if filter_parts else None
                tasks = todoist_client.get_tasks(filter=final_filter)
                tasks = tasks[:limit]
                
                return [TextContent(type="text", text=json.dumps(tasks, indent=2))]
            
            elif name == "create_task":
                task = todoist_client.create_task(
                    content=arguments["content"],
                    project_id=arguments.get("project_id"),
                    description=arguments.get("description"),
                    labels=arguments.get("labels"),
                    priority=arguments.get("priority", 1),
                    due_string=arguments.get("due_string")
                )
                return [TextContent(type="text", text=json.dumps(task, indent=2))]
            
            elif name == "update_task":
                success = todoist_client.update_task(
                    task_id=arguments["task_id"],
                    content=arguments.get("content"),
                    description=arguments.get("description"),
                    labels=arguments.get("labels"),
                    priority=arguments.get("priority"),
                    due_string=arguments.get("due_string")
                )
                
                if not success:
                    raise Exception(f"Failed to update task {arguments['task_id']}")
                
                # Try to get the updated task
                all_tasks = todoist_client.get_tasks()
                updated_task = next((t for t in all_tasks if t["id"] == arguments["task_id"]), None)
                
                if updated_task:
                    result = updated_task
                else:
                    result = {"message": f"Task {arguments['task_id']} updated successfully"}
                
                return [TextContent(type="text", text=json.dumps(result, indent=2))]
            
            elif name == "complete_task":
                success = todoist_client.complete_task(arguments["task_id"])
                
                if success:
                    result = {"message": f"Task {arguments['task_id']} marked as completed"}
                else:
                    raise Exception(f"Failed to complete task {arguments['task_id']}")
                
                return [TextContent(type="text", text=json.dumps(result, indent=2))]
            
            elif name == "uncomplete_task":
                success = todoist_client.uncomplete_task(arguments["task_id"])
                
                if success:
                    result = {"message": f"Task {arguments['task_id']} marked as active"}
                else:
                    raise Exception(f"Failed to uncomplete task {arguments['task_id']}")
                
                return [TextContent(type="text", text=json.dumps(result, indent=2))]
            
            else:
                raise ValueError(f"Unknown tool: {name}")
                
        except Exception as e:
            logger.error(f"Error in tool {name}: {e}", exc_info=True)
            return [TextContent(type="text", text=f"Error: {str(e)}")]

    return server


# Create CORS preflight response (following git-mcp pattern)
def handle_cors_preflight_request() -> Response:
    """Handle CORS preflight requests."""
    return Response(
        status_code=204,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*", 
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Max-Age": "86400",  # 24 hours
        }
    )


# Main request handler following git-mcp pattern
async def handle_request(request: Request) -> Response:
    """Handle all requests following git-mcp pattern."""
    url = request.url
    
    # Handle CORS preflight requests
    if request.method == "OPTIONS":
        return handle_cors_preflight_request()
    
    # Regular web routes
    if url.path == "/":
        return RedirectResponse(url="/auth")
    elif url.path == "/health":
        return JSONResponse(
            {"status": "healthy", "server": SERVER_NAME, "version": SERVER_VERSION}
        )
    elif url.path == "/auth":
        return await request.app.state.auth_handlers.show_auth_page(request)
    elif url.path == "/auth/create":
        return await request.app.state.auth_handlers.create_integration(request)
    
    # MCP handling following git-mcp pattern
    is_stream_method = (
        "text/event-stream" in request.headers.get("accept", "") and
        url.path and
        url.path != "/"
    )
    is_message = (
        request.method == "POST" and
        "/message" in url.path and
        url.path != "/message"
    )
    
    if is_message or is_stream_method:
        # Extract integration ID from path (format: /something/integration_id or /something/integration_id/message)
        path_parts = url.path.strip("/").split("/")
        if len(path_parts) >= 2:
            integration_id = path_parts[1]  # Assume second part is integration ID
            
            # Validate integration
            auth_service = request.app.state.auth_service
            todoist_token = auth_service.get_todoist_token(integration_id)
            
            if not todoist_token:
                return JSONResponse({"error": "Invalid integration ID"}, status_code=401)
            
            # Create MCP server if needed
            if integration_id not in request.app.state.mcp_servers:
                request.app.state.mcp_servers[integration_id] = create_mcp_server(
                    integration_id, todoist_token
                )
            
            mcp_server = request.app.state.mcp_servers[integration_id]
            
            # Handle SSE or message requests
            # This is where we'd need to implement the MCP-over-SSE protocol
            # For now, return a simple response
            logger.info(f"MCP request: method={request.method}, path={url.path}, accept={request.headers.get('accept')}")
            
            if is_stream_method and request.method == "GET":
                # SSE connection
                async def event_generator():
                    """Generate SSE events."""
                    # Send endpoint info 
                    yield {
                        "event": "endpoint",
                        "data": f"/message/{integration_id}"
                    }
                    
                    # Keep connection alive with periodic pings
                    import asyncio
                    import time
                    counter = 0
                    while True:
                        await asyncio.sleep(30)
                        counter += 1
                        yield {
                            "event": "ping", 
                            "data": json.dumps({"timestamp": time.time(), "counter": counter})
                        }
                
                return EventSourceResponse(event_generator())
            
            elif is_message and request.method == "POST":
                # Handle MCP message
                body = await request.json()
                logger.info(f"Received MCP message: {json.dumps(body)}")
                
                # This would need proper MCP protocol handling
                return JSONResponse({"jsonrpc": "2.0", "id": body.get("id"), "result": {"status": "ok"}})
    
    # Default response
    return JSONResponse({"error": "Not found"}, status_code=404)


# Create Starlette app
app = Starlette(
    lifespan=lifespan,
    routes=[
        Route("/{path:path}", handle_request, methods=["GET", "POST", "OPTIONS"]),
    ],
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8765))
    logger.info(f"Starting server on port {port}...")
    logger.info("MCP endpoint format: http://<server>:<port>/<integration_id>")

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info",
    )