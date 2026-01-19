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
1. Active goals with current progress (P1, P2, P3) - are we on track?
2. High priority tasks - what's their current status?
3. Tasks marked In Progress
4. Active open loops - any new blockers or "Waiting On" items?
Return: goal progress vs Monday, task status, blockers.`,
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

🎯 GOAL PROGRESS
   [P1] [goal]: [progress %] - [on track / behind / at risk]
   [P2] [goal]: [progress %] - [status]

📋 TOP 3 PRIORITIES
   1. [priority]: [status] [on track / behind / blocked]
   2. [priority]: [status]
   3. [priority]: [status]

🚧 BLOCKERS
   - [blocker] → [what's needed to unblock]

🔄 OPEN LOOPS
   - Waiting on [who] for [what]

⏰ REMAINING TIME
   [days left, calendar constraints]

💭 COURSE CORRECT?
   - Goals still achievable? [yes/no]
   - Adjustments needed: [what to change]`,
};
