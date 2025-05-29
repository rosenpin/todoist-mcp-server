"""Authentication handlers for the web interface."""

from pathlib import Path

from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse

from .auth_service import AuthService
from .config import SERVER_NAME

# Create templates directory
templates_dir = Path(__file__).parent / "templates"
templates_dir.mkdir(exist_ok=True)

# Simple HTML template inline (to avoid external dependencies)
AUTH_PAGE_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ server_name }} - Setup Integration</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #f5f5f5;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        .container {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            max-width: 500px;
            width: 100%;
        }
        h1 {
            color: #333;
            margin-bottom: 0.5rem;
        }
        .subtitle {
            color: #666;
            margin-bottom: 2rem;
        }
        .form-group {
            margin-bottom: 1.5rem;
        }
        label {
            display: block;
            margin-bottom: 0.5rem;
            color: #555;
            font-weight: 500;
        }
        input[type="password"] {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 1rem;
            box-sizing: border-box;
        }
        input[type="password"]:focus {
            outline: none;
            border-color: #4CAF50;
        }
        .help-text {
            font-size: 0.875rem;
            color: #666;
            margin-top: 0.5rem;
        }
        .help-text a {
            color: #4CAF50;
            text-decoration: none;
        }
        button {
            background-color: #4CAF50;
            color: white;
            padding: 0.75rem 1.5rem;
            border: none;
            border-radius: 4px;
            font-size: 1rem;
            cursor: pointer;
            width: 100%;
        }
        button:hover {
            background-color: #45a049;
        }
        button:disabled {
            background-color: #ccc;
            cursor: not-allowed;
        }
        .error {
            background-color: #fee;
            border: 1px solid #fcc;
            color: #c33;
            padding: 0.75rem;
            border-radius: 4px;
            margin-bottom: 1rem;
            display: none;
        }
        .success {
            background-color: #efe;
            border: 1px solid #cfc;
            color: #3c3;
            padding: 0.75rem;
            border-radius: 4px;
            margin-bottom: 1rem;
            display: none;
        }
        .integration-url {
            background-color: #f5f5f5;
            padding: 1rem;
            border-radius: 4px;
            word-break: break-all;
            font-family: monospace;
            font-size: 0.9rem;
            margin-top: 1rem;
            border: 1px solid #ddd;
        }
        .copy-button {
            background-color: #666;
            font-size: 0.875rem;
            padding: 0.5rem 1rem;
            margin-top: 0.5rem;
        }
        .copy-button:hover {
            background-color: #555;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>{{ server_name }}</h1>
        <p class="subtitle">Connect your Todoist account</p>

        <div id="error" class="error"></div>
        <div id="success" class="success"></div>

        <form id="authForm">
            <div class="form-group">
                <label for="todoist_token">Todoist API Token</label>
                <input type="password" id="todoist_token" name="todoist_token" required
                       placeholder="Enter your Todoist API token">
                <p class="help-text">
                    Get your API token from
                    <a href="https://todoist.com/prefs/integrations" target="_blank">
                        Todoist Settings → Integrations
                    </a>
                </p>
            </div>

            <button type="submit" id="submitBtn">Create Integration</button>
        </form>

        <div id="result" style="display: none;">
            <h2>Integration Created!</h2>
            <p>Copy this URL and add it as a remote MCP integration in Claude:</p>
            <div class="integration-url" id="integrationUrl"></div>
            <button class="copy-button" onclick="copyUrl()">Copy URL</button>
        </div>
    </div>

    <script>
        const form = document.getElementById('authForm');
        const errorDiv = document.getElementById('error');
        const successDiv = document.getElementById('success');
        const submitBtn = document.getElementById('submitBtn');
        const resultDiv = document.getElementById('result');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            errorDiv.style.display = 'none';
            successDiv.style.display = 'none';
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating...';

            const todoist_token = document.getElementById('todoist_token').value;

            try {
                const response = await fetch('/auth/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ todoist_token }),
                });

                const data = await response.json();

                if (response.ok) {
                    form.style.display = 'none';
                    resultDiv.style.display = 'block';
                    document.getElementById('integrationUrl').textContent = data.integration_url;
                } else {
                    errorDiv.textContent = data.error || 'Failed to create integration';
                    errorDiv.style.display = 'block';
                }
            } catch (error) {
                errorDiv.textContent = 'Network error. Please try again.';
                errorDiv.style.display = 'block';
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Create Integration';
            }
        });

        function copyUrl() {
            const urlText = document.getElementById('integrationUrl').textContent;
            navigator.clipboard.writeText(urlText).then(() => {
                successDiv.textContent = 'URL copied to clipboard!';
                successDiv.style.display = 'block';
            }).catch(() => {
                errorDiv.textContent = 'Failed to copy URL';
                errorDiv.style.display = 'block';
            });
        }
    </script>
</body>
</html>
"""


class AuthHandlers:
    """Handlers for authentication endpoints."""

    def __init__(self, base_url: str = "wss://localhost:8765"):
        self.auth_service = AuthService()
        self.base_url = base_url

    async def show_auth_page(self, request: Request) -> HTMLResponse:
        """Show the authentication page."""
        return HTMLResponse(
            content=AUTH_PAGE_TEMPLATE.replace("{{ server_name }}", SERVER_NAME)
        )

    async def create_integration(self, request: Request) -> JSONResponse:
        """Create a new integration with the provided Todoist token."""
        try:
            data = await request.json()
            todoist_token = data.get("todoist_token", "").strip()

            if not todoist_token:
                return JSONResponse(
                    {"error": "Todoist API token is required"}, status_code=400
                )

            # Get user agent for tracking
            user_agent = request.headers.get("user-agent")

            # Create integration
            integration = self.auth_service.create_integration(
                todoist_token=todoist_token, user_agent=user_agent
            )

            # Generate integration URL
            integration_url = f"{self.base_url}/mcp/{integration.integration_id}"

            return JSONResponse(
                {
                    "success": True,
                    "integration_id": integration.integration_id,
                    "integration_url": integration_url,
                    "created_at": integration.created_at.isoformat(),
                }
            )

        except Exception as e:
            return JSONResponse(
                {"error": f"Failed to create integration: {str(e)}"}, status_code=500
            )
