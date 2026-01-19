/**
 * Week Start Workflow
 *
 * Monday routine to set up the week with priorities and focus.
 */

import type { WorkflowDefinition, SpecialistTask } from './types.js';

/**
 * Get week date context
 */
function getWeekContext(): { weekNumber: number; monday: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  const weekNumber = Math.ceil(diff / oneWeek);
  
  // Get Monday of current week
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  
  return {
    weekNumber,
    monday: monday.toISOString().split('T')[0],
  };
}

/**
 * Generate specialist tasks for week start
 */
export function getWeekStartTasks(): SpecialistTask[] {
  return [
    {
      specialist: 'lifeos-agent',
      task: `Query LifeOS for week planning:
1. Active goals with progress (P1, P2, P3)
2. Active open loops (status: active)
3. High priority tasks not yet completed (priority: high, status: active)
Return: goal progress summary, open loops count, high priority task list.`,
    },
    {
      specialist: 'calendar-agent',
      task: `Get this week's calendar overview. Show major commitments, deadlines, and time available for deep work.`,
    },
  ];
}

export const weekStartWorkflow: WorkflowDefinition = {
  name: 'week-start',
  description: 'Monday routine to set up the week with priorities and focus.',
  triggers: [
    'week start',
    'start the week',
    'monday planning',
    'weekly planning',
    "what's this week",
    'set up the week',
  ],
  category: 'weekly',
  specialists: getWeekStartTasks(),

  systemPrompt: `You are orchestrating a week start workflow for Monday planning.

## Process

1. Review carries from last week (open loops, incomplete items)
2. Set top 3 priorities for the week
3. Identify potential blockers
4. Define the week's focus theme

## Prompts to Guide Planning

### Review Carries
"What items carried over from last week?"
- Check open loops
- Decide: still relevant? priority changed?

### Set Top 3 Priorities
"What are the 3 most important outcomes this week?"
- Be specific and measurable
- Consider dependencies and blockers
- Align with larger goals

### Identify Blockers
"What could prevent progress?"
- External dependencies
- Missing information
- Resource constraints

### Set Weekly Focus
"One sentence that captures the week's theme"
Example: "Ship the authentication system"

## Questions to Ask
- "What would make this week a success?"
- "What's the one thing that moves everything else forward?"
- "What am I avoiding that I should tackle?"

## Output Format

📅 WEEK ${getWeekContext().weekNumber} PLANNING

🎯 QUARTER GOALS PROGRESS
   [goal]: [progress]

🔄 CARRIES FROM LAST WEEK
   → [item]
   → [item]

📋 THIS WEEK'S TOP 3
   1. [priority - specific & measurable]
   2. [priority - specific & measurable]
   3. [priority - specific & measurable]

🚧 POTENTIAL BLOCKERS
   - [blocker] → [mitigation]

📆 MAJOR COMMITMENTS
   [calendar overview]

💡 WEEK FOCUS: "[one sentence theme]"`,
};
