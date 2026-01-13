#!/usr/bin/env node
/**
 * COPE Agent HTTP MCP Server
 *
 * Runs cope-agent as a local HTTP server that Claude Desktop can connect to
 * via mcp-remote. This allows full access to local MCP servers, OAuth flows,
 * and all specialist agents.
 *
 * Usage:
 *   npm run http-server          # Start on default port 3847
 *   PORT=8080 npm run http-server # Start on custom port
 *
 * Connect from Claude Desktop:
 *   npx mcp-remote http://localhost:3847/mcp
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { config } from 'dotenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';

import { discoverCapabilityTool } from './tools/discover.js';
import { spawnSpecialistTool, spawnParallelTool } from './tools/spawn.js';
import { loadCredentialsIntoEnv } from './config/index.js';

// Configuration
const SERVER_NAME = 'cope-agent';
const SERVER_VERSION = '0.1.0';
const DEFAULT_PORT = 3847;
const PORT = parseInt(process.env.PORT || String(DEFAULT_PORT), 10);

// Load credentials
loadCredentialsIntoEnv();
config({ quiet: true });

/**
 * Create and configure the MCP server
 */
function createMcpServer(): Server {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'discover_capability',
          description: discoverCapabilityTool.description,
          inputSchema: discoverCapabilityTool.input_schema,
        },
        {
          name: 'spawn_specialist',
          description: spawnSpecialistTool.description,
          inputSchema: spawnSpecialistTool.input_schema,
        },
        {
          name: 'spawn_parallel',
          description: spawnParallelTool.description,
          inputSchema: spawnParallelTool.input_schema,
        },
      ],
    };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: string;

      switch (name) {
        case 'discover_capability': {
          const discoverArgs = args as { query: string; mode?: string; target?: string };
          result = discoverCapabilityTool.execute(discoverArgs);
          break;
        }

        case 'spawn_specialist': {
          const spawnArgs = args as { specialist: string; task: string; context?: string };
          result = await spawnSpecialistTool.execute(spawnArgs);
          break;
        }

        case 'spawn_parallel': {
          const parallelArgs = args as {
            tasks: Array<{ specialist: string; task: string; context?: string }>;
          };
          result = await spawnParallelTool.execute(parallelArgs);
          break;
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [{ type: 'text', text: result }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  });

  return server;
}

// Store transports by session ID
const transports = new Map<string, StreamableHTTPServerTransport>();

/**
 * Handle HTTP requests
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  // CORS headers for mcp-remote
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  // Health check endpoint
  if (url.pathname === '/health' || url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      server: SERVER_NAME,
      version: SERVER_VERSION,
      endpoint: `http://localhost:${PORT}/mcp`,
    }));
    return;
  }

  // MCP endpoint
  if (url.pathname === '/mcp') {
    // Get or create session
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (req.method === 'GET' || (req.method === 'POST' && !sessionId)) {
      // New session - create transport and server
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      const server = createMcpServer();

      // Store transport
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) {
          transports.delete(sid);
          console.log(`Session closed: ${sid}`);
        }
      };

      await server.connect(transport);

      // Store after connection to get session ID
      if (transport.sessionId) {
        transports.set(transport.sessionId, transport);
        console.log(`New session: ${transport.sessionId}`);
      }

      // Handle the request
      await transport.handleRequest(req, res);
      return;
    }

    // Existing session
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res);
      return;
    }

    // Invalid session
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  // 404 for unknown paths
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

// Create HTTP server
const httpServer = createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error('Request error:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`
┌─────────────────────────────────────────────────┐
│  COPE Agent HTTP MCP Server                     │
│  Clarify · Organise · Prioritise · Execute      │
└─────────────────────────────────────────────────┘

Server running at: http://localhost:${PORT}
MCP endpoint:      http://localhost:${PORT}/mcp
Health check:      http://localhost:${PORT}/health

To connect from Claude Desktop, add this to your MCP config:
{
  "mcpServers": {
    "cope-agent": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:${PORT}/mcp"]
    }
  }
}

Or use the MCPB bundle which is pre-configured to connect here.

Press Ctrl+C to stop.
`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  httpServer.close(() => {
    console.log('Server stopped.');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  httpServer.close(() => process.exit(0));
});
