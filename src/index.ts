#!/usr/bin/env node
/**
 * COPE Agent CLI
 *
 * Terminal interface for the COPE personal executive assistant.
 */

import { config } from 'dotenv';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { createCopeAgent } from './agent.js';
import { formatAllAuthStatus, clearAuthTokens, listReauthServices, MCP_AUTH_INFO } from './auth/index.js';
import {
  listCredentials,
  setCredential,
  deleteCredential,
  getConfigDir,
  loadCredentialsIntoEnv,
} from './config/index.js';

// CLI commands for tab completion
const CLI_COMMANDS = [
  '/quit', '/exit', '/q',
  '/clear', '/c',
  '/status', '/s',
  '/mcp', '/mcp auth',
  '/credentials', '/credentials list', '/credentials set', '/credentials delete',
  '/help', '/h', '/?',
];

// Quick commands (natural language triggers)
const QUICK_COMMANDS = [
  'briefing', 'daily briefing',
  'inbox', 'check email', 'email',
  'calendar', "what's on today",
  'priorities', 'tasks',
  'slack', 'messages',
];

/**
 * Get the history file path
 */
function getHistoryFilePath(): string {
  return path.join(getConfigDir(), '.cope_history');
}

/**
 * Load command history from file
 */
function loadHistory(): string[] {
  const historyFile = getHistoryFilePath();
  try {
    if (fs.existsSync(historyFile)) {
      const content = fs.readFileSync(historyFile, 'utf-8');
      return content.split('\n').filter(Boolean).reverse(); // Most recent first
    }
  } catch (error) {
    if (process.env.DEBUG) {
      console.error(chalk.gray(`  [DEBUG] Failed to load history: ${error}`));
    }
  }
  return [];
}

/**
 * Save command history to file
 */
function saveHistory(history: string[]): void {
  const historyFile = getHistoryFilePath();
  try {
    // Limit history to 500 entries, most recent last in file
    const toSave = history.slice(0, 500).reverse();
    fs.writeFileSync(historyFile, toSave.join('\n') + '\n', 'utf-8');
  } catch (error) {
    if (process.env.DEBUG) {
      console.error(chalk.gray(`  [DEBUG] Failed to save history: ${error}`));
    }
  }
}

/**
 * Find longest common prefix among strings
 */
function longestCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return '';
  if (strings.length === 1) return strings[0];

  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (prefix === '') return '';
    }
  }
  return prefix;
}

/**
 * Tab completion function (bash-like behavior)
 * - Single match: complete it fully
 * - Multiple matches: complete to longest common prefix
 * - Only show list when already at the prefix (second Tab)
 */
function completer(line: string): [string[], string] {
  const trimmed = line.trimStart();

  let candidates: string[] = [];

  // Complete commands starting with /
  if (trimmed.startsWith('/')) {
    candidates = CLI_COMMANDS.filter(cmd => cmd.startsWith(trimmed));
  } else if (trimmed.length > 0) {
    // Complete quick commands
    candidates = QUICK_COMMANDS.filter(cmd => cmd.startsWith(trimmed.toLowerCase()));
  }

  if (candidates.length === 0) {
    return [[], line];
  }

  if (candidates.length === 1) {
    // Single match - complete it with trailing space
    return [[candidates[0] + ' '], trimmed];
  }

  // Multiple matches - find longest common prefix
  const lcp = longestCommonPrefix(candidates);

  if (lcp.length > trimmed.length) {
    // Can extend - complete to LCP without showing list
    return [[lcp], trimmed];
  }

  // Already at LCP - show options (like bash on second Tab)
  return [candidates, trimmed];
}

// Module-level reference to readline for history saving on exit
let activeReadline: (readline.Interface & { history?: string[] }) | null = null;

/**
 * Save history and exit gracefully
 */
function gracefulExit(code: number = 0): void {
  if (activeReadline?.history && activeReadline.history.length > 0) {
    saveHistory(activeReadline.history);
  }
  process.exit(code);
}

// Load credentials from ~/.config/cope-agent/.env first
loadCredentialsIntoEnv();

