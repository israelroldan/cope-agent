#!/usr/bin/env node
/**
 * COPE Agent MCP Server
 *
 * Exposes cope-agent capabilities as an MCP server that Claude Code can connect to.
 * This provides dynamic context discovery without loading all MCP tools at startup.
 *
 * Tools exposed:
 * - discover_capability: Find the right specialist for a task
 * - spawn_specialist: Run a specialist subagent with domain-specific MCPs
 * - spawn_parallel: Run multiple specialists in parallel
 */

import { config } from 'dotenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { discoverCapabilityTool } from './tools/discover.js';
import { spawnSpecialistTool, spawnParallelTool } from './tools/spawn.js';
import { loadCredentialsIntoEnv } from './config/index.js';
import { getStdioDebugClient } from './debug/index.js';

// Initialize debug client (will POST to HTTP server if available)
const debug = getStdioDebugClient();

// Load credentials from ~/.config/cope-agent/.env first
loadCredentialsIntoEnv();

// Then load local .env (for development override)
config({ quiet: true });

// Create MCP server
const server = new Server(
  {
    name: 'cope-agent',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  debug.log('request', { method: 'tools/list' });
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
  ];
  debug.log('response', { method: 'tools/list', data: { count: tools.length } });
  return { tools };
});

// Register tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  debug.log('request', { method: 'tools/call', data: { tool: name, args } });

  try {
    let result: string;

    switch (name) {
      case 'discover_capability':
        result = discoverCapabilityTool.execute(args as {
          query: string;
          mode?: string;
          target?: string;
        });
        break;

      case 'spawn_specialist':
        result = await spawnSpecialistTool.execute(args as {
          specialist: string;
          task: string;
          context?: string;
        });
        break;

      case 'spawn_parallel':
        result = await spawnParallelTool.execute(args as {
          tasks: Array<{ specialist: string; task: string; context?: string }>;
        });
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    debug.log('response', { method: 'tools/call', data: { tool: name, resultLength: result.length } });

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    debug.log('error', { method: 'tools/call', data: { tool: name, error: message } });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: message }),
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is used for MCP protocol)
  console.error('COPE Agent MCP Server running on stdio');
  debug.log('session', { data: { message: 'stdio server started' } });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
