#!/usr/bin/env node
/**
 * COPE Agent MCPB Server
 *
 * MCP Bundle compatible server that exposes cope-agent capabilities.
 * This server is designed to be packaged as an MCPB bundle for distribution.
 *
 * Tools exposed:
 * - discover_capability: Find the right specialist for a task
 * - spawn_specialist: Run a specialist subagent with domain-specific MCPs
 * - spawn_parallel: Run multiple specialists in parallel
 *
 * Security considerations:
 * - All credentials are passed via environment variables from MCPB config
 * - No credentials are stored in the bundle itself
 * - Tool execution has configurable timeouts
 * - Errors are sanitized before returning to prevent credential leakage
 *
 * IMPORTANT: This server must NOT output anything to stdout/stderr except
 * valid JSON-RPC messages. All logging is suppressed to avoid breaking
 * the MCP protocol communication.
 */

// CRITICAL: Suppress ALL console output before importing anything else
// MCP protocol requires clean stdio - any non-JSON-RPC output breaks it
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleDebug = console.debug;

// Completely silence console output - MCP uses stdio for protocol
console.log = () => {};
console.error = () => {};
console.warn = () => {};
console.debug = () => {};

import { config } from 'dotenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { discoverCapabilityTool } from './tools/discover.js';
import { spawnSpecialistTool, spawnParallelTool } from './tools/spawn.js';
import { loadCredentialsIntoEnv } from './config/index.js';

// Configuration
const SERVER_NAME = 'cope-agent';
const SERVER_VERSION = '0.1.0';
const DEFAULT_TIMEOUT_MS = 300000; // 5 minutes for specialist operations

// Logging is disabled in MCPB mode to keep stdio clean
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function log(_level: 'info' | 'debug' | 'error' | 'warn', _message: string, _data?: unknown): void {
  // Intentionally empty - MCP protocol requires clean stdio
  // All output would be interpreted as invalid JSON-RPC messages
}

/**
 * Sanitize error messages to prevent credential leakage
 */
function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // Remove potential credential patterns
  const sanitized = message
    .replace(/sk-[a-zA-Z0-9-_]{20,}/g, '[REDACTED_API_KEY]')
    .replace(/xoxb-[a-zA-Z0-9-]+/g, '[REDACTED_SLACK_TOKEN]')
    .replace(/Bearer\s+[a-zA-Z0-9-_.]+/g, 'Bearer [REDACTED]')
    .replace(/api[_-]?key[=:]\s*['"]?[a-zA-Z0-9-_]+['"]?/gi, 'api_key=[REDACTED]')
    .replace(/password[=:]\s*['"]?[^\s'"]+['"]?/gi, 'password=[REDACTED]');

  return sanitized;
}

/**
 * Execute a function with timeout
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Operation '${operationName}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Validate required environment for specialist operations
 */
function validateEnvironment(): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Check for Anthropic API credentials (required for specialists)
  const hasAnthropicKey = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  if (!hasAnthropicKey) {
    warnings.push('No Anthropic API key configured - specialist agents will not function');
  }

  return { valid: true, warnings };
}

/**
 * Initialize and start the MCP server
 */
async function main(): Promise<void> {
  log('info', `Starting ${SERVER_NAME} v${SERVER_VERSION}`);

  // Load credentials from user config directory first
  try {
    loadCredentialsIntoEnv();
    log('debug', 'Loaded credentials from config directory');
  } catch (error) {
    log('warn', 'Could not load credentials from config directory', sanitizeError(error));
  }

  // Then load local .env (for development override)
  config({ quiet: true });

  // Validate environment
  const envCheck = validateEnvironment();
  for (const warning of envCheck.warnings) {
    log('warn', warning);
  }

  // Create MCP server
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
    log('debug', 'Listing tools');

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
    const startTime = Date.now();

    log('info', `Executing tool: ${name}`);
    log('debug', `Tool arguments:`, args);

    try {
      let result: string;

      switch (name) {
        case 'discover_capability': {
          // Discovery is synchronous and fast - no timeout needed
          const discoverArgs = args as { query: string; mode?: string; target?: string };

          if (!discoverArgs.query) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Missing required parameter: query'
            );
          }

          result = discoverCapabilityTool.execute(discoverArgs);
          break;
        }

        case 'spawn_specialist': {
          const spawnArgs = args as { specialist: string; task: string; context?: string };

          if (!spawnArgs.specialist) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Missing required parameter: specialist'
            );
          }
          if (!spawnArgs.task) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Missing required parameter: task'
            );
          }

          // Specialist operations can take time - apply timeout
          result = await withTimeout(
            spawnSpecialistTool.execute(spawnArgs),
            DEFAULT_TIMEOUT_MS,
            `spawn_specialist:${spawnArgs.specialist}`
          );
          break;
        }

        case 'spawn_parallel': {
          const parallelArgs = args as {
            tasks: Array<{ specialist: string; task: string; context?: string }>;
          };

          if (!parallelArgs.tasks || !Array.isArray(parallelArgs.tasks)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Missing required parameter: tasks (must be an array)'
            );
          }

          if (parallelArgs.tasks.length === 0) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'tasks array must not be empty'
            );
          }

          // Validate each task
          for (let i = 0; i < parallelArgs.tasks.length; i++) {
            const task = parallelArgs.tasks[i];
            if (!task.specialist) {
              throw new McpError(
                ErrorCode.InvalidParams,
                `Task ${i}: missing required field 'specialist'`
              );
            }
            if (!task.task) {
              throw new McpError(
                ErrorCode.InvalidParams,
                `Task ${i}: missing required field 'task'`
              );
            }
          }

          // Parallel operations can take longer - apply extended timeout
          const parallelTimeout = DEFAULT_TIMEOUT_MS * Math.min(parallelArgs.tasks.length, 3);
          result = await withTimeout(
            spawnParallelTool.execute(parallelArgs),
            parallelTimeout,
            `spawn_parallel:${parallelArgs.tasks.length} tasks`
          );
          break;
        }

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name}`
          );
      }

      const duration = Date.now() - startTime;
      log('info', `Tool ${name} completed in ${duration}ms`);

      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const sanitizedMessage = sanitizeError(error);

      log('error', `Tool ${name} failed after ${duration}ms: ${sanitizedMessage}`);

      // Return structured error response
      if (error instanceof McpError) {
        throw error;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: sanitizedMessage,
              tool: name,
              duration_ms: duration,
            }),
          },
        ],
        isError: true,
      };
    }
  });

  // Handle graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    log('info', `Received ${signal}, shutting down gracefully...`);
    try {
      await server.close();
      log('info', 'Server closed successfully');
      process.exit(0);
    } catch (error) {
      log('error', 'Error during shutdown:', sanitizeError(error));
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    log('error', 'Uncaught exception:', sanitizeError(error));
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    log('error', 'Unhandled rejection:', sanitizeError(reason));
    // Don't exit - let the server continue
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Server started - no logging in MCPB mode
}

// Run server
main().catch((error) => {
  log('error', 'Fatal error during startup:', sanitizeError(error));
  process.exit(1);
});
