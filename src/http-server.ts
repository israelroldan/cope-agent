#!/usr/bin/env node
/**
 * COPE Agent HTTPS MCP Server
 *
 * Runs cope-agent as a local HTTPS server that Claude Desktop can connect to
 * via mcp-remote. This allows full access to local MCP servers, OAuth flows,
 * and all specialist agents.
 *
 * Usage:
 *   npm run serve              # Start HTTPS on default port 3847
 *   PORT=8080 npm run serve    # Start on custom port
 *
 * Setup (first time):
 *   # Install mkcert and generate certificates
 *   brew install mkcert
 *   mkcert -install
 *   cd certs && mkcert localhost 127.0.0.1 ::1
 *
 * Connect from Claude Desktop:
 *   npx mcp-remote https://localhost:3847/mcp
 */

import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'http';
import { createServer as createHttpsServer } from 'https';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
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
import { setTimerTool, cancelTimerTool, executeUtilityTool } from './tools/utilities.js';
import { loadCredentialsIntoEnv } from './config/index.js';
import { getHttpDebugClient } from './debug/index.js';
import type { DebugEvent, DebugEventType } from './debug/index.js';

// ============================================================================
// Debug SSE Infrastructure
// ============================================================================

// Connected SSE debug clients
const debugClients = new Set<ServerResponse>();

// Initialize debug client with direct broadcast
const debugClient = getHttpDebugClient();
debugClient.setDirectBroadcast(broadcastDebug);

/**
 * Broadcast a debug event to all connected SSE clients
 */
function broadcastDebug(event: DebugEvent): void {
  if (debugClients.size === 0) return;

  const message = `data: ${JSON.stringify(event)}\n\n`;

  for (const client of debugClients) {
    try {
      client.write(message);
    } catch {
      debugClients.delete(client);
    }
  }
}

/**
 * Log and broadcast a debug event
 */
function debugLog(type: DebugEventType, data: Partial<Omit<DebugEvent, 'timestamp' | 'type' | 'source'>> = {}): void {
  debugClient.log(type, data);
}

// Get project root directory
// When running from dist/, go up one level to find project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Go up one level from either dist/ or src/ to get project root
const PROJECT_ROOT = join(__dirname, '..');

// Configuration
const SERVER_NAME = 'cope-agent';
const SERVER_VERSION = '0.1.0';
const DEFAULT_PORT = 3847;
const PORT = parseInt(process.env.PORT || String(DEFAULT_PORT), 10);

// Certificate paths
const CERT_DIR = join(PROJECT_ROOT, 'certs');
const CERT_FILE = join(CERT_DIR, 'localhost+2.pem');
const KEY_FILE = join(CERT_DIR, 'localhost+2-key.pem');

// Load credentials
loadCredentialsIntoEnv();
config({ quiet: true });

/**
 * Check if SSL certificates exist
 */
function hasSSLCertificates(): boolean {
  return existsSync(CERT_FILE) && existsSync(KEY_FILE);
}

/**
 * Load SSL certificates
 */
