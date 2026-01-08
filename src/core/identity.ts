/**
 * CORE Identity
 *
 * Loads and provides the agent's identity and personality configuration.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedIdentity: string | null = null;

/**
 * Load the identity markdown file
 */
export function loadIdentity(): string {
  if (cachedIdentity) {
    return cachedIdentity;
  }

  const identityPath = join(__dirname, '../../config/identity.md');
  cachedIdentity = readFileSync(identityPath, 'utf-8');
  return cachedIdentity;
}

/**
 * Get the system prompt for the orchestrator agent
 */
export function getOrchestratorSystemPrompt(): string {
  const identity = loadIdentity();

  return `${identity}

## Your Role

You are the COPE orchestrator agent. Your job is to:

1. **Understand user intent** - Parse what the user is asking for
2. **Route to specialists** - Use the capability manifest to find the right specialist agent
3. **Delegate work** - Spawn specialist subagents for domain-specific tasks
4. **Aggregate results** - Collect and format responses from specialists
5. **Maintain context** - Remember conversation history and user preferences

## Key Principles

- **Stay lean** - Don't load MCP tools directly. Delegate to specialists.
- **Be proactive** - Surface blockers, conflicts, and important items
- **Be direct** - Get to the point, respect user's time
- **Check constraints** - Always consider Amelie's pickup schedule for afternoon items

## Available Tools

- \`discover_capability\` - Query what capabilities are available for a domain
- \`spawn_specialist\` - Launch a specialist subagent for a specific task
- \`ask_user\` - Request clarification from the user

## Response Style

Keep responses concise. This is a terminal interface, not a chat app.
Format structured data clearly. Use the optional format when it adds clarity.
`;
}

/**
 * Get time-based greeting prompt
 */
export function getTimeBasedPrompt(): string | null {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

  // Morning briefing prompt (6am - 12pm on weekdays)
  if (hour >= 6 && hour < 12 && dayOfWeek >= 1 && dayOfWeek <= 5) {
    return `☀️ Good morning! Say "briefing" for your daily overview, or ask me anything.`;
  }

  // Week start prompt (Monday morning)
  if (dayOfWeek === 1 && hour >= 6 && hour < 12) {
    return `🗓️ Happy Monday! Week start - say "briefing" to see what's ahead, or "weekly focus" to set priorities.`;
  }

  // Mid-week check (Wednesday)
  if (dayOfWeek === 3 && hour >= 9 && hour < 17) {
    return `📊 Mid-week check-in available. Say "how's the week going" to review progress.`;
  }

  // Friday review prompt
  if (dayOfWeek === 5 && hour >= 14 && hour < 18) {
    return `📝 End of week approaching. Say "weekly review" when you're ready to wrap up.`;
  }

  // Evening prompt
  if (hour >= 17 && hour < 21 && dayOfWeek >= 1 && dayOfWeek <= 5) {
    return `🌙 End of day. Say "done for the day" to capture any open items.`;
  }

  return null;
}
