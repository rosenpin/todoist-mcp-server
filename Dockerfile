FROM python:3.13.3-slim

WORKDIR /app

# Install uv
RUN pip install uv

# Copy project files
COPY pyproject.toml ./
COPY README.md ./
COPY src ./src

# Create virtual environment and install dependencies
RUN uv venv && \
    . .venv/bin/activate && \
    uv pip install -e .

# Create directory for database
RUN mkdir -p /root/.todoist-mcp

# Expose port for FastMCP SSE server
EXPOSE 8765

# Set the virtual environment in PATH
ENV PATH="/app/.venv/bin:$PATH"

# Run the clean native FastMCP server
CMD ["python", "-m", "src.native_server"]