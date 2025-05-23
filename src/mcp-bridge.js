#!/usr/bin/env node

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
app.use(express.json());

// Your Todoist API base URL
const TODOIST_API_BASE = process.env.TODOIST_API_URL || 'http://localhost:3000';

// MCP Server metadata
const SERVER_INFO = {
  name: "todoist-mcp",
  version: "1.0.0",
  description: "MCP server for Todoist task management"
};

// OAuth configuration
const oauth = {
  issuer: "https://todoist.mcp.rosenpin.io",
  authorization_endpoint: "https://todoist.mcp.rosenpin.io/oauth/authorize",
  token_endpoint: "https://todoist.mcp.rosenpin.io/oauth/token",
  registration_endpoint: "https://todoist.mcp.rosenpin.io/register",
  token_endpoint_auth_methods_supported: ["none"],
  grant_types_supported: ["authorization_code"],
  response_types_supported: ["code"],
  code_challenge_methods_supported: ["S256"]
};

// Store registered clients
const clients = new Map();
const authCodes = new Map();

// Tool definitions
const TOOLS = [
  {
    name: "create_task",
    description: "Create a new task in Todoist",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The task content/title"
        },
        description: {
          type: "string",
          description: "Optional task description"
        },
        due_string: {
          type: "string",
          description: "Natural language due date like 'tomorrow', 'next Monday'"
        },
        priority: {
          type: "number",
          description: "Priority from 1 (normal) to 4 (urgent)",
          minimum: 1,
          maximum: 4
        }
      },
      required: ["content"]
    }
  },
  {
    name: "list_tasks",
    description: "Get a list of tasks from Todoist",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          description: "Filter like 'today', 'tomorrow', 'next week', 'overdue'"
        },
        priority: {
          type: "number",
          description: "Filter by priority (1-4)"
        },
        limit: {
          type: "number",
          description: "Maximum number of tasks to return",
          default: 10
        }
      }
    }
  },
  {
    name: "complete_task",
    description: "Mark a task as complete",
    inputSchema: {
      type: "object",
      properties: {
        task_name: {
          type: "string",
          description: "Name of the task to complete"
        }
      },
      required: ["task_name"]
    }
  },
  {
    name: "update_task",
    description: "Update an existing task",
    inputSchema: {
      type: "object",
      properties: {
        task_name: {
          type: "string",
          description: "Name of the task to update"
        },
        content: {
          type: "string",
          description: "New task content"
        },
        description: {
          type: "string",
          description: "New description"
        },
        due_string: {
          type: "string",
          description: "New due date"
        },
        priority: {
          type: "number",
          description: "New priority (1-4)"
        }
      },
      required: ["task_name"]
    }
  },
  {
    name: "delete_task",
    description: "Delete a task from Todoist",
    inputSchema: {
      type: "object",
      properties: {
        task_name: {
          type: "string",
          description: "Name of the task to delete"
        }
      },
      required: ["task_name"]
    }
  }
];

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// OAuth discovery endpoint
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.json(oauth);
});

// Client registration endpoint
app.post('/register', (req, res) => {
  const clientId = crypto.randomBytes(16).toString('hex');
  const client = {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none"
  };
  
  clients.set(clientId, client);
  console.log('Registered client:', clientId);
  res.json(client);
});

// OAuth authorization endpoint
app.get('/oauth/authorize', (req, res) => {
  const { client_id, redirect_uri, state, code_challenge } = req.query;
  const code = crypto.randomBytes(16).toString('hex');
  
  console.log('OAuth authorize request:', { client_id, redirect_uri, state });
  
  authCodes.set(code, { 
    client_id, 
    code_challenge,
    expires: Date.now() + 600000
  });
  
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.append('code', code);
  redirectUrl.searchParams.append('state', state);
  
  console.log('Redirecting to:', redirectUrl.toString());
  res.redirect(redirectUrl.toString());
});

// OAuth token endpoint
app.post('/oauth/token', (req, res) => {
  console.log('Token request:', req.body);
  
  const token = crypto.randomBytes(32).toString('hex');
  
  res.json({
    access_token: token,
    token_type: "Bearer",
    expires_in: 3600
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'todoist-mcp-bridge' });
});

// MCP HTTP endpoints
app.post('/mcp', handleMCPRequest);
app.post('/mcp/', handleMCPRequest);

app.get('/mcp', (req, res) => {
  // Return a JSON response that indicates this is an MCP server
  res.json({
    mcp_version: "0.1.0",
    server_info: SERVER_INFO,
    available_transports: ["websocket", "http"],
    websocket_url: "wss://todoist.mcp.rosenpin.io/mcp/ws",
    http_url: "https://todoist.mcp.rosenpin.io/mcp"
  });
});

