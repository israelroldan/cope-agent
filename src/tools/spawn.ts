/**
 * Spawn Specialist Tool
 *
 * Custom tool that launches specialist subagents with their required
 * MCP servers. Each subagent gets fresh context with only the tools
 * it needs, runs an agentic loop, and returns the result.
 */

import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { getAgentDefinition } from '../agents/definitions.js';
import {
  connectToMcpServers,
  closeMcpConnections,
  mcpToolsToAnthropicTools,
  executeMcpToolCall,
  type McpConnection,
} from '../mcp/client.js';
import { getMcpServerConfig } from '../mcp/registry.js';
import { getAgentDebugClient } from '../debug/index.js';
import {
  getUtilityTools,
  utilityToolsToAnthropicTools,
  executeUtilityTool,
} from './utilities.js';
import {
  getSanityTools,
  sanityToolsToAnthropicTools,
  executeSanityTool,
} from '../sanity/tools.js';

// Debug client for specialist events
const debug = getAgentDebugClient();

/**
 * Create Anthropic client with support for:
 * - ANTHROPIC_API_KEY (standard)
 * - ANTHROPIC_AUTH_TOKEN (z.ai and other proxies - uses apiKey internally)
 * - ANTHROPIC_BASE_URL (custom endpoints)
 */
function createClient(): Anthropic {
  const options: { apiKey?: string; baseURL?: string } = {};

  // Support both env var names - both map to apiKey in the SDK
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  if (apiKey) {
    options.apiKey = apiKey;
  }

  if (process.env.ANTHROPIC_BASE_URL) {
    options.baseURL = process.env.ANTHROPIC_BASE_URL;
  }

  if (process.env.DEBUG) {
    console.log('[DEBUG] Creating spawn client with:', {
      apiKey: options.apiKey ? `${options.apiKey.substring(0, 10)}...` : 'NOT SET',
      baseURL: options.baseURL || 'default',
    });
  }

  return new Anthropic(options);
}

// Lazy-initialized client (created after dotenv loads)
let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = createClient();
  }
  return client;
}

export interface SpawnOptions {
  specialist: string;
  task: string;
  context?: string;
  timeout?: number;
  maxTurns?: number;
  /** Parent request ID for tree hierarchy in debug panel */
  parentRequestId?: string;
}

export interface SpawnResult {
  success: boolean;
  specialist: string;
  response?: string;
  error?: string;
  tokensUsed?: {
    input: number;
    output: number;
  };
  toolsUsed?: string[];
}

/**
 * Get the model ID for agent SDK based on model preference
 */
function getModelId(model: 'haiku' | 'sonnet' | 'opus'): string {
  switch (model) {
    case 'haiku':
      return 'claude-sonnet-4-20250514'; // Use sonnet as minimum for now
    case 'sonnet':
      return 'claude-sonnet-4-20250514';
    case 'opus':
      return 'claude-opus-4-20250514';
    default:
      return 'claude-sonnet-4-20250514';
  }
}

/**
 * Spawn a specialist subagent to handle a specific task
 *
 * This creates a fresh agent context with only the MCP servers
 * the specialist needs, runs an agentic loop with tool execution,
 * and returns the result.
 */