function loadSSLCertificates(): { cert: Buffer; key: Buffer } | null {
  if (!hasSSLCertificates()) {
    return null;
  }
  try {
    return {
      cert: readFileSync(CERT_FILE),
      key: readFileSync(KEY_FILE),
    };
  } catch (error) {
    console.error('Failed to load SSL certificates:', error);
    return null;
  }
}

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
    debugLog('request', { method: 'tools/list' });
    const tools = [
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
      {
        name: 'set_timer',
        description: setTimerTool.description,
        inputSchema: setTimerTool.input_schema,
      },
      {
        name: 'cancel_timer',
        description: cancelTimerTool.description,
        inputSchema: cancelTimerTool.input_schema,
      },
    ];
    debugLog('response', { method: 'tools/list', data: { count: tools.length } });
    return { tools };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    debugLog('request', { method: 'tools/call', data: { tool: name, args } });

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

        case 'set_timer':
        case 'cancel_timer': {
          const timerResult = await executeUtilityTool(name, args as Record<string, unknown>);
          result = timerResult ?? JSON.stringify({ error: 'Timer tool not found' });
          break;
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      debugLog('response', {
        method: 'tools/call',
        data: {
          tool: name,
          resultLength: result.length,
          result: result.length > 10000 ? result.substring(0, 10000) + '...[truncated]' : result,
        }
      });

      return {
        content: [{ type: 'text', text: result }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      debugLog('error', { method: 'tools/call', data: { tool: name, error: message } });
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

// Store servers by session ID (to keep them alive)
const servers = new Map<string, Server>();

// ============================================================================
// Timer State
// ============================================================================

interface TimerState {
  id: string;           // Unique timer ID
  endTime: number;      // Unix timestamp when timer ends
  label: string;        // What to display when timer expires
  durationMs: number;   // Original duration
  createdAt: number;    // When timer was created
}

// Store multiple timers by ID
const activeTimers = new Map<string, TimerState>();

// Timer persistence file path
const TIMERS_FILE = join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.config',
  'cope-agent',
  'timers.json'
);

// Generate a short unique ID
function generateTimerId(): string {
  return Math.random().toString(36).substring(2, 8);
}

/**
 * Save timers to persistent storage
 */
function saveTimers(): void {
  try {
    const timers = Array.from(activeTimers.values());
    const dir = dirname(TIMERS_FILE);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(TIMERS_FILE, JSON.stringify(timers, null, 2));
  } catch (error) {
    console.error('Failed to save timers:', error);
  }
}

/**
 * Load timers from persistent storage
 */
function loadTimers(): void {
  try {
    if (!existsSync(TIMERS_FILE)) return;

    const data = readFileSync(TIMERS_FILE, 'utf-8');
    const timers = JSON.parse(data) as TimerState[];
    const now = Date.now();

    // Only load timers that haven't expired
    for (const timer of timers) {
      if (timer.endTime > now) {
        activeTimers.set(timer.id, timer);
      }
    }

    // Clean up expired timers from file
    if (activeTimers.size !== timers.length) {
      saveTimers();
    }

    console.log(`Loaded ${activeTimers.size} active timer(s)`);
  } catch (error) {
    console.error('Failed to load timers:', error);
  }
}

/**
 * Read and parse request body
 */
async function parseRequestBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString();
        if (!body) {
          resolve(undefined);
          return;
        }
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Handle HTTP requests
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse, protocol: string): Promise<void> {
  const url = new URL(req.url || '/', `${protocol}://localhost:${PORT}`);

  // CORS headers for mcp-remote
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, Accept');
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
      protocol,
      endpoint: `${protocol}://localhost:${PORT}/mcp`,
      debug: `${protocol}://localhost:${PORT}/debug`,
    }));
    return;
  }

  // Timer endpoints - support multiple timers
  // GET /timer - list all timers
  // POST /timer - create new timer
  // DELETE /timer - cancel all timers
  // DELETE /timer/:id - cancel specific timer
  if (url.pathname === '/timer' || url.pathname.startsWith('/timer/')) {
    const timerId = url.pathname.startsWith('/timer/') ? url.pathname.slice(7) : null;

    // GET: Get all active timers
    if (req.method === 'GET') {
      const now = Date.now();
      const timers = Array.from(activeTimers.values())
        .map(t => ({
          id: t.id,
          label: t.label,
          endTime: t.endTime,
          durationMs: t.durationMs,
          remainingMs: Math.max(0, t.endTime - now),
          createdAt: t.createdAt,
        }))
        .sort((a, b) => a.endTime - b.endTime); // Sort by soonest first

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        count: timers.length,
        timers,
      }));
      return;
    }

    // POST: Create a new timer
    if (req.method === 'POST') {
      try {
        const body = await parseRequestBody(req) as {
          minutes?: number;
          seconds?: number;
          label: string;
        };

        if (!body || !body.label) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing required field: label' }));
          return;
        }

        // Calculate duration in milliseconds
        let durationMs = 0;
        if (body.minutes) {
          durationMs += body.minutes * 60 * 1000;
        }
        if (body.seconds) {
          durationMs += body.seconds * 1000;
        }

        if (durationMs <= 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Timer duration must be positive. Provide minutes and/or seconds.' }));
          return;
        }

        const now = Date.now();
        const id = generateTimerId();
        const timer: TimerState = {
          id,
          endTime: now + durationMs,
          label: body.label,
          durationMs,
          createdAt: now,
        };

        activeTimers.set(id, timer);
        saveTimers();
        debugLog('request', { method: 'timer/set', data: { id, label: body.label, durationMs } });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          timer: {
            id: timer.id,
            endTime: timer.endTime,
            label: timer.label,
            durationMs: timer.durationMs,
          },
        }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
      return;
    }

    // DELETE: Cancel timer(s)
    if (req.method === 'DELETE') {
      if (timerId) {
        // Cancel specific timer
        const timer = activeTimers.get(timerId);
        if (timer) {
          debugLog('request', { method: 'timer/cancel', data: { id: timerId, label: timer.label } });
          activeTimers.delete(timerId);
          saveTimers();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: `Timer '${timer.label}' cancelled`, id: timerId }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: `Timer not found: ${timerId}` }));
        }
      } else {
        // Cancel all timers
        const count = activeTimers.size;
        debugLog('request', { method: 'timer/cancel-all', data: { count } });
        activeTimers.clear();
        saveTimers();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: `Cancelled ${count} timer(s)`, count }));
      }
      return;
    }

    // Method not allowed for /timer
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed. Use GET, POST, or DELETE.' }));
    return;
  }

  // Debug endpoint - SSE stream (GET) and event ingestion (POST)
  if (url.pathname === '/debug') {
    // POST: Accept debug events from other processes (e.g., stdio MCP server, CLI, agents)
    if (req.method === 'POST') {
      try {
        const body = await parseRequestBody(req) as DebugEvent;
        if (body && body.type && body.timestamp && body.category && body.source) {
          broadcastDebug(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid debug event - requires type, timestamp, category, source' }));
        }
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
      return;
    }

    // GET: SSE stream for debug clients
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Send initial connection message
    res.write(`data: ${JSON.stringify({
      timestamp: new Date().toISOString(),
      category: 'system',
      type: 'session',
      source: 'http',
      data: { message: 'Debug stream connected', activeSessions: transports.size }
    })}\n\n`);

    debugClients.add(res);
    console.log(`[debug] Client connected (${debugClients.size} total)`);

    req.on('close', () => {
      debugClients.delete(res);
      console.log(`[debug] Client disconnected (${debugClients.size} remaining)`);
    });

    return;
  }

  // MCP endpoint
  if (url.pathname === '/mcp') {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Handle DELETE for session cleanup
    if (req.method === 'DELETE') {
      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        await transport.close();
        transports.delete(sessionId);
        servers.delete(sessionId);
        debugLog('session', { sessionId, data: { action: 'deleted' } });
        res.writeHead(200).end();
      } else {
        res.writeHead(404).end();
      }
      return;
    }

    // Handle GET for SSE stream (server-to-client notifications)
    if (req.method === 'GET') {
      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res);
      } else {
        // No session for GET without session ID - create one for standalone SSE
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });
        const server = createMcpServer();
        await server.connect(transport);

        if (transport.sessionId) {
          transports.set(transport.sessionId, transport);
          servers.set(transport.sessionId, server);
          debugLog('session', { sessionId: transport.sessionId, data: { action: 'created', type: 'sse' } });
        }

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) {
            transports.delete(sid);
            servers.delete(sid);
            debugLog('session', { sessionId: sid, data: { action: 'closed' } });
          }
        };

        await transport.handleRequest(req, res);
      }
      return;
    }

    // Handle POST requests (client-to-server messages)
    if (req.method === 'POST') {
      // Parse the request body first
      let body: unknown;
      try {
        body = await parseRequestBody(req);
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        return;
      }

      // Check if this is an existing session
      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res, body);
        return;
      }

      // New session (initialization request)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      const server = createMcpServer();
      await server.connect(transport);

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) {
          transports.delete(sid);
          servers.delete(sid);
          debugLog('session', { sessionId: sid, data: { action: 'closed' } });
        }
      };

      // Handle the initialization request with the parsed body
      await transport.handleRequest(req, res, body);

      // Store session AFTER handleRequest sets the sessionId
      if (transport.sessionId && !transports.has(transport.sessionId)) {
        transports.set(transport.sessionId, transport);
        servers.set(transport.sessionId, server);
        debugLog('session', { sessionId: transport.sessionId, data: { action: 'created', type: 'http' } });
      }
      return;
    }

    // Method not allowed
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // 404 for unknown paths
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