app.get('/mcp/', (req, res) => {
  // Return same JSON response
  res.json({
    mcp_version: "0.1.0",
    server_info: SERVER_INFO,
    available_transports: ["websocket", "http"],
    websocket_url: "wss://todoist.mcp.rosenpin.io/mcp/ws",
    http_url: "https://todoist.mcp.rosenpin.io/mcp"
  });
});

// Handle MCP JSON-RPC requests
async function handleMCPRequest(req, res) {
  console.log('MCP request:', JSON.stringify(req.body, null, 2));
  
  try {
    const { method, params, id } = req.body;

    switch (method) {
      case 'initialize':
        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '0.1.0',
            serverInfo: SERVER_INFO,
            capabilities: {
              tools: {}
            }
          }
        });
        break;

      case 'tools/list':
        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            tools: TOOLS
          }
        });
        break;

      case 'tools/call':
        const result = await callTool(params.name, params.arguments);
        res.json({
          jsonrpc: '2.0',
          id,
          result
        });
        break;

      default:
        res.json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: 'Method not found'
          }
        });
    }
  } catch (error) {
    console.error('Error handling request:', error);
    res.json({
      jsonrpc: '2.0',
      id: req.body.id,
      error: {
        code: -32603,
        message: error.message
      }
    });
  }
}

// Tool implementation
async function callTool(toolName, args) {
  try {
    switch (toolName) {
      case 'create_task':
        const createResponse = await axios.post(`${TODOIST_API_BASE}/tasks`, args);
        return {
          content: [{
            type: 'text',
            text: `Task created: "${createResponse.data.task.content}" with ID ${createResponse.data.task.id}`
          }]
        };

      case 'list_tasks':
        const params = new URLSearchParams();
        if (args.filter) params.append('filter', args.filter);
        if (args.priority) params.append('priority', args.priority);
        if (args.limit) params.append('limit', args.limit);
        
        const listResponse = await axios.get(`${TODOIST_API_BASE}/tasks?${params}`);
        const tasks = listResponse.data.tasks;
        
        if (tasks.length === 0) {
          return {
            content: [{
              type: 'text',
              text: 'No tasks found matching the criteria.'
            }]
          };
        }
        
        const taskList = tasks.map(task => 
          `• ${task.content}${task.due ? ` (Due: ${task.due.string})` : ''}${task.priority > 1 ? ` [P${task.priority}]` : ''}`
        ).join('\n');
        
        return {
          content: [{
            type: 'text',
            text: `Found ${tasks.length} task(s):\n\n${taskList}`
          }]
        };

      case 'complete_task':
        const completeResponse = await axios.post(`${TODOIST_API_BASE}/tasks/complete`, args);
        return {
          content: [{
            type: 'text',
            text: completeResponse.data.message
          }]
        };

      case 'update_task':
        const updateResponse = await axios.put(`${TODOIST_API_BASE}/tasks/search`, args);
        return {
          content: [{
            type: 'text',
            text: `Task "${updateResponse.data.originalContent}" has been updated to "${updateResponse.data.task.content}"`
          }]
        };

      case 'delete_task':
        const deleteResponse = await axios.delete(`${TODOIST_API_BASE}/tasks/search`, {
          data: args
        });
        return {
          content: [{
            type: 'text',
            text: deleteResponse.data.message
          }]
        };

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error) {
    console.error(`Error calling tool ${toolName}:`, error.response?.data || error.message);
    return {
      content: [{
        type: 'text',
        text: `Error: ${error.response?.data?.message || error.message}`
      }],
      isError: true
    };
  }
}

// Create HTTP server
const server = http.createServer(app);

// Try to set up WebSocket if ws is available
try {
  const WebSocket = require('ws');
  const wss = new WebSocket.Server({ 
    server,
    path: '/mcp/ws'
  });

  wss.on('connection', (ws) => {
    console.log('WebSocket connection established');
    
    // Send initialization
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      method: 'initialized',
      params: { serverInfo: SERVER_INFO }
    }));

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('WebSocket message:', data);
        
        // Handle the message using the same logic as HTTP
        const response = await handleWebSocketMessage(data);
        ws.send(JSON.stringify(response));
      } catch (error) {
        console.error('WebSocket error:', error);
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32603,
            message: error.message
          }
        }));
      }
    });

    ws.on('close', () => {
      console.log('WebSocket connection closed');
    });
  });

  console.log('WebSocket support enabled');
} catch (e) {
  console.log('WebSocket support not available, using HTTP/SSE only');
}

async function handleWebSocketMessage(data) {
  const { method, params, id } = data;

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '0.1.0',
          serverInfo: SERVER_INFO,
          capabilities: {
            tools: {}
          }
        }
      };

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: TOOLS
        }
      };

    case 'tools/call':
      const result = await callTool(params.name, params.arguments);
      return {
        jsonrpc: '2.0',
        id,
        result
      };

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: 'Method not found'
        }
      };
  }
}

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Todoist MCP Bridge running on port ${PORT}`);
  console.log(`Connect Claude to: https://todoist.mcp.rosenpin.io/mcp`);
});