export async function spawnSpecialist(options: SpawnOptions): Promise<SpawnResult> {
  const { specialist, task, context, maxTurns: optionsMaxTurns, parentRequestId } = options;

  // Generate unique request ID for this specialist
  const requestId = randomUUID();

  // Debug: specialist spawn
  debug.specialistSpawn(requestId, parentRequestId || '', specialist, task);

  // Get agent definition
  const agentDef = getAgentDefinition(specialist);
  if (!agentDef) {
    debug.specialistError(requestId, specialist, `Unknown specialist: ${specialist}`);
    return {
      success: false,
      specialist,
      error: `Unknown specialist: ${specialist}. Available: email-agent, calendar-agent, slack-agent, lifeos-agent, notion-work-agent, lifelog-agent, school-agent, miro-agent, finance-agent, ics-sync-agent, cope-workflow-agent`,
    };
  }

  // Determine max turns: options override > agent config > default 10
  const maxTurns = optionsMaxTurns ?? agentDef.maxTurns ?? 10;

  // Build the prompt for the subagent
  const fullPrompt = context
    ? `Context from orchestrator:\n${context}\n\nTask:\n${task}`
    : task;

  let connections: McpConnection[] = [];
  const toolsUsed: string[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  try {
    // Connect to MCP servers for this specialist
    if (agentDef.mcpServers.length > 0) {
      if (process.env.DEBUG) {
        console.log(`[DEBUG] ${specialist}: Connecting to MCP servers: ${agentDef.mcpServers.join(', ')}`);
      }

      // Check if any servers have slow startup and notify user
      const slowServers = agentDef.mcpServers.filter(name => {
        const config = getMcpServerConfig(name);
        return config?.slowStartup;
      });
      if (slowServers.length > 0) {
        const serverNames = slowServers.map(name => {
          const config = getMcpServerConfig(name);
          return config?.displayName || name;
        }).join(', ');
        console.log(`  ⏳ Connecting to ${serverNames}...`);
      }

      connections = await connectToMcpServers(agentDef.mcpServers);

      if (connections.length === 0 && agentDef.mcpServers.length > 0) {
        // All required MCP servers failed - return graceful error
        return {
          success: false,
          specialist,
          error: `Unable to connect to required services (${agentDef.mcpServers.join(', ')}). Please check your configuration.`,
        };
      }
    }

    // Get tools from MCP servers
    const mcpTools = mcpToolsToAnthropicTools(connections);

    // Get utility tools if defined for this agent
    const agentUtilityTools = agentDef.utilityTools
      ? getUtilityTools(agentDef.utilityTools)
      : [];
    const utilityToolsForApi = utilityToolsToAnthropicTools(agentUtilityTools);

    // Get Sanity tools if defined for this agent
    const agentSanityTools = agentDef.sanityTools
      ? getSanityTools(agentDef.sanityTools)
      : [];
    const sanityToolsForApi = sanityToolsToAnthropicTools(agentSanityTools);

    // Combine all tools
    const tools = [...mcpTools, ...utilityToolsForApi, ...sanityToolsForApi];

    if (process.env.DEBUG) {
      console.log(`[DEBUG] ${specialist}: ${tools.length} tools available (${mcpTools.length} MCP, ${utilityToolsForApi.length} utility, ${sanityToolsForApi.length} sanity)`);
    }

    // Initialize conversation
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: fullPrompt,
      },
    ];

    // Agentic loop
    let turnCount = 0;

    while (turnCount < maxTurns) {
      turnCount++;

      // Debug: specialist turn
      debug.specialistTurn(requestId, specialist, turnCount, maxTurns);

      if (process.env.DEBUG) {
        console.log(`[DEBUG] ${specialist}: Turn ${turnCount}/${maxTurns}`);
      }

      // Make API call
      const response = await getClient().messages.create({
        model: getModelId(agentDef.model),
        max_tokens: 4096,
        system: agentDef.systemPrompt,
        tools: tools.length > 0 ? tools : undefined,
        messages,
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      // Check for tool use
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (toolUseBlocks.length === 0) {
        // No tool calls - extract final response
        const textBlock = response.content.find(
          (block): block is Anthropic.TextBlock => block.type === 'text'
        );
        const responseText = textBlock?.text || '';

        // Debug: specialist complete
        debug.specialistComplete(requestId, specialist, true, { input: totalInputTokens, output: totalOutputTokens });

        return {
          success: true,
          specialist,
          response: responseText,
          tokensUsed: {
            input: totalInputTokens,
            output: totalOutputTokens,
          },
          toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
        };
      }

      // Execute tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        // Debug: specialist tool call
        debug.specialistToolCall(requestId, specialist, toolUse.name, toolUse.input);

        if (process.env.DEBUG) {
          console.log(`[DEBUG] ${specialist}: Executing tool ${toolUse.name}`);
        }

        toolsUsed.push(toolUse.name);

        // Try utility tool first, then Sanity, then MCP
        let result = executeUtilityTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>
        );

        if (result === null) {
          // Not a utility tool, try Sanity
          result = await executeSanityTool(
            toolUse.name,
            toolUse.input as Record<string, unknown>
          );
        }

        if (result === null) {
          // Not a Sanity tool, try MCP
          result = await executeMcpToolCall(
            connections,
            toolUse.name,
            toolUse.input as Record<string, unknown>
          );
        }

        // Debug: specialist tool result
        debug.specialistToolResult(requestId, specialist, toolUse.name, result);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      // Add assistant message with tool use to conversation
      messages.push({
        role: 'assistant',
        content: response.content,
      });

      // Add tool results
      messages.push({
        role: 'user',
        content: toolResults,
      });
    }

    // Max turns reached
    debug.specialistError(requestId, specialist, `Max turns (${maxTurns}) reached without completion`);
    return {
      success: false,
      specialist,
      error: `Max turns (${maxTurns}) reached without completion`,
      tokensUsed: {
        input: totalInputTokens,
        output: totalOutputTokens,
      },
      toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
    };
  } catch (error) {
    // Format error message - hide stack traces unless DEBUG
    let errorMessage: string;
    if (error instanceof Error) {
      // Strip stack traces for cleaner output
      errorMessage = error.message;
      // Log full error only in debug mode
      if (process.env.DEBUG) {
        console.error(`[DEBUG] ${specialist} error:`, error);
      }
    } else {
      errorMessage = String(error);
    }

    // Debug: specialist error
    debug.specialistError(requestId, specialist, errorMessage);

    return {
      success: false,
      specialist,
      error: `Specialist unavailable: ${errorMessage}`,
      tokensUsed:
        totalInputTokens > 0 || totalOutputTokens > 0
          ? { input: totalInputTokens, output: totalOutputTokens }
          : undefined,
      toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
    };
  } finally {
    // Always close MCP connections
    if (connections.length > 0) {
      if (process.env.DEBUG) {
        console.log(`[DEBUG] ${specialist}: Closing ${connections.length} MCP connections`);
      }
      await closeMcpConnections(connections);
    }
  }
}

