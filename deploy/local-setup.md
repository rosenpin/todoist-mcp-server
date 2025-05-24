# Local Deployment with Docker

Since MCP servers communicate via stdio (stdin/stdout) with Claude Desktop, they're typically run locally rather than on remote servers. Here's how to set up the Todoist MCP server locally using Docker.

## Quick Start

### 1. Build the Docker image

```bash
docker build -t todoist-mcp:latest .
```

### 2. Create a local data directory

```bash
mkdir -p ~/.todoist-mcp
```

### 3. Configure Claude Desktop

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**Linux**: `~/.config/claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "todoist": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-v", "${HOME}/.todoist-mcp:/root/.todoist-mcp",
        "todoist-mcp:latest"
      ]
    }
  }
}
```

### 4. First run

When you first use the Todoist tools in Claude, the container will prompt for your API token. The token will be saved in `~/.todoist-mcp/db.json` for future use.

## Advanced Setup

### Using environment variables

If you prefer to set the API token via environment variable:

1. Create a `.env` file:
```bash
echo "TODOIST_API_TOKEN=your_token_here" > ~/.todoist-mcp/.env
```

2. Update Claude config to include the env file:
```json
{
  "mcpServers": {
    "todoist": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-v", "${HOME}/.todoist-mcp:/root/.todoist-mcp",
        "--env-file", "${HOME}/.todoist-mcp/.env",
        "todoist-mcp:latest"
      ]
    }
  }
}
```

### Using docker-compose

1. Create `docker-compose.yml` in your project directory:
```yaml
version: '3.8'

services:
  todoist-mcp:
    build: .
    image: todoist-mcp:latest
    stdin_open: true
    tty: false
    volumes:
      - ${HOME}/.todoist-mcp:/root/.todoist-mcp
    env_file:
      - .env
```

2. Update Claude config:
```json
{
  "mcpServers": {
    "todoist": {
      "command": "docker-compose",
      "args": ["run", "--rm", "todoist-mcp"],
      "cwd": "/path/to/todoist-mcp-server"
    }
  }
}
```

## Troubleshooting

### Permission issues

If you encounter permission issues with the data directory:

```bash
# Fix ownership
sudo chown -R $(id -u):$(id -g) ~/.todoist-mcp
```

### Container not starting

Check Docker daemon is running:
```bash
docker ps
```

Test the container manually:
```bash
docker run --rm -it -v ~/.todoist-mcp:/root/.todoist-mcp todoist-mcp:latest
```

### Token not persisting

Ensure the volume mount is correct:
```bash
# Check if db.json exists
ls -la ~/.todoist-mcp/db.json

# Check volume mounts
docker inspect todoist-mcp | grep -A5 Mounts
```

## Development Setup

For development, you can mount the source code:

```json
{
  "mcpServers": {
    "todoist-dev": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-v", "${HOME}/.todoist-mcp:/root/.todoist-mcp",
        "-v", "/path/to/todoist-mcp-server/src:/app/src",
        "todoist-mcp:latest"
      ]
    }
  }
}
```

This allows you to edit the source code and see changes without rebuilding the image.