// Check for SSL certificates
const sslCerts = loadSSLCertificates();
const useHttps = sslCerts !== null;
const protocol = useHttps ? 'https' : 'http';

// Create server (HTTPS if certs available, HTTP otherwise)
const server = useHttps
  ? createHttpsServer(sslCerts!, (req, res) => {
      handleRequest(req, res, 'https').catch((error) => {
        console.error('Request error:', error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      });
    })
  : createHttpServer((req, res) => {
      handleRequest(req, res, 'http').catch((error) => {
        console.error('Request error:', error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      });
    });

// Load persisted timers before starting
loadTimers();

// Start server
server.listen(PORT, () => {
  const certStatus = useHttps
    ? '✅ SSL enabled (mkcert certificates)'
    : '⚠️  No SSL (run setup below for HTTPS)';

  console.log(`
┌─────────────────────────────────────────────────┐
│  COPE Agent MCP Server                          │
│  Clarify · Organise · Prioritise · Execute      │
└─────────────────────────────────────────────────┘

${certStatus}

Server running at: ${protocol}://localhost:${PORT}
MCP endpoint:      ${protocol}://localhost:${PORT}/mcp
Health check:      ${protocol}://localhost:${PORT}/health

To connect from Claude Desktop, add this to your MCP config:
{
  "mcpServers": {
    "cope-agent": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${protocol}://localhost:${PORT}/mcp"]
    }
  }
}
${!useHttps ? `
To enable HTTPS (recommended):
  cd ${CERT_DIR}
  mkcert -install
  mkcert localhost 127.0.0.1 ::1
  # Then restart this server
` : ''}
Press Ctrl+C to stop.
`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.close(() => {
    console.log('Server stopped.');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
