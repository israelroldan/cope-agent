/**
 * COPE Workflow Agent Definition
 *
 * Orchestrator for multi-domain operations like daily briefing.
 * Uses workflow definitions from src/workflows/ for structured execution.
 */

import type { AgentDefinition } from '../types.js';
import { config } from './config.js';
import promptTemplate from './prompt-template.js';
import { fillTemplate, getTemplateData } from './template-utils.js';

// Build system prompt at module load time by filling template placeholders
const systemPrompt = fillTemplate(promptTemplate, getTemplateData());

export const copeWorkflowAgent: AgentDefinition = {
  name: 'cope-workflow-agent',
  description: 'COPE workflow orchestrator for daily briefings, weekly reviews, and COPE thinking phases.',
  systemPrompt,
  ...config,
};

/**
 * Re-export workflows for external use
 */
export { workflows, listWorkflows, LIFEOS_DATABASES } from '../../workflows/index.js';
