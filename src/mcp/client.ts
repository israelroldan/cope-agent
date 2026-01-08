/**
 * MCP Client Module
 *
 * Connects to MCP servers and provides tools for specialist agents.
 * Supports stdio (docker, node, npx, uv), SSE, and HTTP transports.
 *
 * OAuth-based services (Notion, Miro) use mcp-remote which handles
 * browser-based authentication automatically.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import type Anthropic from '@anthropic-ai/sdk';
import { getMcpServerConfig, type McpServerConfig } from './registry.js';

export interface McpConnection {
  client: Client;
  transport: Transport;
  serverName: string;
  tools: McpTool[];
}

/**
 * Create a transport based on server configuration
 */
function createTransport(config: McpServerConfig): Transport {
  switch (config.type) {
    case 'docker':
    case 'node':
    case 'npx':
    case 'uv':
      // Stdio transport for command-based servers
      // Filter out undefined values from process.env
      const cleanEnv: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          cleanEnv[key] = value;
        }
      }

      // Build command - suppress stderr unless DEBUG mode
      let command = config.command!;
      let args = config.args || [];

      if (!process.env.DEBUG) {
        // Wrap in shell to redirect stderr to /dev/null
        // Quote each arg to handle special characters
        const quotedArgs = (config.args || []).map(arg => {
          // If arg contains spaces or special chars, quote it
          if (/[\s"'$`\\]/.test(arg)) {
            return `'${arg.replace(/'/g, "'\\''")}'`;
          }
          return arg;
        });
        const fullCmd = [config.command!, ...quotedArgs].join(' ');
        command = 'sh';
        args = ['-c', `${fullCmd} 2>/dev/null`];
      }

      return new StdioClientTransport({
        command,
        args,
        env: {
          ...cleanEnv,
          ...config.env,
        },
      });

    case 'sse':
      // SSE transport for Server-Sent Events servers
      return new SSEClientTransport(new URL(config.url!), {
        requestInit: {
          headers: config.headers,
        },
      });

    case 'http':
      // For HTTP/Streamable servers, we'll use SSE for now
      // (StreamableHTTPClientTransport requires more setup)
      return new SSEClientTransport(new URL(config.url!), {
        requestInit: {
          headers: config.headers,
        },
      });

    default:
      throw new Error(`Unsupported MCP server type: ${config.type}`);
  }
}

/**
 * Connect to an MCP server and return the connection
 */
