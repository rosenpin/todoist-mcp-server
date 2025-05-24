import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Database
DB_PATH = Path.home() / ".todoist-mcp" / "db.json"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# OAuth Config (for future use)
CLIENT_ID = os.getenv("CLIENT_ID")
CLIENT_SECRET = os.getenv("CLIENT_SECRET")
VERIFICATION_TOKEN = os.getenv("VERIFICATION_TOKEN")

# Server Config
SERVER_NAME = "todoist-mcp"
SERVER_VERSION = "1.0.0"
