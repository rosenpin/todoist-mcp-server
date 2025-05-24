# Todoist Remote MCP Integration for Claude

This guide explains how to set up the Todoist MCP server as a remote integration for Claude.

## What is Remote MCP?

Remote MCP allows Claude to access your tools and data over the internet, rather than requiring local installation. Your MCP server runs on a remote server and Claude connects to it via WebSocket.

## Multi-User Architecture

This server supports multiple users, each with their own Todoist account:

1. Users visit the authentication page
2. They enter their Todoist API token
3. The server generates a unique integration URL
4. Each user's tasks are isolated and secure

## Setup Overview

1. Deploy the MCP server to a remote server
2. Configure HTTPS access with a domain
3. Add the integration URL to Claude

## Quick Start

### 1. Deploy to your server

```bash
# Clone the repository
git clone https://github.com/yourusername/todoist-mcp-server.git
cd todoist-mcp-server

# Build Docker image
docker build -t todoist-mcp:latest .

# Create data directory
mkdir -p /opt/todoist-mcp/data

# Create .env file with your server configuration
cat > /opt/todoist-mcp/.env << EOF
BASE_URL=wss://mcp-todoist.yourdomain.com
SERVER_PORT=8765
EOF

# Run the remote server
docker run -d \
  --name todoist-mcp \
  --restart unless-stopped \
  -p 8765:8765 \
  -v /opt/todoist-mcp/data:/root/.todoist-mcp \
  --env-file /opt/todoist-mcp/.env \
  todoist-mcp:latest \
  python -m src.remote_server
```

### 2. Set up HTTPS with nginx

```nginx
server {
    listen 443 ssl http2;
    server_name mcp-todoist.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/mcp-todoist.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp-todoist.yourdomain.com/privkey.pem;

    location /mcp {
        proxy_pass http://localhost:8765;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    location /health {
        proxy_pass http://localhost:8765/health;
    }
}
```

### 3. Create your integration

1. Visit `https://mcp-todoist.yourdomain.com/auth`
2. Enter your Todoist API token
3. Click "Create Integration"
4. Copy the generated integration URL

### 4. Add to Claude

1. Open Claude settings
2. Go to "Integrations" or "MCP Servers"
3. Add a new remote integration
4. Paste your unique integration URL

## Available Tools

Once connected, Claude can use these Todoist tools:

- **create_task** - Create new tasks with natural language due dates
- **list_tasks** - List tasks with filters (today, overdue, by priority)
- **complete_task** - Mark tasks as complete
- **update_task** - Update task details
- **delete_task** - Delete tasks

## Security Considerations

### Authentication

- Each user gets a unique integration ID that maps to their Todoist token
- Todoist tokens are stored securely in the server's database
- Integration IDs are cryptographically generated and unguessable
- Users can only access their own tasks

### HTTPS/WSS

Always use HTTPS/WSS in production to encrypt communication between Claude and your server.

### Firewall

Only expose the necessary ports:

- 443 for HTTPS/WSS
- 80 for HTTP (redirect to HTTPS)

## Monitoring

Check server health:

```bash
curl https://mcp-todoist.yourdomain.com/health
```

View logs:

```bash
docker logs -f todoist-mcp
```

## Troubleshooting

### Connection Issues

1. Check if the server is running:

   ```bash
   docker ps | grep todoist-mcp
   ```

2. Test WebSocket connection:

   ```bash
   wscat -c wss://mcp-todoist.yourdomain.com/mcp
   ```

3. Check nginx logs:

   ```bash
   tail -f /var/log/nginx/error.log
   ```

### API Token Issues

If you need to update your Todoist API token:

```bash
# Stop the container
docker stop todoist-mcp

# Remove the old database
rm /opt/todoist-mcp/data/db.json

# Update .env file
echo "TODOIST_API_TOKEN=new_token_here" > /opt/todoist-mcp/.env

# Restart
docker start todoist-mcp
```

## Development

For local development with hot reload:

```bash
# Install dependencies
uv venv
source .venv/bin/activate
uv pip install -e .

# Run the remote server locally
python -m src.remote_server
```

Then use `ws://localhost:8765/mcp` as your integration URL in Claude.

## Future Enhancements

- OAuth2 authentication flow
- User-specific task isolation
- Rate limiting
- Webhook support for real-time updates
- Additional Todoist features (projects, labels, filters)

## Support

For issues or questions:

- Create an issue on GitHub
- Check existing issues for solutions
- Review MCP documentation at <https://modelcontextprotocol.io>
