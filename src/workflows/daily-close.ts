/**
 * Daily Close Workflow
 *
 * End-of-day routine to capture state, close loops, and prepare for tomorrow.
 */

import type { WorkflowDefinition, SpecialistTask } from './types.js';
import { getLocalDateString } from '../core/datetime.js';

/**
 * Get today's date for queries
 */
function getTodayDate(): string {
  return getLocalDateString();
}

/**
 * Generate specialist tasks for daily close
 */
export function getDailyCloseTasks(): SpecialistTask[] {
  return [
    {
      specialist: 'lifeos-agent',
      task: `Query LifeOS for today's daily close:
1. Tasks completed today (status: done)
2. Tasks still in progress (status: in_progress)
3. Active open loops (status: active)
4. Unprocessed inbox items (status: unprocessed)
Return: completed tasks count, active tasks, open loops, inbox count.`,
    },
    {
      specialist: 'lifelog-agent',
      task: `Get today's lifelog summary:
- Total conversations and duration
- Notable conversations (meetings, important calls)
- Detected action items and commitments
- Any memories worth preserving
Return formatted summary for day close.`,
    },
  ];
}

export const dailyCloseWorkflow: WorkflowDefinition = {
  name: 'daily-close',
  description: 'End-of-day routine to capture decisions, review progress, and close loops.',
  triggers: [
    'done for the day',
    'end my day',
    'daily close',
    'day close',
    'close the day',
    'wrap up',
    "what'd I do today",
  ],
  category: 'daily',
  specialists: getDailyCloseTasks(),

  systemPrompt: `You are orchestrating a daily close workflow. Your job is to:

1. Spawn specialists to gather today's activity
2. Present a summary for review
3. Prompt for any new open loops or items to capture
4. Summarize what was accomplished

## Data Sources

- Tasks, Goals, Open Loops, Inbox: lifeos-agent (Sanity CMS)
- Lifelog: lifelog-agent (Omi wearable)

## Review Process

After gathering data, ask the user:

1. **Unlogged Decisions**
   "Any decisions made today worth capturing?"
   Even small decisions have rationale worth recording.

2. **New Open Loops**
   "Anything now waiting on something/someone?"
   Capture dependencies before they're forgotten.

3. **Unresolved Items**
   "Anything unresolved that needs a note?"
   Quick capture prevents morning fog.

## Output Format

🌙 DAILY CLOSE [date]

✅ COMPLETED TODAY
   - [task 1]
   - [task 2]

📊 STILL IN PROGRESS
   - [active task]

🔄 OPEN LOOPS
   → [waiting on item]
   → [waiting on item]

📝 DECISIONS LOGGED
   - [decision 1]
   - [decision 2]

🧠 LIFELOG TODAY
   Conversations: [count] ([duration] total)
   Notable: [key conversations]
   Action items synced: [count]

---

Quick prompts:
• Any decisions worth capturing?
• Anything now waiting on someone/something?
• Anything unresolved to note?

Say "save to journal" to log this day close.`,

  outputFormat: `🌙 DAILY CLOSE [date]

✅ COMPLETED TODAY
   [lifeos-agent: completed tasks]

📊 STILL IN PROGRESS
   [lifeos-agent: active tasks]

🔄 OPEN LOOPS
   [lifeos-agent: active open loops]

📥 INBOX
   [lifeos-agent: unprocessed inbox items]

🧠 LIFELOG TODAY
   [lifelog-agent: day summary]`,
};

