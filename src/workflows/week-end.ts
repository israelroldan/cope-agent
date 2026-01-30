/**
 * Week End Workflow
 *
 * Friday routine to close out the week with wins, learnings, and carries.
 */

import type { WorkflowDefinition, SpecialistTask } from './types.js';
import { getLocalDateString } from '../core/datetime.js';

/**
 * Get week date range
 */
function getWeekRange(): { monday: string; friday: string; weekNumber: number } {
  const now = new Date();
  const day = now.getDay();

  // Get Monday
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);

  // Get Friday
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  // Week number
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  const weekNumber = Math.ceil(diff / oneWeek);

  return {
    monday: getLocalDateString(monday),
    friday: getLocalDateString(friday),
    weekNumber,
  };
}

/**
 * Generate specialist tasks for week end
 */
export function getWeekEndTasks(): SpecialistTask[] {
  const { monday, friday } = getWeekRange();

  return [
    {
      specialist: 'lifeos-agent',
      task: `Query LifeOS for week review:
1. Tasks completed this week (status: done)
2. Active goals with current progress (P1, P2, P3)
3. Active open loops carrying to next week (status: active)
4. High priority tasks still pending
Return: completed count, goal progress summary, open loops, carries.`,
    },
    {
      specialist: 'lifelog-agent',
      task: `Get week's lifelog summary (${monday} to ${friday}):
- Total conversations and duration
- Notable conversations (key meetings, important calls)
- Action items detected vs completed
- Key memories worth preserving
Return week summary.`,
    },
  ];
}

export const weekEndWorkflow: WorkflowDefinition = {
  name: 'week-end',
  description: 'Friday routine to close out the week with wins, learnings, and carries.',
  triggers: [
    'week end',
    'end the week',
    'weekly review',
    'friday review',
    'close the week',
    'week wrap up',
    "how'd the week go",
  ],
  category: 'weekly',
  specialists: getWeekEndTasks(),

  systemPrompt: `You are orchestrating a week end workflow for Friday review.

## Process

### 1. Capture Wins
What got done this week?
- Completed priorities
- Progress made
- Problems solved

### 2. Identify Carries
What moves to next week?
- Incomplete priorities
- New items that emerged
- Blocked items

### 3. Extract Learnings
What did you learn?
- What worked well?
- What didn't work?
- What would you do differently?

### 4. Rate the Week (Optional)
1 = Terrible, nothing worked
2 = Below expectations
3 = Okay, met minimum
4 = Good, solid progress
5 = Great, exceeded goals

## Questions to Ask
- "What am I proud of this week?"
- "What would I do differently?"
- "What's the one thing to carry forward?"

## Output Format

📅 WEEK ${getWeekRange().weekNumber} REVIEW

✅ WINS
   - [completed item / achievement]
   - [completed item / achievement]

🎯 GOAL PROGRESS
   [goal]: [progress %] → [notes]

📝 DECISIONS MADE
   - [decision with context]

🔄 CARRIES TO NEXT WEEK
   → [incomplete item]
   → [open loop]

🧠 LIFELOG WEEK SUMMARY
   Conversations: [count] ([total duration])
   Notable: [key meetings/calls]
   Action items: [detected] detected, [completed] completed

📚 LEARNINGS
   ✓ What worked: [notes]
   ✗ What didn't: [notes]
   → Do differently: [notes]

⭐ WEEK RATING: [1-5]

Say "save review" to create a journal entry for this week.`,
};