export async function connectToMcpServer(serverName: string): Promise<McpConnection> {
  const config = getMcpServerConfig(serverName);
  if (!config) {
    throw new Error(`Unknown MCP server: ${serverName}`);
  }

  if (process.env.DEBUG) {
    console.log(`[DEBUG] Connecting to MCP server: ${serverName} (${config.type})`);
    if (config.env && Object.keys(config.env).length > 0) {
      const envKeys = Object.keys(config.env);
      const envStatus = envKeys.map(k => `${k}=${config.env![k] ? '✓' : '✗'}`).join(', ');
      console.log(`[DEBUG] Environment: ${envStatus}`);
    }
  }

  let transport: Transport;
  try {
    transport = createTransport(config);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new McpConnectionError(serverName, `Failed to create transport: ${msg}`);
  }

  const client = new Client(
    {
      name: 'cope-agent',
      version: '0.1.0',
    },
    {
      capabilities: {},
    }
  );

  // Connect to the server with timeout
  try {
    await client.connect(transport);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new McpConnectionError(serverName, `Connection failed: ${msg}`);
  }

  if (process.env.DEBUG) {
    console.log(`[DEBUG] Connected to ${serverName}`);
  }

  // List available tools
  let tools: McpTool[] = [];
  try {
    const toolsResult = await client.listTools();
    tools = toolsResult.tools;
  } catch (error) {
    // Clean up on failure
    try {
      await client.close();
    } catch {
      // Ignore close errors
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new McpConnectionError(serverName, `Failed to list tools: ${msg}`);
  }

  if (process.env.DEBUG) {
    console.log(`[DEBUG] ${serverName} provides ${tools.length} tools`);
  }

  return {
    client,
    transport,
    serverName,
    tools,
  };
}

/**
 * Custom error class for MCP connection failures
 * Provides user-friendly messages without stack traces in non-debug mode
 */
export class McpConnectionError extends Error {
  public readonly serverName: string;

  constructor(serverName: string, message: string) {
    super(`[${serverName}] ${message}`);
    this.serverName = serverName;
    this.name = 'McpConnectionError';
  }
}

/**
 * Connect to multiple MCP servers
 * Continues with other servers if one fails, collecting errors
 */
export async function connectToMcpServers(serverNames: string[]): Promise<McpConnection[]> {
  const connections: McpConnection[] = [];
  const failures: string[] = [];

  for (const serverName of serverNames) {
    try {
      const connection = await connectToMcpServer(serverName);
      connections.push(connection);
    } catch (error) {
      // Format error message for cleaner output
      if (error instanceof McpConnectionError) {
        failures.push(error.message);
        if (process.env.DEBUG) {
          console.error(`[DEBUG] MCP Error: ${error.message}`);
        }
      } else {
        const msg = error instanceof Error ? error.message : String(error);
        failures.push(`[${serverName}] ${msg}`);
        if (process.env.DEBUG) {
          console.error(`[DEBUG] MCP Error (${serverName}):`, error);
        }
      }
      // Continue with other servers
    }
  }

  // Log summary of failures (without stack traces) in non-debug mode
  if (failures.length > 0 && !process.env.DEBUG) {
    // Only show if some servers failed but we have at least one connection
    // Full failure will be handled by caller
    if (connections.length > 0) {
      console.warn(`  ⚠️  Some MCP servers unavailable: ${failures.length}/${serverNames.length}`);
    }
  }

  return connections;
}

/**
 * Close an MCP connection
 */
export async function closeMcpConnection(connection: McpConnection): Promise<void> {
  try {
    await connection.client.close();
    if (process.env.DEBUG) {
      console.log(`[DEBUG] Closed connection to ${connection.serverName}`);
    }
  } catch (error) {
    console.error(`Error closing ${connection.serverName}:`, error);
  }
}

/**
 * Close multiple MCP connections
 */
export async function closeMcpConnections(connections: McpConnection[]): Promise<void> {
  await Promise.all(connections.map(closeMcpConnection));
}

/**
 * Convert MCP tools to Anthropic tool format
 */
export function mcpToolsToAnthropicTools(connections: McpConnection[]): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = [];

  for (const connection of connections) {
    for (const mcpTool of connection.tools) {
      tools.push({
        name: `${connection.serverName}__${mcpTool.name}`,
        description: mcpTool.description || `Tool from ${connection.serverName}`,
        input_schema: (mcpTool.inputSchema || { type: 'object', properties: {} }) as Anthropic.Tool.InputSchema,
      });
    }
  }

  return tools;
}

/**
 * Execute a tool call on the appropriate MCP server
 */
export async function executeMcpToolCall(
  connections: McpConnection[],
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<string> {
  // Parse server name from tool name (format: serverName__toolName)
  const separatorIndex = toolName.indexOf('__');
  if (separatorIndex === -1) {
    return JSON.stringify({ error: `Invalid tool name format: ${toolName}` });
  }

  const serverName = toolName.substring(0, separatorIndex);
  const actualToolName = toolName.substring(separatorIndex + 2);

  // Find the connection
  const connection = connections.find(c => c.serverName === serverName);
  if (!connection) {
    return JSON.stringify({ error: `No connection to server: ${serverName}` });
  }

  try {
    if (process.env.DEBUG) {
      console.log(`[DEBUG] Executing ${actualToolName} on ${serverName}`);
    }

    const result = await connection.client.callTool({
      name: actualToolName,
      arguments: toolInput,
    });

    // Extract text content from result
    if (Array.isArray(result.content)) {
      const textContent = result.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map(c => c.text)
        .join('\n');
      return textContent || JSON.stringify(result);
    }

    return JSON.stringify(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Tool execution failed: ${errorMessage}` });
  }
}
