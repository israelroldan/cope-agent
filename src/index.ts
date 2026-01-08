#!/usr/bin/env node
/**
 * COPE Agent CLI
 *
 * Terminal interface for the COPE personal executive assistant.
 */

import { config } from 'dotenv';
import * as readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import { createCopeAgent } from './agent.js';
import { formatAllAuthStatus } from './auth/index.js';

// Load .env file from project root
config();

// Check for API key at startup
function checkApiKey(): void {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  const hasKey = apiKey || authToken;

  if (process.env.DEBUG) {
    console.log(chalk.gray('\n  [DEBUG] Environment variables:'));
    console.log(chalk.gray(`    ANTHROPIC_API_KEY:     ${apiKey ? `set (${apiKey.substring(0, 10)}...)` : 'not set'}`));
    console.log(chalk.gray(`    ANTHROPIC_AUTH_TOKEN:  ${authToken ? `set (${authToken.substring(0, 10)}...)` : 'not set'}`));
    console.log(chalk.gray(`    ANTHROPIC_BASE_URL:    ${baseUrl || 'not set'}`));
    console.log();
  }

  if (!hasKey) {
    console.error(chalk.red('\n  Error: No API key configured.\n'));
    console.error(chalk.yellow('  To fix this:\n'));
    console.error(chalk.gray('  1. Create a .env file (recommended):'));
    console.error(chalk.white('     cp .env.example .env'));
    console.error(chalk.white('     # Then edit .env with your credentials'));
    console.error();
    console.error(chalk.gray('  Supported variables:'));
    console.error(chalk.white('     ANTHROPIC_API_KEY     - Standard Anthropic API'));
    console.error(chalk.white('     ANTHROPIC_AUTH_TOKEN  - z.ai and other proxies'));
    console.error(chalk.white('     ANTHROPIC_BASE_URL    - Custom endpoint (optional)'));
    console.error();
    process.exit(1);
  }
}

// Colors
const colors = {
  cope: chalk.cyan,
  user: chalk.green,
  tool: chalk.yellow,
  error: chalk.red,
  dim: chalk.gray,
  success: chalk.green,
};

/**
 * Print the COPE banner
 */
function printBanner(): void {
  console.log();
  console.log(colors.cope.bold('  ┌─────────────────────────────────────────────┐'));
  console.log(colors.cope.bold('  │  COPE - Personal Executive Assistant        │'));
  console.log(colors.cope.bold('  │  Clarify · Organise · Prioritise · Execute  │'));
  console.log(colors.cope.bold('  └─────────────────────────────────────────────┘'));
  console.log();
}

/**
 * Format tool use output
 */
function formatToolUse(toolName: string, input: unknown): void {
  console.log(colors.tool(`  ⚙️  ${toolName}`));
  if (process.env.DEBUG) {
    console.log(colors.dim(`     ${JSON.stringify(input)}`));
  }
}

/**
 * Format tool result output
 */
function formatToolResult(toolName: string, result: string): void {
  if (process.env.DEBUG) {
    const truncated = result.length > 200
      ? result.substring(0, 200) + '...'
      : result;
    console.log(colors.dim(`     → ${truncated}`));
  }
}

/**
 * Main CLI loop
 */
async function main(): Promise<void> {
  checkApiKey();
  printBanner();

  // Create agent
  const agent = createCopeAgent({
    onToolUse: formatToolUse,
    onToolResult: formatToolResult,
  });

  // Print greeting
  console.log(colors.cope(`  ${agent.getGreeting()}`));
  console.log();
  console.log(colors.dim('  Commands: /quit, /clear, /status, /help'));
  console.log();

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const processInput = async (input: string): Promise<void> => {
    const trimmed = input.trim();

    if (!trimmed) {
      return;
    }

    // Handle commands
    if (trimmed.startsWith('/')) {
      await handleCommand(trimmed, agent);
      return;
    }

    // Process message
    const spinner = ora({
      text: 'Thinking...',
      prefixText: '  ',
      color: 'cyan',
      discardStdin: false, // Don't interfere with readline
    }).start();

    try {
      const response = await agent.chat(trimmed);
      spinner.stop();
      console.log();
      console.log(colors.cope('  cope →'), response.split('\n').join('\n         '));
      console.log();
    } catch (error) {
      spinner.stop();
      const message = error instanceof Error ? error.message : String(error);
      console.log(colors.error(`  Error: ${message}`));
      if (process.env.DEBUG) {
        console.error(error);
      }
      console.log();
    }
  };

  const prompt = (): void => {
    rl.question(colors.user('  you → '), (input) => {
      // Process input asynchronously but always call prompt() synchronously after
      processInput(input)
        .catch((error) => {
          console.error(colors.error('  Unexpected error:'), error);
        })
        .finally(() => {
          if (process.env.DEBUG) {
            console.log('[DEBUG] Calling prompt() for next input');
          }
          // Always call prompt() to keep the readline loop going
          prompt();
        });
    });
  };

  // Handle Ctrl+C
  rl.on('close', () => {
    console.log();
    console.log(colors.dim('  Goodbye!'));
    process.exit(0);
  });

  // Start prompt loop
  prompt();
}

/**
 * Handle CLI commands
 */
async function handleCommand(
  command: string,
  agent: ReturnType<typeof createCopeAgent>
): Promise<void> {
  const cmd = command.toLowerCase().trim();

  switch (cmd) {
    case '/quit':
    case '/exit':
    case '/q':
      console.log(colors.dim('  Goodbye!'));
      process.exit(0);

    case '/clear':
    case '/c':
      agent.clearHistory();
      console.log(colors.dim('  Conversation cleared.'));
      break;

    case '/status':
    case '/s':
      const tokens = agent.estimateContextTokens();
      const history = agent.getHistory();
      console.log(colors.dim(`  Messages: ${history.length}`));
      console.log(colors.dim(`  Est. tokens: ~${tokens}`));
      break;

    case '/mcp':
      console.log();
      console.log(formatAllAuthStatus());
      console.log();
      break;

    case '/help':
    case '/h':
    case '/?':
      console.log();
      console.log(colors.dim('  Commands:'));
      console.log(colors.dim('    /quit, /q     - Exit'));
      console.log(colors.dim('    /clear, /c    - Clear conversation'));
      console.log(colors.dim('    /status, /s   - Show status'));
      console.log(colors.dim('    /mcp          - Show MCP auth status'));
      console.log(colors.dim('    /help, /h     - Show this help'));
      console.log();
      console.log(colors.dim('  Quick commands:'));
      console.log(colors.dim('    briefing      - Daily briefing'));
      console.log(colors.dim('    inbox         - Check email'));
      console.log(colors.dim('    calendar      - Today\'s calendar'));
      console.log(colors.dim('    priorities    - Show priorities'));
      console.log();
      break;

    default:
      console.log(colors.dim(`  Unknown command: ${command}`));
      console.log(colors.dim('  Try /help for available commands.'));
  }
}

// Handle unhandled rejections (prevents silent exits)
process.on('unhandledRejection', (reason, promise) => {
  console.error(colors.error('  Unhandled rejection:'), reason);
  if (process.env.DEBUG) {
    console.error('  Promise:', promise);
  }
});

// Debug: catch unexpected exits
if (process.env.DEBUG) {
  process.on('exit', (code) => {
    console.log(`[DEBUG] Process exiting with code: ${code}`);
    console.log('[DEBUG] Stack trace:', new Error().stack);
  });
}

// Run CLI
main().catch(error => {
  console.error(colors.error('Fatal error:'), error);
  process.exit(1);
});
