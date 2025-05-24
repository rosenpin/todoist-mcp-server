FROM python:3.11-slim

WORKDIR /app

# Install uv
RUN pip install uv

# Copy project files
COPY pyproject.toml ./
COPY src ./src

# Create virtual environment and install dependencies
RUN uv venv && \
    . .venv/bin/activate && \
    uv pip install -e .

# Create directory for database
RUN mkdir -p /root/.todoist-mcp

# Expose port for WebSocket server (if needed in future)
EXPOSE 8765

# Default to running local stdio server
# Override with: docker run ... python -m src.remote_server
CMD [".venv/bin/python", "-m", "src"]