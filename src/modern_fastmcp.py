#!/usr/bin/env python3
"""Modern FastMCP server using http_app instead of deprecated sse_app."""

import os
import logging
import httpx
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator
from typing import Optional

from fastmcp import FastMCP
from pydantic import Field
from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, RedirectResponse
from starlette.routing import Route, Mount

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
    app.state.mcp_instances = {}

    logger.info(f"Started {SERVER_NAME} v{SERVER_VERSION} at {base_url}")
    yield
    logger.info("Shutting down...")


def create_mcp_for_integration(integration_id: str, todoist_token: str) -> FastMCP:
    """Create a FastMCP instance for a specific integration."""
    mcp = FastMCP(SERVER_NAME)
    
    # Create Todoist client for this integration
    todoist_client = TodoistClient(todoist_token)

    # Register tools with the MCP instance
    @mcp.tool()
    def list_projects():
        """Get all Todoist projects."""
        return todoist_client.get_projects()

    @mcp.tool()
    def get_tasks(
        project_id: Optional[str] = Field(None, description="Filter by project ID"),
        filter: Optional[str] = Field(None, description="Todoist filter query"),
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
        if filter:
            filter_parts.append(filter)

        final_filter = " & ".join(filter_parts) if filter_parts else None
        tasks = todoist_client.get_tasks(filter=final_filter)
        return tasks[:limit]

    @mcp.tool()
    def create_task(
        content: str = Field(..., description="Task content/title"),
        project_id: Optional[str] = Field(None, description="Project ID"),
        description: Optional[str] = Field(None, description="Task description"),
        labels: Optional[list[str]] = Field(None, description="List of label names"),
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
        description: Optional[str] = Field(None, description="New task description"),
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

        # Try to get the updated task
        all_tasks = todoist_client.get_tasks()
        updated_task = next((t for t in all_tasks if t["id"] == task_id), None)

        if updated_task:
            return updated_task
        else:
            return {"message": f"Task {task_id} updated successfully"}

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


# Regular web routes
async def home(request: Request) -> RedirectResponse:
    """Redirect to auth page."""
    return RedirectResponse(url="/auth")


async def health_check(request: Request) -> JSONResponse:
    """Health check endpoint."""
    return JSONResponse(
        {"status": "healthy", "server": SERVER_NAME, "version": SERVER_VERSION}
    )


async def auth_page_handler(request: Request) -> HTMLResponse:
    """Show authentication page."""
    return await request.app.state.auth_handlers.show_auth_page(request)


async def create_integration_handler(request: Request) -> JSONResponse:
    """Create new integration."""
    return await request.app.state.auth_handlers.create_integration(request)


# MCP handler that creates sub-apps per integration
async def get_mcp_app(integration_id: str, auth_service: AuthService, mcp_instances: dict):
    """Get or create MCP app for integration."""
    if integration_id in mcp_instances:
        return mcp_instances[integration_id]
    
    # Validate integration and get token
    todoist_token = auth_service.get_todoist_token(integration_id)
    if not todoist_token:
        return None
    
    # Create new MCP instance
    mcp = create_mcp_for_integration(integration_id, todoist_token)
    
    # Get the HTTP app (modern way, not deprecated SSE app)
    mcp_app = mcp.http_app
    
    mcp_instances[integration_id] = mcp_app
    return mcp_app


async def handle_mcp_request(request: Request):
    """Handle MCP requests for a specific integration."""
    # Extract integration ID from path
    integration_id = request.path_params.get("integration_id")
    if not integration_id:
        return JSONResponse({"error": "Missing integration ID"}, status_code=400)
    
    # Get MCP app for this integration
    mcp_app = await get_mcp_app(
        integration_id, 
        request.app.state.auth_service,
        request.app.state.mcp_instances
    )
    
    if not mcp_app:
        return JSONResponse({"error": "Invalid integration ID"}, status_code=401)
    
    # Forward request to MCP app
    return await mcp_app(request.scope, request.receive, request._send)


# Create main app
app = Starlette(
    lifespan=lifespan,
    routes=[
        Route("/", home, methods=["GET"]),
        Route("/health", health_check, methods=["GET"]),
        Route("/auth", auth_page_handler, methods=["GET"]),
        Route("/auth/create", create_integration_handler, methods=["POST"]),
        # Mount MCP app at /{integration_id}/*
        Route("/{integration_id:str}", handle_mcp_request, methods=["GET", "POST"]),
        Route("/{integration_id:str}/{path:path}", handle_mcp_request, methods=["GET", "POST"]),
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