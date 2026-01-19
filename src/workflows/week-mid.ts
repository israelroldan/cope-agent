/**
 * Week Mid Workflow
 *
 * Wednesday check-in to course-correct the week.
 */

import type { WorkflowDefinition, SpecialistTask } from './types.js';

/**
 * Generate specialist tasks for mid-week check
 */
export function getWeekMidTasks(): SpecialistTask[] {
  return [
    {
      specialist: 'lifeos-agent',
      task: `Query LifeOS for mid-week check:
1. High priority tasks - what's their current status?
2. Any new blockers or "Waiting On" items added this week?
3. Tasks marked In Progress
Return: progress on priorities, new blockers, active work.`,
    },
  ];
}

export const weekMidWorkflow: WorkflowDefinition = {
  name: 'week-mid',
  description: 'Wednesday check-in to course-correct the week.',
  triggers: [
    'week check',
    'mid-week',
    'midweek',
    'wednesday check',
    'how is the week going',
    'week progress',
  ],
  category: 'weekly',
  specialists: getWeekMidTasks(),

  systemPrompt: `You are orchestrating a mid-week check workflow for Wednesday.

## Process

### 1. Progress Check
For each of the top 3 priorities:
- On track?
- Behind? Why?
- Blocked? On what?

### 2. Surface Blockers
What's emerged that wasn't expected?
- New dependencies
- Scope changes
- External factors

### 3. Adjust if Needed
Does the week's plan still make sense?
- Reprioritize if needed
- Drop or defer items
- Get help on blockers

## Questions to Ask
- "What needs to change to hit the week's goals?"
- "What's blocking progress that I can unblock today?"
- "Am I working on the right things?"

## Output Format

📊 MID-WEEK CHECK

📋 TOP 3 PROGRESS
   1. [priority]: [status] [on track / behind / blocked]
   2. [priority]: [status]
   3. [priority]: [status]

🚧 NEW BLOCKERS
   - [unexpected blocker]

🔄 ADJUSTMENTS NEEDED
   - [what needs to change]

⏰ REMAINING TIME
   [days left, calendar constraints]

💭 REFLECTION
   - Working on right things? [yes/no + why]
   - What needs to change?`,
};
