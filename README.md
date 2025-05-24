# Todoist MCP Server

A Model Context Protocol (MCP) server that integrates with Todoist for task management. Can be run locally or deployed as a remote integration for Claude.

## Features

- Create tasks with natural language due dates
- List tasks with filters (today, overdue, by priority)
- Complete tasks by name
- Update task details
- Delete tasks
- Secure API token storage using TinyDB

## Installation

### Using UV (recommended)

```bash
# Install uv if you haven't already
pip install uv

# Create virtual environment and install dependencies
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
uv pip install -e .
```

### Using pip

```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -e .
```

## Configuration

1. Create a `.env` file with your OAuth credentials (for future web auth):

```env
CLIENT_ID=your_client_id
CLIENT_SECRET=your_client_secret
VERIFICATION_TOKEN=your_verification_token
```

1. On first run, you'll be prompted to enter your Todoist API token. Get it from:
   <https://todoist.com/prefs/integrations>

The token will be securely stored in `~/.todoist-mcp/db.json`.

## Usage

### Option 1: Local MCP Server

Run locally for use with Claude Desktop:

```bash
python -m src
```

### Option 2: Remote MCP Integration

Deploy as a remote server for Claude to access over the internet:

```bash
python -m src.remote_server
```

See [REMOTE_INTEGRATION.md](REMOTE_INTEGRATION.md) for detailed deployment instructions.

### Using with Claude Desktop (Local)

Add to your Claude configuration file:

```json
{
  "mcpServers": {
    "todoist": {
      "command": "python",
      "args": ["-m", "src"],
      "cwd": "/path/to/todoist-mcp-server"
    }
  }
}
```

### Using Docker

```bash
# Build the image
docker build -t todoist-mcp .

# Run the container
docker run -it todoist-mcp
```

## Development

### Code formatting and linting

```bash
# Format code
ruff format src

# Lint code
ruff check src --fix

# Type checking
mypy src
```

## Available Tools

### create_task

Create a new task in Todoist

- `content` (required): Task title
- `description`: Task description
- `due_string`: Natural language due date
- `priority`: 1-4 (1=normal, 4=urgent)

### list_tasks

List tasks with optional filters

- `filter`: "today" or "overdue"
- `priority`: Filter by priority (1-4)
- `limit`: Maximum tasks to return

### complete_task

Mark a task as complete

- `task_name` (required): Name of task to complete

### update_task

Update an existing task

- `task_name` (required): Name of task to update
- `content`: New task title
- `description`: New description
- `due_string`: New due date
- `priority`: New priority

### delete_task

Delete a task

- `task_name` (required): Name of task to delete
