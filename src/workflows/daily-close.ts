/**
 * Daily Close Workflow
 *
 * End-of-day routine to capture state, close loops, and prepare for tomorrow.
 */

import type { WorkflowDefinition, SpecialistTask } from './types.js';
import { LIFEOS_DATABASES } from './types.js';

/**
 * Get today's date for queries
 */
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Generate specialist tasks for daily close
 */
export function getDailyCloseTasks(): SpecialistTask[] {
  const today = getTodayDate();

  return [
    {
      specialist: 'notion-personal-agent',
      task: `Query LifeOS for today's activity:
1. Decisions logged today from ${LIFEOS_DATABASES.DECISIONS} (filter created_date = ${today})
2. Tasks completed today from ${LIFEOS_DATABASES.TASKS} (Status = Done, modified today)
3. Tasks still in progress (Status = In Progress)
4. Current open loops (Tasks with "Waiting On" property set)
Return: today's decisions, completed tasks, active tasks, open loops.`,
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
3. Prompt for any unlogged decisions or new open loops
4. Optionally create/update the journal entry

## Data Sources

- Tasks: ${LIFEOS_DATABASES.TASKS}
- Decisions: ${LIFEOS_DATABASES.DECISIONS}
- Journal: ${LIFEOS_DATABASES.JOURNAL}

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
   [notion-personal-agent: completed tasks]

📊 STILL IN PROGRESS  
   [notion-personal-agent: active tasks]

🔄 OPEN LOOPS
   [notion-personal-agent: waiting on items]

📝 DECISIONS LOGGED
   [notion-personal-agent: today's decisions]

🧠 LIFELOG TODAY
   [lifelog-agent: day summary]`,
};
