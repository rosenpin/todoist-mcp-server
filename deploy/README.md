# Remote MCP Server Deployment Guide

This guide covers deploying the Todoist MCP Server as a remote integration that can be accessed by Claude over the internet.

## Multi-User Support

This server supports multiple users with isolated Todoist accounts:

- Each user authenticates through a web interface
- Unique integration URLs are generated per user
- Todoist tokens are stored securely on the server
- Users can only access their own tasks

## Prerequisites

- Ubuntu/Debian server with Docker installed
- Domain name pointing to your server
- SSL certificate (can use Let's Encrypt)
- Root or sudo access

## Setup Steps

### 1. Create deployment directories

```bash
sudo mkdir -p /opt/todoist-mcp/data
sudo chown -R $USER:docker /opt/todoist-mcp
```

### 2. Copy environment file

Create `/opt/todoist-mcp/.env` with your credentials:

```bash
CLIENT_ID=your_client_id
CLIENT_SECRET=your_client_secret
VERIFICATION_TOKEN=your_verification_token
```

### 3. Build and push Docker image

On your local machine:

```bash
cd /path/to/todoist-mcp-server
docker build -t todoist-mcp:latest .

# If using a registry:
docker tag todoist-mcp:latest your-registry/todoist-mcp:latest
docker push your-registry/todoist-mcp:latest
```

### 4. Run the remote MCP server

The remote MCP server exposes a WebSocket endpoint at `/mcp` for Claude to connect to.

To run with Docker:

```bash
docker run -d \
  --name todoist-mcp \
  --restart unless-stopped \
  -p 8765:8765 \
  -v /opt/todoist-mcp/data:/root/.todoist-mcp \
  --env-file /opt/todoist-mcp/.env \
  todoist-mcp:latest \
  python -m src.remote_server
```

Or use the systemd service:

```bash
sudo cp todoist-mcp.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable todoist-mcp.service
```

### 5. Configure nginx

Install nginx if not already installed:

```bash
sudo apt update
sudo apt install nginx
```

Copy nginx configuration:

```bash
sudo cp nginx.conf /etc/nginx/sites-available/todoist-mcp
sudo ln -s /etc/nginx/sites-available/todoist-mcp /etc/nginx/sites-enabled/
```

Update the domain name in the configuration:

```bash
sudo sed -i 's/mcp.yourdomain.com/your-actual-domain.com/g' /etc/nginx/sites-available/todoist-mcp
```

### 6. Setup SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-actual-domain.com
```

### 7. Start services

```bash
# Start the MCP server
sudo systemctl start todoist-mcp

# Check status
sudo systemctl status todoist-mcp

# Reload nginx
sudo nginx -t
sudo systemctl reload nginx
```

## Management Commands

### View logs

```bash
# Service logs
sudo journalctl -u todoist-mcp -f

# Docker logs
docker logs todoist-mcp

# Nginx logs
sudo tail -f /var/log/nginx/todoist-mcp.access.log
sudo tail -f /var/log/nginx/todoist-mcp.error.log
```

### Restart service

```bash
sudo systemctl restart todoist-mcp
```

### Update deployment

```bash
# Pull new image
docker pull todoist-mcp:latest

# Restart service
sudo systemctl restart todoist-mcp
```

### Backup data

The TinyDB database is stored in `/opt/todoist-mcp/data/db.json`. To backup:

```bash
sudo cp /opt/todoist-mcp/data/db.json /path/to/backup/db-$(date +%Y%m%d).json
```

## Security Considerations

1. **Firewall**: Only expose ports 80 and 443

   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

2. **Docker security**: The service runs as the docker user, not root

3. **SSL/TLS**: Always use HTTPS in production

4. **API tokens**: Store securely in the TinyDB database

## Troubleshooting

### Service won't start

Check Docker is running:

```bash
sudo systemctl status docker
```

Check service logs:

```bash
sudo journalctl -u todoist-mcp -n 50
```

### Connection refused

Ensure the container is listening on the correct port:

```bash
docker ps
docker logs todoist-mcp
```

### SSL certificate issues

Renew certificate:

```bash
sudo certbot renew
```

## Alternative: Docker Compose

For a simpler setup, create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  todoist-mcp:
    image: todoist-mcp:latest
    container_name: todoist-mcp
    restart: unless-stopped
    ports:
      - "127.0.0.1:8765:8765"
    volumes:
      - /opt/todoist-mcp/data:/root/.todoist-mcp
      - /opt/todoist-mcp/.env:/app/.env:ro
    env_file:
      - /opt/todoist-mcp/.env

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - todoist-mcp
```

Then run:

```bash
docker-compose up -d
```
