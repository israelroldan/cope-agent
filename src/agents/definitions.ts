/**
 * Specialist Agent Definitions
 *
 * Each specialist is a focused agent with domain-specific knowledge
 * and access to only the MCP servers it needs.
 *
 * Agent definitions are split into individual files for maintainability.
 */

export type { AgentDefinition } from './types.js';

import { emailAgent } from './email-agent/index.js';
import { calendarAgent } from './calendar-agent/index.js';
import { slackAgent } from './slack-agent/index.js';
import { notionPersonalAgent } from './notion-personal-agent/index.js';
import { notionWorkAgent } from './notion-work-agent/index.js';
import { lifelogAgent } from './lifelog-agent/index.js';
import { schoolAgent } from './school-agent/index.js';
import { miroAgent } from './miro-agent/index.js';
import { copeWorkflowAgent } from './cope-workflow-agent/index.js';
import { financeAgent } from './finance-agent/index.js';
import { icsSyncAgent } from './ics-sync-agent/index.js';

import type { AgentDefinition } from './types.js';

/**
 * All agent definitions indexed by name
 */
export const agentDefinitions: Record<string, AgentDefinition> = {
  'email-agent': emailAgent,
  'calendar-agent': calendarAgent,
  'slack-agent': slackAgent,
  'notion-personal-agent': notionPersonalAgent,
  'notion-work-agent': notionWorkAgent,
  'lifelog-agent': lifelogAgent,
  'school-agent': schoolAgent,
  'miro-agent': miroAgent,
  'cope-workflow-agent': copeWorkflowAgent,
  'finance-agent': financeAgent,
  'ics-sync-agent': icsSyncAgent,
};

/**
 * Get agent definition by name
 */
export function getAgentDefinition(name: string): AgentDefinition | undefined {
  return agentDefinitions[name];
}

/**
 * List all available agents
 */
export function listAgents(): Array<{ name: string; description: string }> {
  return Object.entries(agentDefinitions).map(([name, def]) => ({
    name,
    description: def.description,
  }));
}
