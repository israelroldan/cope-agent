/**
 * Template Utilities for COPE Workflow Agent
 *
 * Fills placeholders in the prompt template with dynamic workflow data.
 */

import {
  listWorkflows,
} from '../../workflows/index.js';

interface TemplateData {
  DAILY_WORKFLOWS: string;
  WEEKLY_WORKFLOWS: string;
  FINANCE_WORKFLOWS: string;
  COPE_PHASES: string;
}

/**
 * Format workflows for a specific category
 */
function formatWorkflows(category: string): string {
  const workflowList = listWorkflows();
  const filtered = workflowList.filter(w => w.category === category);

  if (filtered.length === 0) {
    return '(none configured)';
  }

  return filtered
    .map(w => `- **${w.name}**: ${w.description}\n  Triggers: ${w.triggers.slice(0, 3).join(', ')}`)
    .join('\n');
}

/**
 * Get all template data for placeholder replacement
 */
export function getTemplateData(): TemplateData {
  // Get finance workflows (they're categorized as 'weekly' and 'ad-hoc')
  const workflowList = listWorkflows();
  const financeWorkflows = workflowList.filter(w =>
    w.name === 'budget-review' || w.name === 'month-close'
  );

  const formatFinanceWorkflows = financeWorkflows.length > 0
    ? financeWorkflows
        .map(w => `- **${w.name}**: ${w.description}\n  Triggers: ${w.triggers.slice(0, 3).join(', ')}`)
        .join('\n')
    : '(none configured)';

  return {
    DAILY_WORKFLOWS: formatWorkflows('daily'),
    WEEKLY_WORKFLOWS: formatWorkflows('weekly'),
    FINANCE_WORKFLOWS: formatFinanceWorkflows,
    COPE_PHASES: formatWorkflows('cope-phase'),
  };
}

/**
 * Fill template placeholders with data
 */
export function fillTemplate(template: string, data: TemplateData): string {
  let result = template;

  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }

  return result;
}