// Then load local .env (for development override)
config({ quiet: true });

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
  console.log(colors.dim('  Tab completion enabled. History persisted across sessions.'));
  console.log();

  // Load history from file
  const history = loadHistory();

  // Create readline interface with history and tab completion
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer,
    history,
    historySize: 500,
  }) as readline.Interface & { history?: string[] };

  // Store reference for history saving on exit
  activeReadline = rl;

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

    // Detect exit intent without slash
    const exitPhrases = ['exit', 'quit', 'bye', 'goodbye', 'q'];
    if (exitPhrases.includes(trimmed.toLowerCase())) {
      console.log(colors.dim('  Goodbye!'));
      gracefulExit(0);
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
    gracefulExit(0);
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

  // Handle /mcp subcommands first (before switch)
  if (cmd.startsWith('/mcp ')) {
    await handleMcpCommand(cmd);
    return;
  }

  // Handle /credentials subcommands
  if (cmd.startsWith('/cred')) {
    handleCredentialsCommand(command); // Use original case for values
    return;
  }

  switch (cmd) {
    case '/quit':
    case '/exit':
    case '/q':
      console.log(colors.dim('  Goodbye!'));
      gracefulExit(0);

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
      console.log(colors.dim('    /quit, /q, exit, quit, bye - Exit'));
      console.log(colors.dim('    /clear, /c    - Clear conversation'));
      console.log(colors.dim('    /status, /s   - Show status'));
      console.log(colors.dim('    /mcp          - Show MCP auth status'));
      console.log(colors.dim('    /mcp auth <server> - Re-authenticate a service'));
      console.log(colors.dim('    /credentials  - Manage stored credentials'));
      console.log(colors.dim('    /help, /h     - Show this help'));
      console.log();
      console.log(colors.dim('  Quick commands:'));
      console.log(colors.dim('    briefing      - Daily briefing'));
      console.log(colors.dim('    inbox         - Check email'));
      console.log(colors.dim('    calendar      - Today\'s calendar'));
      console.log(colors.dim('    priorities    - Show priorities'));
      console.log();
      console.log(colors.dim('  Tips:'));
      console.log(colors.dim('    - Press Tab for command completion'));
      console.log(colors.dim('    - Use Up/Down arrows for command history'));
      console.log(colors.dim('    - History is saved across sessions'));
      console.log();
      break;

    default:
      console.log(colors.dim(`  Unknown command: ${command}`));
      console.log(colors.dim('  Try /help for available commands.'));
  }
}

/**
 * Handle /mcp subcommands
 */
async function handleMcpCommand(cmd: string): Promise<void> {
  const parts = cmd.split(/\s+/);
  const subcommand = parts[1];
  const arg = parts[2];

  switch (subcommand) {
    case 'auth':
    case 'reauth':
      if (!arg) {
        console.log();
        console.log(colors.dim('  Usage: /mcp auth <server>'));
        console.log();
        console.log(colors.dim('  Services that support re-auth:'));
        for (const service of listReauthServices()) {
          const info = MCP_AUTH_INFO[service];
          console.log(colors.dim(`    ${service} - ${info?.displayName || service}`));
        }
        console.log();
        return;
      }

      const result = clearAuthTokens(arg);
      console.log();
      if (result.success) {
        console.log(colors.success(`  ✅ ${result.message}`));
      } else {
        console.log(colors.error(`  ❌ ${result.message}`));
      }
      console.log();
      break;

    default:
      console.log(colors.dim(`  Unknown /mcp subcommand: ${subcommand}`));
      console.log(colors.dim('  Available: /mcp, /mcp auth <server>'));
  }
}

/**
 * Handle /credentials subcommands
 */
function handleCredentialsCommand(command: string): void {
  const parts = command.trim().split(/\s+/);
  const subcommand = parts[1]?.toLowerCase();
  const key = parts[2]?.toUpperCase();
  const value = parts.slice(3).join(' '); // Allow spaces in values

  switch (subcommand) {
    case undefined:
    case 'list':
      // List all credentials
      console.log();
      console.log(colors.dim(`  📁 Credentials stored in: ${getConfigDir()}`));
      console.log();
      const creds = listCredentials();
      for (const cred of creds) {
        const icon = cred.set ? '✅' : '⬜';
        console.log(colors.dim(`  ${icon} ${cred.key}`));
        console.log(colors.dim(`     ${cred.description}`));
      }
      console.log();
      console.log(colors.dim('  Usage:'));
      console.log(colors.dim('    /credentials set <KEY> <value>'));
      console.log(colors.dim('    /credentials delete <KEY>'));
      console.log();
      break;

    case 'set':
      if (!key || !value) {
        console.log(colors.error('  Usage: /credentials set <KEY> <value>'));
        return;
      }
      setCredential(key, value);
      console.log(colors.success(`  ✅ Set ${key}`));
      break;

    case 'delete':
    case 'remove':
    case 'unset':
      if (!key) {
        console.log(colors.error('  Usage: /credentials delete <KEY>'));
        return;
      }
      if (deleteCredential(key)) {
        console.log(colors.success(`  ✅ Deleted ${key}`));
      } else {
        console.log(colors.dim(`  ${key} was not set`));
      }
      break;

    default:
      console.log(colors.dim(`  Unknown /credentials subcommand: ${subcommand}`));
      console.log(colors.dim('  Available: list, set, delete'));
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
