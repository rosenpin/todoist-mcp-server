"""Authentication management module."""

from tinydb import Query, TinyDB

from config import DB_PATH


class AuthManager:
    """Manages Todoist API authentication."""

    def __init__(self) -> None:
        self.db = TinyDB(DB_PATH)
        self.tokens_table = self.db.table("tokens")

    def get_api_token(self) -> str:
        """Get stored API token or prompt for one."""
        Token = Query()
        result = self.tokens_table.get(Token.type == "todoist_api")

        if result:
            return str(result["token"])  # type: ignore

        # If no token stored, prompt user
        token = input("Please enter your Todoist API token: ").strip()
        if token:
            self.store_api_token(token)
            return token

        raise ValueError("No API token provided")

    def store_api_token(self, token: str) -> None:
        """Store API token in database."""
        Token = Query()
        self.tokens_table.upsert(
            {"type": "todoist_api", "token": token}, Token.type == "todoist_api"
        )

    def clear_token(self) -> None:
        """Clear stored token."""
        Token = Query()
        self.tokens_table.remove(Token.type == "todoist_api")