/**
 * Spawn multiple specialists in parallel
 *
 * Used for multi-domain operations like daily briefing
 * where we want to gather information from multiple sources
 * concurrently.
 */
export async function spawnParallel(
  tasks: Array<{ specialist: string; task: string; context?: string }>,
  parentRequestId?: string
): Promise<SpawnResult[]> {
  const promises = tasks.map(task =>
    spawnSpecialist({
      specialist: task.specialist,
      task: task.task,
      context: task.context,
      parentRequestId,
    })
  );

  return Promise.all(promises);
}

/**
 * Tool definition for the Agent SDK
 */
export const spawnSpecialistTool = {
  name: 'spawn_specialist',
  description: `Launch a specialist subagent to handle a domain-specific task.

Each specialist has access to specific MCP servers and domain knowledge.
The specialist executes the task using real MCP tools and returns results.

Available specialists:
- email-agent: Gmail/email operations (gmail-work MCP)
- calendar-agent: Calendar management (google-calendar-work, ical-home, magister MCPs)
- slack-agent: Slack workspace (slack-tatoma MCP)
- notion-work-agent: Work Notion workspace (notion-work MCP)
- lifelog-agent: Omi wearable memories (omi MCP)
- lifeos-agent: LifeOS tasks, goals, inbox, open loops (Sanity CMS)
- school-agent: School schedules (magister MCP)
- miro-agent: Miro boards (miro MCP)
- finance-agent: Financial coaching and YNAB budget management (ynab MCP)
- ics-sync-agent: ICS credit card sync to YNAB (playwright, ynab MCPs)
- cope-workflow-agent: Multi-domain workflows (spawns sub-specialists)

Use discover_capability first to find the right specialist for a task.`,

  input_schema: {
    type: 'object' as const,
    properties: {
      specialist: {
        type: 'string',
        description: 'Name of the specialist agent to spawn',
        enum: [
          'email-agent',
          'calendar-agent',
          'slack-agent',
          'notion-work-agent',
          'lifelog-agent',
          'lifeos-agent',
          'school-agent',
          'miro-agent',
          'finance-agent',
          'ics-sync-agent',
          'cope-workflow-agent',
        ],
      },
      task: {
        type: 'string',
        description: 'The task for the specialist to execute',
      },
      context: {
        type: 'string',
        description: 'Optional context to pass to the specialist (conversation history, previous results, etc.)',
      },
    },
    required: ['specialist', 'task'],
  },

  /**
   * Execute the spawn specialist tool
   */
  execute: async (input: { specialist: string; task: string; context?: string }): Promise<string> => {
    const result = await spawnSpecialist({
      specialist: input.specialist,
      task: input.task,
      context: input.context,
    });

    return JSON.stringify(result, null, 2);
  },
};

/**
 * Tool for parallel specialist spawning
 */
export const spawnParallelTool = {
  name: 'spawn_parallel',
  description: `Launch multiple specialists in parallel for multi-domain operations.

Use this for workflows that need data from multiple sources, like daily briefing:
- Spawn school-agent, calendar-agent, email-agent, slack-agent in parallel
- Aggregate results into unified response

More efficient than sequential spawning for independent tasks.`,

  input_schema: {
    type: 'object' as const,
    properties: {
      tasks: {
        type: 'array',
        description: 'Array of specialist tasks to run in parallel',
        items: {
          type: 'object',
          properties: {
            specialist: {
              type: 'string',
              description: 'Name of the specialist agent',
            },
            task: {
              type: 'string',
              description: 'Task for this specialist',
            },
            context: {
              type: 'string',
              description: 'Optional context for this specialist',
            },
          },
          required: ['specialist', 'task'],
        },
      },
    },
    required: ['tasks'],
  },

  execute: async (input: { tasks: Array<{ specialist: string; task: string; context?: string }> }): Promise<string> => {
    const results = await spawnParallel(input.tasks);
    return JSON.stringify(results, null, 2);
  },
};
