/**
 * LifeOS Agent Configuration
 *
 * Uses Sanity CMS directly (no MCP servers needed).
 */

import type { AgentDefinition } from '../types.js';

export const config: Pick<AgentDefinition, 'model' | 'mcpServers' | 'maxTurns' | 'sanityTools'> = {
  model: 'sonnet',
  mcpServers: [], // No MCP servers - uses Sanity directly
  maxTurns: 15,
  sanityTools: [
    // Inbox tools
    'lifeos_create_inbox',
    'lifeos_query_inbox',
    'lifeos_update_inbox',
    // Open loop tools
    'lifeos_create_openloop',
    'lifeos_query_openloops',
    'lifeos_update_openloop',
    // Goal tools
    'lifeos_create_goal',
    'lifeos_query_goals',
    'lifeos_update_goal',
    // Task tools
    'lifeos_create_task',
    'lifeos_query_tasks',
    'lifeos_update_task',
  ],
};
