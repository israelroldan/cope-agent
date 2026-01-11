/**
 * Workflow Definitions Index
 *
 * All COPE workflows exported for use by the workflow agent.
 */

// Types
export type { WorkflowDefinition, WorkflowResult, SpecialistTask } from './types.js';
export { LIFEOS_DATABASES } from './types.js';

// Daily workflows
export { dailyBriefingWorkflow, getDailyBriefingTasks } from './daily-briefing.js';
export { dailyCloseWorkflow, getDailyCloseTasks } from './daily-close.js';

// Weekly workflows
export { weekStartWorkflow, getWeekStartTasks } from './week-start.js';
export { weekMidWorkflow, getWeekMidTasks } from './week-mid.js';
export { weekEndWorkflow, getWeekEndTasks } from './week-end.js';

// Finance workflows
export { budgetReviewWorkflow, getBudgetReviewTasks } from './budget-review.js';
export { monthCloseWorkflow, getMonthCloseTasks } from './month-close.js';

// COPE phase workflows
export { clarifyWorkflow } from './clarify.js';
export { organiseWorkflow } from './organise.js';
export { prioritiseWorkflow } from './prioritise.js';
export { executeWorkflow } from './execute.js';

import type { WorkflowDefinition } from './types.js';
import { dailyBriefingWorkflow } from './daily-briefing.js';
import { dailyCloseWorkflow } from './daily-close.js';
import { weekStartWorkflow } from './week-start.js';
import { weekMidWorkflow } from './week-mid.js';
import { weekEndWorkflow } from './week-end.js';
import { budgetReviewWorkflow } from './budget-review.js';
import { monthCloseWorkflow } from './month-close.js';
import { clarifyWorkflow } from './clarify.js';
import { organiseWorkflow } from './organise.js';
import { prioritiseWorkflow } from './prioritise.js';
import { executeWorkflow } from './execute.js';

/**
 * All workflows indexed by name
 */
export const workflows: Record<string, WorkflowDefinition> = {
  'daily-briefing': dailyBriefingWorkflow,
  'daily-close': dailyCloseWorkflow,
  'week-start': weekStartWorkflow,
  'week-mid': weekMidWorkflow,
  'week-end': weekEndWorkflow,
  'budget-review': budgetReviewWorkflow,
  'month-close': monthCloseWorkflow,
  'clarify': clarifyWorkflow,
  'organise': organiseWorkflow,
  'prioritise': prioritiseWorkflow,
  'execute': executeWorkflow,
};

/**
 * Get workflow by name
 */
export function getWorkflow(name: string): WorkflowDefinition | undefined {
  return workflows[name];
}

/**
 * Find workflow matching a trigger phrase
 */
export function findWorkflowByTrigger(input: string): WorkflowDefinition | undefined {
  const normalized = input.toLowerCase().trim();
  
  for (const workflow of Object.values(workflows)) {
    for (const trigger of workflow.triggers) {
      if (normalized.includes(trigger.toLowerCase())) {
        return workflow;
      }
    }
  }
  
  return undefined;
}

/**
 * List all workflows
 */
export function listWorkflows(): Array<{
  name: string;
  description: string;
  category: string;
  triggers: string[];
}> {
  return Object.values(workflows).map(w => ({
    name: w.name,
    description: w.description,
    category: w.category,
    triggers: w.triggers,
  }));
}

/**
 * List workflows by category
 */
export function listWorkflowsByCategory(category: WorkflowDefinition['category']): WorkflowDefinition[] {
  return Object.values(workflows).filter(w => w.category === category);
}
