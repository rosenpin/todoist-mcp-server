#!/usr/bin/env python3
"""Remote MCP server implementation with WebSocket and HTTP support."""

import asyncio
import json
import logging
import os
import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import httpx
from mcp.server.websocket import websocket_server
from sse_starlette import EventSourceResponse
from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, RedirectResponse
from starlette.routing import Route, WebSocketRoute
from starlette.websockets import WebSocket

from .auth_handlers import AuthHandlers
from .auth_service import AuthService
from .config import SERVER_NAME, SERVER_VERSION
from .mcp_server import TodoistMCPServer
from .todoist_client import TodoistClient

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

    logger.info(f"Started {SERVER_NAME} v{SERVER_VERSION} at {base_url}")
    yield
    logger.info("Shutting down...")


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
    return await request.app.state.auth_handlers.show_auth_page(request)  # type: ignore[no-any-return]


async def create_integration_handler(request: Request) -> JSONResponse:
    """Create new integration."""
    return await request.app.state.auth_handlers.create_integration(request)  # type: ignore[no-any-return]


async def mcp_message_handler(request: Request) -> JSONResponse:
    """Handle POST messages from MCP client over SSE transport."""
    integration_id = request.path_params.get("integration_id")
    if not integration_id:
        return JSONResponse({"error": "Missing integration ID"}, status_code=400)

    # Validate integration ID and get Todoist token
    auth_service = request.app.state.auth_service
    todoist_token = auth_service.get_todoist_token(integration_id)
    if not todoist_token:
        return JSONResponse({"error": "Invalid integration ID"}, status_code=401)

    # Get the session data for this integration
    if (
        not hasattr(request.app.state, "mcp_sessions")
        or integration_id not in request.app.state.mcp_sessions
    ):
        # Create a new session if it doesn't exist
        request.app.state.mcp_sessions = getattr(request.app.state, "mcp_sessions", {})
        # Create MCP server instance
        mcp_server = TodoistMCPServer()
        mcp_server.todoist_client = TodoistClient(todoist_token)
        request.app.state.mcp_sessions[integration_id] = {
            "server": mcp_server,
            "initialized": False,
        }

    session = request.app.state.mcp_sessions[integration_id]
    mcp_server = session["server"]

    try:
        # Get the JSON-RPC request from the body
        body = await request.json()
        logger.info(
            f"Received MCP request for {integration_id[:8]}: method={body.get('method', 'unknown')}, body={json.dumps(body)}"
        )

        # Handle the request based on method
        if body.get("method") == "initialize":
            # Handle initialize request
            result = {
                "protocolVersion": "1.0",
                "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
                "capabilities": {
                    "tools": {"listChanged": True},
                    "prompts": {},
                    "resources": {},
                },
            }
            session["initialized"] = True
            response = {"jsonrpc": "2.0", "id": body.get("id"), "result": result}
        elif body.get("method") == "tools/list":
            # List available tools - use the server's list_tools handler
            tools = []
            for handler in mcp_server.server.request_handlers.get("tools/list", []):
                tools = await handler.handler()
            response = {
                "jsonrpc": "2.0",
                "id": body.get("id"),
                "result": {"tools": [tool.model_dump() for tool in tools]},
            }
        elif body.get("method") == "tools/call":
            # Call a tool - use the server's call_tool handler
            params = body.get("params", {})
            try:
                text_contents = []
                for handler in mcp_server.server.request_handlers.get("tools/call", []):
                    text_contents = await handler.handler(
                        name=params.get("name"), arguments=params.get("arguments", {})
                    )
                response = {
                    "jsonrpc": "2.0",
                    "id": body.get("id"),
                    "result": {
                        "content": [
                            {"type": "text", "text": content.text}
                            for content in text_contents
                        ]
                    },
                }
            except Exception as tool_error:
                response = {
                    "jsonrpc": "2.0",
                    "id": body.get("id"),
                    "error": {"code": -32603, "message": str(tool_error)},
                }
        else:
            # Unknown method
            response = {
                "jsonrpc": "2.0",
                "id": body.get("id"),
                "error": {
                    "code": -32601,
                    "message": f"Method not found: {body.get('method')}",
                },
            }

        # Send response via SSE if available
        if (
            hasattr(request.app.state, "sse_queues")
            and integration_id in request.app.state.sse_queues
        ):
            await request.app.state.sse_queues[integration_id].put(response)

        # Also return it directly
        return JSONResponse(response)

    except Exception as e:
        logger.error(f"Error handling MCP message: {e}", exc_info=True)
        return JSONResponse(
            {
                "jsonrpc": "2.0",
                "id": body.get("id") if "body" in locals() else None,
                "error": {"code": -32603, "message": "Internal error", "data": str(e)},
            },
            status_code=500,
        )


