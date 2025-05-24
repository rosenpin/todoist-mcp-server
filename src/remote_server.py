#!/usr/bin/env python3
"""Remote MCP server implementation with WebSocket and HTTP support."""

import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from mcp.server.websocket import websocket_server
from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse, RedirectResponse
from starlette.routing import Route, WebSocketRoute
from starlette.websockets import WebSocket

from .config import SERVER_NAME, SERVER_VERSION
from .mcp_server import TodoistMCPServer
from .auth_handlers import AuthHandlers
from .auth_service import AuthService
from .todoist_client import TodoistClient

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: Starlette) -> AsyncGenerator[None, None]:
    """Application lifespan manager."""
    # Initialize services
    app.state.auth_service = AuthService()
    app.state.auth_handlers = AuthHandlers(
        base_url=os.getenv("BASE_URL", "wss://localhost:8765")
    )
    logger.info(f"Started {SERVER_NAME} v{SERVER_VERSION}")
    yield
    logger.info("Shutting down...")


async def home(request):
    """Redirect to auth page."""
    return RedirectResponse(url="/auth")


async def health_check(request):
    """Health check endpoint."""
    return JSONResponse(
        {"status": "healthy", "server": SERVER_NAME, "version": SERVER_VERSION}
    )


async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for MCP communication."""
    # Extract integration ID from path
    path_parts = websocket.url.path.strip("/").split("/")
    if len(path_parts) < 2 or path_parts[0] != "mcp":
        await websocket.close(code=4001, reason="Invalid path")
        return

    integration_id = path_parts[1]

    # Get auth service from app state
    auth_service = websocket.app.state.auth_service

    # Validate integration ID and get Todoist token
    todoist_token = auth_service.get_todoist_token(integration_id)
    if not todoist_token:
        await websocket.close(code=4002, reason="Invalid integration ID")
        return

    # Create MCP server instance with user's Todoist client
    mcp_server = TodoistMCPServer()
    # Pre-initialize the Todoist client with the user's token
    mcp_server.todoist_client = TodoistClient(todoist_token)

    logger.info(
        f"WebSocket connection established for integration: {integration_id[:8]}..."
    )

    # Use the MCP WebSocket server transport
    async with websocket_server(
        websocket.scope,
        websocket.receive,
        websocket.send,
    ) as transport:
        await transport.run(mcp_server.server)


# Create Starlette app
app = Starlette(
    lifespan=lifespan,
    routes=[
        Route("/", home, methods=["GET"]),
        Route("/health", health_check, methods=["GET"]),
        Route(
            "/auth",
            endpoint=lambda r: r.app.state.auth_handlers.show_auth_page(r),
            methods=["GET"],
        ),
        Route(
            "/auth/create",
            endpoint=lambda r: r.app.state.auth_handlers.create_integration(r),
            methods=["POST"],
        ),
        WebSocketRoute("/mcp/{integration_id}", websocket_endpoint),
    ],
)

# Add CORS middleware for browser-based clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure based on your security requirements
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8765,
        log_level="info",
    )
