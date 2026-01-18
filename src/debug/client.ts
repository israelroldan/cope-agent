/**
 * Shared Debug Client
 *
 * Provides a resilient way to emit debug events to the HTTP server's
 * debug stream. Used by all entry points: HTTP server, stdio MCP server,
 * CLI agent, and specialist agents.
 */

import https from 'https';
import http from 'http';

/**
 * Event categories for different layers of the system
 */
export type DebugCategory =
  | 'mcp'        // MCP protocol layer (tools/list, tools/call)
  | 'orchestrator' // CopeAgent orchestrator
  | 'specialist'   // Specialist agent execution
  | 'tool'         // Tool execution (MCP tools inside specialists)
  | 'system';      // System events (startup, connection, etc.)

/**
 * Event types
 */
export type DebugEventType =
  | 'request'    // Incoming request / starting operation
  | 'response'   // Completed response / finished operation
  | 'session'    // Session lifecycle (start, end, connect)
  | 'error'      // Error occurred
  | 'turn'       // Agentic turn (for multi-turn loops)
  | 'spawn'      // Specialist spawn event
  | 'tool_call'  // Tool being called
  | 'tool_result'; // Tool result received

/**
 * Source identifier for where events originate
 */
export type DebugSource =
  | 'http'   // HTTP MCP server
  | 'stdio'  // Stdio MCP server
  | 'cli'    // Interactive CLI
  | 'agent'; // Internal agent (orchestrator or specialist)

export interface DebugEvent {
  timestamp: string;
  category: DebugCategory;
  type: DebugEventType;
  source: DebugSource;
  /** For specialist events, which specialist */
  specialist?: string;
  /** Session or request ID for correlation */
  sessionId?: string;
  /** Unique ID for this request/operation (for tree grouping) */
  requestId?: string;
  /** Parent request ID (for tree hierarchy) */
  parentRequestId?: string;
  /** Method or operation name */
  method?: string;
  /** Additional data */
  data?: unknown;
}

interface DebugClientOptions {
  /** Source identifier for events */
  source: DebugSource;
  /** Default category for events */
  defaultCategory?: DebugCategory;
  /** HTTP server port (default: 3847) */
  port?: number;
  /** Whether to also log to console (default: true for non-agent sources) */
  consoleLog?: boolean;
  /** Connection timeout in ms (default: 1000) */
  timeout?: number;
}

type BroadcastFn = (event: DebugEvent) => void;

/**
 * Debug client for emitting events to the debug stream
 */
export class DebugClient {
  private source: DebugSource;
  private defaultCategory: DebugCategory;
  private port: number;
  private consoleLog: boolean;
  private timeout: number;
  private directBroadcast: BroadcastFn | null = null;
  private isHttpServerAvailable: boolean | null = null;
  private lastCheckTime = 0;
  private checkInterval = 5000; // Re-check availability every 5 seconds

  constructor(options: DebugClientOptions) {
    this.source = options.source;
    this.defaultCategory = options.defaultCategory ?? 'system';
    this.port = options.port ?? 3847;
    // Only console log for MCP server sources by default
    this.consoleLog = options.consoleLog ?? (options.source === 'http' || options.source === 'stdio');
    this.timeout = options.timeout ?? 1000;
  }

  /**
   * Set a direct broadcast function (used by HTTP server to bypass network)
   */
  setDirectBroadcast(fn: BroadcastFn): void {
    this.directBroadcast = fn;
  }

  /**
   * Log and emit a debug event
   */
  log(
    type: DebugEventType,
    data: Partial<Omit<DebugEvent, 'timestamp' | 'type' | 'source'>> = {}
  ): void {
    const event: DebugEvent = {
      timestamp: new Date().toISOString(),
      category: data.category ?? this.defaultCategory,
      type,
      source: this.source,
      specialist: data.specialist,
      sessionId: data.sessionId,
      requestId: data.requestId,
      parentRequestId: data.parentRequestId,
      method: data.method,
      data: data.data,
    };

    // Console logging (condensed format)
    if (this.consoleLog) {
      const emoji = {
        request: '→',
        response: '←',
        session: '◉',
        error: '✗',
        turn: '↻',
        spawn: '⚡',
        tool_call: '⚙',
        tool_result: '✓',
      }[type];
      const prefix = `[${event.category}:${this.source}]`;
      const specialist = event.specialist ? `[${event.specialist}]` : '';
      const method = event.method || '';
      console.log(`[debug] ${prefix}${specialist} ${emoji} ${type}: ${method}`);
    }

    // Emit the event
    this.emit(event);
  }

  /**
   * Convenience methods for common event patterns
   */

  /** Log orchestrator starting to process a user message */
  orchestratorStart(requestId: string, message: string): void {
    this.log('request', {
      category: 'orchestrator',
      requestId,
      method: 'chat',
      data: {
        messageLength: message.length,
        message: message.length > 10000 ? message.substring(0, 10000) + '...[truncated]' : message,
      },
    });
  }

  /** Log orchestrator turn */
  orchestratorTurn(requestId: string, turn: number, maxTurns: number): void {
    this.log('turn', {
      category: 'orchestrator',
      requestId,
      method: 'chat',
      data: { turn, maxTurns },
    });
  }

  /** Log orchestrator tool call */
  orchestratorToolCall(requestId: string, toolName: string, input: unknown): void {
    this.log('tool_call', {
      category: 'orchestrator',
      requestId,
      method: toolName,
      data: { input },
    });
  }

  /** Log orchestrator tool result */
  orchestratorToolResult(requestId: string, toolName: string, result: string): void {
    this.log('tool_result', {
      category: 'orchestrator',
      requestId,
      method: toolName,
      data: {
        resultLength: result.length,
        result: result.length > 10000 ? result.substring(0, 10000) + '...[truncated]' : result,
      },
    });
  }

