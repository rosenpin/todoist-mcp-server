"""Multi-user authentication service for Todoist MCP integration."""

import hashlib
import secrets
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import parse_qs, urlparse

from pydantic import BaseModel
from tinydb import Query, TinyDB

from .config import DB_PATH


class Integration(BaseModel):
    """Integration model storing user tokens and metadata."""

    integration_id: str
    todoist_token: str
    created_at: datetime
    last_used: Optional[datetime] = None
    user_agent: Optional[str] = None


class AuthService:
    """Manages multi-user authentication and integration tokens."""

    def __init__(self) -> None:
        self.db = TinyDB(DB_PATH)
        self.integrations = self.db.table("integrations")

    def generate_integration_id(self) -> str:
        """Generate a unique, secure integration ID."""
        # Generate 32 bytes of random data for security
        random_bytes = secrets.token_bytes(32)
        # Create a hex digest for URL-safe usage
        integration_id = hashlib.sha256(random_bytes).hexdigest()[:32]
        return integration_id

    def create_integration(
        self, todoist_token: str, user_agent: Optional[str] = None
    ) -> Integration:
        """Create a new integration for a user's Todoist token."""
        integration_id = self.generate_integration_id()

        # Ensure uniqueness
        while self.get_integration(integration_id):
            integration_id = self.generate_integration_id()

        integration = Integration(
            integration_id=integration_id,
            todoist_token=todoist_token,
            created_at=datetime.now(timezone.utc),
            user_agent=user_agent,
        )

        # Store in database
        self.integrations.insert(integration.model_dump(mode="json"))

        return integration

    def get_integration(self, integration_id: str) -> Optional[Integration]:
        """Retrieve integration by ID."""
        Integration_q = Query()
        result = self.integrations.get(Integration_q.integration_id == integration_id)

        if result:
            # Update last used timestamp
            self.integrations.update(
                {"last_used": datetime.now(timezone.utc).isoformat()},
                Integration_q.integration_id == integration_id,
            )
            return Integration(**result)  # type: ignore[arg-type]

        return None

    def get_todoist_token(self, integration_id: str) -> Optional[str]:
        """Get Todoist token for a given integration ID."""
        integration = self.get_integration(integration_id)
        return integration.todoist_token if integration else None

    def extract_integration_id_from_url(self, url: str) -> Optional[str]:
        """Extract integration ID from WebSocket URL."""
        parsed = urlparse(url)

        # Check path for integration ID (e.g., /mcp/INTEGRATION_ID)
        path_parts = parsed.path.strip("/").split("/")
        if len(path_parts) >= 2 and path_parts[0] == "mcp":
            return path_parts[1]

        # Check query parameters (e.g., ?integration_id=INTEGRATION_ID)
        query_params = parse_qs(parsed.query)
        if "integration_id" in query_params:
            return query_params["integration_id"][0]

        return None

    def delete_integration(self, integration_id: str) -> bool:
        """Delete an integration."""
        Integration_q = Query()
        return bool(
            self.integrations.remove(Integration_q.integration_id == integration_id)
        )

    def list_integrations(self) -> list[Integration]:
        """List all integrations (for admin purposes)."""
        return [Integration(**doc) for doc in self.integrations.all()]
