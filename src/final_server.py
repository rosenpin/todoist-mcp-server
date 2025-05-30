#!/usr/bin/env python3
"""Final working MCP server with single endpoint and context-based routing."""

import asyncio
import logging
import os
from typing import Optional

import httpx
import uvicorn
from fastmcp import FastMCP
from fastmcp.server.dependencies import get_http_request
from pydantic import Field
from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, RedirectResponse
from starlette.routing import Mount, Route

from .auth_handlers import AuthHandlers  # type: ignore
from .auth_service import AuthService  # type: ignore
from .config import SERVER_NAME, SERVER_VERSION  # type: ignore
from .todoist_client import TodoistClient  # type: ignore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ContextualMCPServer:
    """Single MCP server that determines integration from request context."""

    def __init__(self):
        self.auth_service = AuthService()
        self.mcp = self.create_mcp_server()

    async def get_public_ip(self) -> str:
        """Get public IP address."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    "http://169.254.169.254/latest/meta-data/public-ipv4"
                )
                if response.status_code == 200:
                    return response.text.strip()
        except Exception:
            pass

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get("https://api.ipify.org")
                if response.status_code == 200:
                    return response.text.strip()
        except Exception:
            pass

        return "localhost"

    def get_integration_from_request(self) -> str:
        """Extract integration ID from current HTTP request context."""
        try:
            request = get_http_request()

            # Log the request details for debugging
            logger.info(f"Request URL: {request.url}")
            logger.info(f"Query params: {dict(request.query_params)}")

            # Try to get integration ID from query parameters
            integration_id = request.query_params.get("integration_id")
            if integration_id:
                logger.info(f"Found integration_id in query params: {integration_id}")
                return integration_id

            # Try to get from X-Integration-Id header
            integration_id = request.headers.get("X-Integration-Id")
            if integration_id:
                logger.info(f"Found integration_id in headers: {integration_id}")
                return integration_id

            # Try to get from path if it follows pattern /{integration_id}/mcp
            path_parts = request.url.path.strip("/").split("/")
            if len(path_parts) >= 2 and path_parts[1] == "mcp":
                logger.info(f"Found integration_id in path: {path_parts[0]}")
                return path_parts[0]

            # Default fallback - this will cause tools to fail with helpful error
            logger.warning("No integration_id found in request")
            return ""

        except Exception as e:
            logger.error(f"Failed to get integration from request: {e}", exc_info=True)
            return ""

    def get_todoist_client(self) -> TodoistClient:
        """Get Todoist client for current request context."""
        integration_id = self.get_integration_from_request()
        if not integration_id:
            raise Exception(
                "No integration ID found in request. Use ?integration_id=YOUR_ID or X-Integration-Id header"
            )

        integration = self.auth_service.get_integration(integration_id)
        if not integration:
            raise Exception(f"Integration '{integration_id}' not found")

        return TodoistClient(integration.todoist_token)

    def create_mcp_server(self) -> FastMCP:
        """Create the main MCP server with context-aware tools."""
        mcp = FastMCP(SERVER_NAME)

        @mcp.tool()
        def list_projects():
            """Get all Todoist projects."""
            todoist_client = self.get_todoist_client()
            return todoist_client.get_projects()

        @mcp.tool()
        def get_tasks(
            project_id: Optional[str] = Field(None, description="Filter by project ID"),
            filter_query: Optional[str] = Field(
                None, description="Todoist filter query"
            ),
            limit: int = Field(50, description="Maximum number of tasks", ge=1, le=100),
        ):
            """Get tasks from Todoist with optional filtering."""
            todoist_client = self.get_todoist_client()

            filter_parts = []
            if project_id:
                project = next(
                    (p for p in todoist_client.get_projects() if p["id"] == project_id),
                    None,
                )
                if project:
                    filter_parts.append(f"#{project['name']}")
            if filter_query:
                filter_parts.append(filter_query)

            final_filter = " & ".join(filter_parts) if filter_parts else None
            tasks = todoist_client.get_tasks(filter=final_filter)
            return tasks[:limit]

        @mcp.tool()
        def create_task(
            content: str = Field(..., description="Task content/title"),
            project_id: Optional[str] = Field(None, description="Project ID"),
            description: Optional[str] = Field(None, description="Task description"),
            labels: Optional[list[str]] = Field(
                None, description="List of label names"
            ),
            priority: int = Field(1, description="Priority (1-4)", ge=1, le=4),
            due_string: Optional[str] = Field(
                None, description="Due date in natural language"
            ),
        ):
            """Create a new task in Todoist."""
            todoist_client = self.get_todoist_client()
            return todoist_client.create_task(
                content=content,
                project_id=project_id,
                description=description,
                labels=labels,
                priority=priority,
                due_string=due_string,
            )

        @mcp.tool()
        def update_task(
            task_id: str = Field(..., description="ID of the task to update"),
            content: Optional[str] = Field(None, description="New task content/title"),
            description: Optional[str] = Field(
                None, description="New task description"
            ),
            labels: Optional[list[str]] = Field(
                None, description="New list of label names"
            ),
            priority: Optional[int] = Field(
                None, description="New priority (1-4)", ge=1, le=4
            ),
            due_string: Optional[str] = Field(None, description="New due date"),
        ):
            """Update an existing task."""
            todoist_client = self.get_todoist_client()
            success = todoist_client.update_task(
                task_id=task_id,
                content=content,
                description=description,
                labels=labels,
                priority=priority,
                due_string=due_string,
            )
            if not success:
                raise Exception(f"Failed to update task {task_id}")

            all_tasks = todoist_client.get_tasks()
            updated_task = next((t for t in all_tasks if t["id"] == task_id), None)
            return updated_task or {"message": f"Task {task_id} updated successfully"}

        @mcp.tool()
        def complete_task(
            task_id: str = Field(..., description="ID of the task to complete"),
        ):
            """Mark a task as completed."""
            todoist_client = self.get_todoist_client()
            success = todoist_client.complete_task(task_id)
            if success:
                return {"message": f"Task {task_id} marked as completed"}
            else:
                raise Exception(f"Failed to complete task {task_id}")

        @mcp.tool()
        def uncomplete_task(
            task_id: str = Field(..., description="ID of the task to uncomplete"),
        ):
            """Mark a completed task as active again."""
            todoist_client = self.get_todoist_client()
            success = todoist_client.uncomplete_task(task_id)
            if success:
                return {"message": f"Task {task_id} marked as active"}
            else:
                raise Exception(f"Failed to uncomplete task {task_id}")

        return mcp

    async def get_integration_url(self, integration_id: str) -> str:
        """Get MCP SSE URL for integration."""
        public_ip = await self.get_public_ip()
        return f"http://{public_ip}:8765/mcp/sse?integration_id={integration_id}"


# Global server
contextual_server = ContextualMCPServer()


# HTTP routes
async def home(request: Request) -> RedirectResponse:
    return RedirectResponse(url="/auth")


async def health_check(request: Request) -> JSONResponse:
    return JSONResponse(
        {"status": "healthy", "server": SERVER_NAME, "version": SERVER_VERSION}
    )


async def auth_page_handler(request: Request) -> HTMLResponse:
    return await request.app.state.auth_handlers.show_auth_page(request)


async def create_integration_handler(request: Request) -> JSONResponse:
    """Create integration."""
    try:
        data = await request.json()
        todoist_token = data.get("todoist_token", "").strip()

        if not todoist_token:
            return JSONResponse(
                {"error": "Todoist API token is required"}, status_code=400
            )

        # Create integration
        integration = contextual_server.auth_service.create_integration(
            todoist_token=todoist_token, user_agent=request.headers.get("user-agent")
        )

        # Get integration URL
        integration_url = await contextual_server.get_integration_url(
            integration.integration_id
        )

        return JSONResponse(
            {
                "success": True,
                "integration_id": integration.integration_id,
                "integration_url": integration_url,
                "created_at": integration.created_at.isoformat(),
            }
        )

    except Exception as e:
        logger.error(f"Failed to create integration: {e}")
        return JSONResponse(
            {"error": f"Failed to create integration: {str(e)}"}, status_code=500
        )


async def setup_app():
    """Setup the main application."""
    public_ip = await contextual_server.get_public_ip()
    base_url = os.getenv("BASE_URL", f"http://{public_ip}:8765")

    # Create auth routes
    auth_routes = [
        Route("/", home, methods=["GET"]),
        Route("/health", health_check, methods=["GET"]),
        Route("/auth", auth_page_handler, methods=["GET"]),
        Route("/auth/create", create_integration_handler, methods=["POST"]),
    ]

    # Create the single MCP app with SSE transport
    mcp_app = contextual_server.mcp.http_app(transport="sse")

    # Combine all routes
    app = Starlette(
        routes=[
            *auth_routes,
            Mount("/mcp", app=mcp_app),
        ]
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Add auth handlers to state
    app.state.auth_handlers = AuthHandlers(base_url=base_url)

    return app


async def main():
    """Main entry point."""
    logger.info(f"Starting {SERVER_NAME} v{SERVER_VERSION} with contextual routing")

    # Setup app
    app = await setup_app()

    # Run server
    config = uvicorn.Config(app, host="0.0.0.0", port=8765, log_level="info")
    server = uvicorn.Server(config)

    await server.serve()


if __name__ == "__main__":
    asyncio.run(main())
