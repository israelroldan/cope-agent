#!/usr/bin/env node
/**
 * COPE Agent CLI
 *
 * Terminal interface for the COPE personal executive assistant.
 * Built with Ink (React for CLIs) for a clean, interactive experience.
 */

import { config } from 'dotenv';
import { createCopeAgent } from './agent.js';
import { loadCredentialsIntoEnv } from './config/index.js';
import { renderApp } from './cli/App.js';

// Load credentials from ~/.config/cope-agent/.env first
loadCredentialsIntoEnv();

// Then load local .env (for development override)
config({ quiet: true });

/**
 * Check for API key at startup
 */
function checkApiKey(): void {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
  const hasKey = apiKey || authToken;

  if (!hasKey) {
    console.error('\n  Error: No API key configured.\n');
    console.error('  To fix this:\n');
    console.error('  1. Create a .env file:');
    console.error('     cp .env.example .env\n');
    console.error('  Supported variables:');
    console.error('     ANTHROPIC_API_KEY     - Standard Anthropic API');
    console.error('     ANTHROPIC_AUTH_TOKEN  - z.ai and other proxies');
    console.error('     ANTHROPIC_BASE_URL    - Custom endpoint (optional)\n');
    process.exit(1);
  }
}

/**
 * Main entry point
 */
function main(): void {
  checkApiKey();

  // Create agent
  const agent = createCopeAgent({
    onToolUse: (toolName: string) => {
      // Tool use is shown in the UI via the loading state
      if (process.env.DEBUG) {
        console.log(`[DEBUG] Tool: ${toolName}`);
      }
    },
    onToolResult: (toolName: string, result: string) => {
      if (process.env.DEBUG) {
        console.log(`[DEBUG] Result from ${toolName}: ${result.slice(0, 100)}...`);
      }
    },
  });

  // Render the Ink app
  renderApp(agent);
}

// Run
main();
