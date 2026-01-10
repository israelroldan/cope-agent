/**
 * Specialist Agent Definitions
 *
 * Each specialist is a focused agent with domain-specific knowledge
 * and access to only the MCP servers it needs.
 *
 * Agent definitions are split into individual files for maintainability.
 */

export type { AgentDefinition } from './types.js';

import { emailAgent } from './email-agent.js';
import { calendarAgent } from './calendar-agent.js';
import { slackAgent } from './slack-agent.js';
import { notionPersonalAgent } from './notion-personal-agent.js';
import { notionWorkAgent } from './notion-work-agent.js';
import { lifelogAgent } from './lifelog-agent.js';
import { schoolAgent } from './school-agent.js';
import { miroAgent } from './miro-agent.js';
import { copeWorkflowAgent } from './cope-workflow-agent.js';
import { financeAgent } from './finance-agent.js';

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
