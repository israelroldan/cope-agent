/**
 * COPE Orchestrator Agent
 *
 * The main agent that coordinates all operations. Starts with minimal
 * context and delegates to specialist subagents for domain-specific tasks.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getOrchestratorSystemPrompt, getTimeBasedPrompt } from './core/identity.js';
import { getCapabilitySummary } from './core/manifest.js';
import { discoverCapabilityTool } from './tools/discover.js';
import { spawnSpecialistTool, spawnParallelTool, spawnSpecialist, spawnParallel } from './tools/spawn.js';

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
    console.log('[DEBUG] Creating Anthropic client with:', {
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

export interface Message {
  role: 'user' | 'assistant';
  content: string | Anthropic.ContentBlock[] | Anthropic.ToolResultBlockParam[];
}

export interface AgentOptions {
  model?: string;
  maxTurns?: number;
  onThinking?: (text: string) => void;
  onResponse?: (text: string) => void;
  onToolUse?: (toolName: string, input: unknown) => void;
  onToolResult?: (toolName: string, result: string) => void;
}

/**
 * Build the full system prompt for the orchestrator
 */
function buildSystemPrompt(): string {
  const identity = getOrchestratorSystemPrompt();
  const capabilities = getCapabilitySummary();

  return `${identity}

${capabilities}

## Tool Usage

You have access to these custom tools:

### discover_capability
Query what capabilities are available for a domain. Use this first when
you receive a user request to find the right specialist.

### spawn_specialist
Launch a specialist subagent to handle a domain-specific task. Each
specialist has access to specific MCP servers.

### spawn_parallel
Launch multiple specialists in parallel for multi-domain operations
like daily briefing.

## Workflow

1. User makes a request
2. Use discover_capability to find matching domains/workflows
3. Spawn the appropriate specialist(s)
4. Aggregate results and respond to user

## Example Flow

User: "Check my email"
1. discover_capability("check my email") → email domain
2. spawn_specialist(email-agent, "Check inbox, summarize unread")
3. Format and return email digest

User: "What's on today?"
1. discover_capability("what's on today") → briefing workflow
2. spawn_parallel([school-agent, calendar-agent, email-agent, slack-agent])
3. Aggregate into daily briefing format`;
}

/**
 * Define the tools available to the orchestrator
 */
const orchestratorTools: Anthropic.Tool[] = [
  {
    name: 'discover_capability',
    description: discoverCapabilityTool.description,
    input_schema: discoverCapabilityTool.input_schema as Anthropic.Tool.InputSchema,
  },
  {
    name: 'spawn_specialist',
    description: spawnSpecialistTool.description,
    input_schema: spawnSpecialistTool.input_schema as Anthropic.Tool.InputSchema,
  },
  {
    name: 'spawn_parallel',
    description: spawnParallelTool.description,
    input_schema: spawnParallelTool.input_schema as Anthropic.Tool.InputSchema,
  },
];

/**
 * Execute a tool call
 */
async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<string> {
  switch (toolName) {
    case 'discover_capability':
      return discoverCapabilityTool.execute(toolInput as {
        query: string;
        mode?: string;
        target?: string;
      });

    case 'spawn_specialist':
      return await spawnSpecialistTool.execute(toolInput as {
        specialist: string;
        task: string;
        context?: string;
      });

    case 'spawn_parallel':
      return await spawnParallelTool.execute(toolInput as {
        tasks: Array<{ specialist: string; task: string; context?: string }>;
      });

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

/**
 * The COPE Orchestrator Agent
 *
 * Manages conversation with user and delegates to specialists.
 */
export class CopeAgent {
  private messages: Message[] = [];
  private systemPrompt: string;
  private options: AgentOptions;

  constructor(options: AgentOptions = {}) {
    this.options = {
      model: 'claude-sonnet-4-20250514',
      maxTurns: 10,
      ...options,
    };
    this.systemPrompt = buildSystemPrompt();
  }

  /**
   * Get the greeting message based on time of day
   */
  getGreeting(): string {
    const timePrompt = getTimeBasedPrompt();
    if (timePrompt) {
      return timePrompt;
    }
    return "How can I help?";
  }

  /**
   * Process a user message and return response
   */
  async chat(userMessage: string): Promise<string> {
    // Add user message to history
    this.messages.push({ role: 'user', content: userMessage });

    if (process.env.DEBUG) {
      console.log(`[DEBUG] chat() called, message count: ${this.messages.length}`);
    }

    let turnCount = 0;
    const maxTurns = this.options.maxTurns ?? 10;

    while (turnCount < maxTurns) {
      turnCount++;

      if (process.env.DEBUG) {
        console.log(`[DEBUG] Turn ${turnCount}/${maxTurns}, messages: ${this.messages.length}`);
      }

      // Build API messages from history
      const apiMessages: Anthropic.MessageParam[] = this.messages.map(m => ({
        role: m.role,
        content: m.content as Anthropic.MessageParam['content'],
      }));

      if (process.env.DEBUG) {
        console.log(`[DEBUG] API messages: ${JSON.stringify(apiMessages.map(m => ({ role: m.role, contentType: typeof m.content === 'string' ? 'string' : 'array' })))}`);
      }

      // Call the API
      const response = await getClient().messages.create({
        model: this.options.model ?? 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: this.systemPrompt,
        tools: orchestratorTools,
        messages: apiMessages,
      });

      // Check for tool use
      const toolUseBlocks = response.content.filter(
        block => block.type === 'tool_use'
      );

      if (toolUseBlocks.length === 0) {
        // No tool calls, extract final response
        const textBlock = response.content.find(block => block.type === 'text');
        const assistantMessage = textBlock?.type === 'text' ? textBlock.text : '';

        // Add to history (store full content for API compatibility)
        this.messages.push({ role: 'assistant', content: response.content });

        if (process.env.DEBUG) {
          console.log(`[DEBUG] No tool use, returning response. Total messages: ${this.messages.length}`);
        }

        return assistantMessage;
      }

      // Process tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        if (toolUse.type !== 'tool_use') continue;

        this.options.onToolUse?.(toolUse.name, toolUse.input);

        const result = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>
        );

        this.options.onToolResult?.(toolUse.name, result);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      // Add assistant message with tool use to history
      this.messages.push({
        role: 'assistant',
        content: response.content,
      });

      // Add tool results to history
      this.messages.push({
        role: 'user',
        content: toolResults,
      });
    }

    // Max turns reached
    return "I've reached the maximum number of steps for this request. Please try breaking it into smaller tasks.";
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.messages = [];
  }

  /**
   * Get current conversation history
   */
  getHistory(): Message[] {
    return [...this.messages];
  }

  /**
   * Get token count estimate for current context
   */
  estimateContextTokens(): number {
    // Rough estimate: ~4 chars per token
    const systemTokens = Math.ceil(this.systemPrompt.length / 4);
    const messageTokens = this.messages.reduce((sum, m) => {
      const contentStr = typeof m.content === 'string'
        ? m.content
        : JSON.stringify(m.content);
      return sum + Math.ceil(contentStr.length / 4);
    }, 0);
    return systemTokens + messageTokens;
  }
}

/**
 * Create a new COPE agent instance
 */
export function createCopeAgent(options: AgentOptions = {}): CopeAgent {
  return new CopeAgent(options);
}
