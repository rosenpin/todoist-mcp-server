#!/usr/bin/env python3
"""FastMCP SSE server with proper integration routing."""

import asyncio
import logging
import os
from typing import Optional

import httpx
import uvicorn
from fastmcp import FastMCP
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


class TodoistMCPManager:
    """Manager for creating per-integration MCP servers."""

    def __init__(self):
        self.auth_service = AuthService()

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

    def create_mcp_server_for_integration(
        self, integration_id: str, todoist_token: str
    ) -> FastMCP:
        """Create FastMCP server for a specific integration."""
        mcp = FastMCP(f"{SERVER_NAME}-{integration_id[:8]}")
        todoist_client = TodoistClient(todoist_token)

        @mcp.tool()
        def list_projects():
            """Get all Todoist projects."""
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
            success = todoist_client.uncomplete_task(task_id)
            if success:
                return {"message": f"Task {task_id} marked as active"}
            else:
                raise Exception(f"Failed to uncomplete task {task_id}")

        return mcp

    async def get_integration_url(self, integration_id: str) -> str:
        """Get SSE URL for integration."""
        public_ip = await self.get_public_ip()
        return f"http://{public_ip}:8765/{integration_id}/sse"


# Global manager
mcp_manager = TodoistMCPManager()


# HTTP routes for auth and management
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
        integration = mcp_manager.auth_service.create_integration(
            todoist_token=todoist_token, user_agent=request.headers.get("user-agent")
        )

        # Get integration URL
        integration_url = await mcp_manager.get_integration_url(
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


# Create mount function for each integration
def create_integration_mount(integration_id: str, todoist_token: str):
    """Create a FastMCP app mounted at /{integration_id}/."""
    mcp_server = mcp_manager.create_mcp_server_for_integration(
        integration_id, todoist_token
    )
    return mcp_server.http_app(transport="sse", path="/sse")


# Main HTTP app for auth/management
async def setup_auth_app():
    """Setup the auth HTTP app."""
    public_ip = await mcp_manager.get_public_ip()
    base_url = os.getenv("BASE_URL", f"http://{public_ip}:8765")

    app = Starlette(
        routes=[
            Route("/", home, methods=["GET"]),
            Route("/health", health_check, methods=["GET"]),
            Route("/auth", auth_page_handler, methods=["GET"]),
            Route("/auth/create", create_integration_handler, methods=["POST"]),
        ],
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


# Combined app with integration mounts
async def setup_combined_app():
    """Setup combined app with dynamic integration mounting."""
    auth_app = await setup_auth_app()

    # Get all existing integrations and mount them
    integrations = mcp_manager.auth_service.get_all_integrations()

    routes = auth_app.routes.copy()

    for integration in integrations:
        integration_app = create_integration_mount(
            integration.integration_id, integration.todoist_token
        )
        mount = Mount(f"/{integration.integration_id}", app=integration_app)
        routes.append(mount)
        logger.info(f"Mounted FastMCP for integration {integration.integration_id[:8]}")

    # Create new app with all routes
    combined_app = Starlette(routes=routes)

    # Copy middleware and state
    combined_app.middleware_stack = auth_app.middleware_stack
    combined_app.state = auth_app.state

    return combined_app


async def main():
    """Main entry point."""
    logger.info(f"Starting {SERVER_NAME} v{SERVER_VERSION} with FastMCP SSE support")

    # Setup combined app with existing integrations
    app = await setup_combined_app()

    # Run server
    config = uvicorn.Config(app, host="0.0.0.0", port=8765, log_level="info")
    server = uvicorn.Server(config)

    await server.serve()


if __name__ == "__main__":
    asyncio.run(main())