  /** Log orchestrator response complete */
  orchestratorComplete(requestId: string, response: string): void {
    this.log('response', {
      category: 'orchestrator',
      requestId,
      method: 'chat',
      data: {
        responseLength: response.length,
        response: response.length > 10000 ? response.substring(0, 10000) + '...[truncated]' : response,
      },
    });
  }

  /** Log specialist spawn */
  specialistSpawn(requestId: string, parentRequestId: string, specialist: string, task: string): void {
    this.log('spawn', {
      category: 'specialist',
      requestId,
      parentRequestId,
      specialist,
      method: 'spawn',
      data: {
        taskLength: task.length,
        task: task.length > 10000 ? task.substring(0, 10000) + '...[truncated]' : task,
      },
    });
  }

  /** Log specialist turn */
  specialistTurn(requestId: string, specialist: string, turn: number, maxTurns: number): void {
    this.log('turn', {
      category: 'specialist',
      requestId,
      specialist,
      method: 'turn',
      data: { turn, maxTurns },
    });
  }

  /** Log specialist MCP tool call */
  specialistToolCall(requestId: string, specialist: string, toolName: string, input: unknown): void {
    this.log('tool_call', {
      category: 'tool',
      requestId,
      specialist,
      method: toolName,
      data: { input },
    });
  }

  /** Log specialist MCP tool result */
  specialistToolResult(requestId: string, specialist: string, toolName: string, result: string): void {
    this.log('tool_result', {
      category: 'tool',
      requestId,
      specialist,
      method: toolName,
      data: {
        resultLength: result.length,
        result: result.length > 10000 ? result.substring(0, 10000) + '...[truncated]' : result,
      },
    });
  }

  /** Log specialist complete */
  specialistComplete(requestId: string, specialist: string, success: boolean, tokensUsed?: { input: number; output: number }): void {
    this.log('response', {
      category: 'specialist',
      requestId,
      specialist,
      method: 'complete',
      data: { success, tokensUsed },
    });
  }

  /** Log specialist error */
  specialistError(requestId: string, specialist: string, error: string): void {
    this.log('error', {
      category: 'specialist',
      requestId,
      specialist,
      method: 'error',
      data: { error },
    });
  }

  /** Log MCP connection */
  mcpConnect(serverName: string, toolCount: number): void {
    this.log('session', {
      category: 'tool',
      method: 'mcp_connect',
      data: { server: serverName, toolCount },
    });
  }

  /** Log MCP disconnection */
  mcpDisconnect(serverName: string): void {
    this.log('session', {
      category: 'tool',
      method: 'mcp_disconnect',
      data: { server: serverName },
    });
  }

  /**
   * Emit an event to the debug stream
   */
  private emit(event: DebugEvent): void {
    // If we have direct broadcast (HTTP server), use it
    if (this.directBroadcast) {
      this.directBroadcast(event);
      return;
    }

    // Otherwise, POST to the HTTP server (other sources)
    this.postToServer(event);
  }

  /**
   * POST event to HTTP server's debug endpoint
   * Resilient: fails silently if server is unavailable
   */
  private postToServer(event: DebugEvent): void {
    // Skip if we recently checked and server was unavailable
    const now = Date.now();
    if (this.isHttpServerAvailable === false && now - this.lastCheckTime < this.checkInterval) {
      return;
    }

    const postData = JSON.stringify(event);

    const options = {
      hostname: 'localhost',
      port: this.port,
      path: '/debug',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      rejectUnauthorized: false, // Allow self-signed certs
      timeout: this.timeout,
    };

    // Try HTTPS first, fall back to HTTP
    const makeRequest = (protocol: typeof https | typeof http) => {
      const req = protocol.request(options, (res) => {
        this.isHttpServerAvailable = res.statusCode === 200;
        this.lastCheckTime = now;
        // Consume response to free up resources
        res.resume();
      });

      req.on('error', () => {
        this.isHttpServerAvailable = false;
        this.lastCheckTime = now;
        // Fail silently - debug logging shouldn't break the app
      });

      req.on('timeout', () => {
        req.destroy();
        this.isHttpServerAvailable = false;
        this.lastCheckTime = now;
      });

      req.write(postData);
      req.end();
    };

    // Try HTTPS (default for cope-agent)
    makeRequest(https);
  }
}

// Singleton instances for different sources
let httpClient: DebugClient | null = null;
let stdioClient: DebugClient | null = null;
let agentClient: DebugClient | null = null;
let cliClient: DebugClient | null = null;

/**
 * Get or create the HTTP server debug client
 */
export function getHttpDebugClient(): DebugClient {
  if (!httpClient) {
    httpClient = new DebugClient({ source: 'http', defaultCategory: 'mcp' });
  }
  return httpClient;
}

/**
 * Get or create the stdio server debug client
 */
export function getStdioDebugClient(): DebugClient {
  if (!stdioClient) {
    stdioClient = new DebugClient({ source: 'stdio', defaultCategory: 'mcp' });
  }
  return stdioClient;
}

/**
 * Get or create the agent debug client (for orchestrator and specialists)
 */
export function getAgentDebugClient(): DebugClient {
  if (!agentClient) {
    agentClient = new DebugClient({
      source: 'agent',
      defaultCategory: 'orchestrator',
      consoleLog: false, // Don't double-log to console
    });
  }
  return agentClient;
}

/**
 * Get or create the CLI debug client
 */
export function getCliDebugClient(): DebugClient {
  if (!cliClient) {
    cliClient = new DebugClient({
      source: 'cli',
      defaultCategory: 'orchestrator',
      consoleLog: false,
    });
  }
  return cliClient;
}