async def sse_endpoint(request: Request):
    """SSE endpoint for MCP communication."""
    # Extract integration ID from path
    integration_id = request.path_params.get("integration_id")
    if not integration_id:
        return JSONResponse({"error": "Missing integration ID"}, status_code=400)

    # Get auth service from app state
    auth_service = request.app.state.auth_service

    # Validate integration ID and get Todoist token
    todoist_token = auth_service.get_todoist_token(integration_id)
    if not todoist_token:
        return JSONResponse({"error": "Invalid integration ID"}, status_code=401)

    # Initialize session if needed
    if not hasattr(request.app.state, "mcp_sessions"):
        request.app.state.mcp_sessions = {}

    if integration_id not in request.app.state.mcp_sessions:
        # Create MCP server instance with user's Todoist client
        mcp_server = TodoistMCPServer()
        mcp_server.todoist_client = TodoistClient(todoist_token)
        request.app.state.mcp_sessions[integration_id] = {
            "server": mcp_server,
            "initialized": False,
        }

    logger.info(f"SSE connection established for integration: {integration_id[:8]}...")

    # Create a queue for sending responses via SSE
    if not hasattr(request.app.state, "sse_queues"):
        request.app.state.sse_queues = {}
    response_queue = asyncio.Queue()
    request.app.state.sse_queues[integration_id] = response_queue

    async def event_generator():
        """Generate SSE events for MCP communication."""
        try:
            # Send initial endpoint configuration - this tells Claude where to POST messages
            yield {"event": "endpoint", "data": "/mcp/messages/" + integration_id}

            # Listen for responses to send via SSE
            ping_counter = 0
            while True:
                try:
                    # Check for messages with timeout to allow pings
                    response = await asyncio.wait_for(
                        response_queue.get(), timeout=30.0
                    )
                    # Send response via SSE
                    yield {"event": "message", "data": json.dumps(response)}
                except asyncio.TimeoutError:
                    # Send ping to keep connection alive
                    ping_counter += 1
                    yield {
                        "event": "ping",
                        "data": json.dumps(
                            {"timestamp": time.time(), "counter": ping_counter}
                        ),
                    }

        except asyncio.CancelledError:
            logger.info(f"SSE connection closed for integration: {integration_id[:8]}")
            # Clean up both queues and sessions
            if (
                hasattr(request.app.state, "sse_queues")
                and integration_id in request.app.state.sse_queues
            ):
                del request.app.state.sse_queues[integration_id]
            if (
                hasattr(request.app.state, "mcp_sessions")
                and integration_id in request.app.state.mcp_sessions
            ):
                del request.app.state.mcp_sessions[integration_id]
            raise
        except Exception as e:
            logger.error(f"Error in SSE event generator: {e}", exc_info=True)
            raise

    # Create EventSourceResponse with proper headers
    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",  # Disable Nginx buffering
    }
    return EventSourceResponse(event_generator(), headers=headers)


async def websocket_endpoint(websocket: WebSocket) -> None:
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
        Route("/auth", auth_page_handler, methods=["GET"]),
        Route("/auth/create", create_integration_handler, methods=["POST"]),
        Route("/sse/{integration_id}", sse_endpoint, methods=["GET"]),  # SSE for MCP
        Route(
            "/mcp/messages/{integration_id}", mcp_message_handler, methods=["POST"]
        ),  # POST endpoint for MCP messages
        WebSocketRoute(
            "/mcp/{integration_id}", websocket_endpoint
        ),  # Keep WebSocket for compatibility
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

    port = int(os.getenv("PORT", 8765))
    print(f"Starting server on port {port}...")

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info",
    )
