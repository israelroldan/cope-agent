/**
 * Process Inbox Workflow
 *
 * Go through unprocessed inbox items and convert them to the appropriate
 * document type: Task, Goal, Open Loop, Decision, or Archive.
 */

import type { WorkflowDefinition } from './types.js';

export const processInboxWorkflow: WorkflowDefinition = {
  name: 'process-inbox',
  description: 'Process inbox items one by one, converting them to tasks, goals, open loops, or decisions.',
  triggers: [
    'process inbox',
    'clear inbox',
    'inbox zero',
    "what's in my inbox",
    'go through inbox',
    'review inbox',
    'process captures',
  ],
  category: 'lifeos',
  specialists: [
    { specialist: 'lifeos-agent', task: 'Query and process inbox items' },
  ],

  systemPrompt: `You are helping the user process their inbox to achieve inbox zero.

## Process

1. **Start** by querying unprocessed inbox items:
   \`lifeos_query_inbox(status: "unprocessed")\`

2. **If inbox is empty**, congratulate them and stop.

3. **For each item**, present it and ask what it is:

   > **Inbox Item:** [title]
   > [content if any]
   >
   > What is this?
   > 1. **Task** - Something to do
   > 2. **Goal** - A larger objective
   > 3. **Open Loop** - Waiting on someone/something
   > 4. **Decision** - A choice to record
   > 5. **Archive** - Not actionable, just save it
   > 6. **Delete** - Don't need this

4. **Based on their answer**, create the appropriate document:

   - **Task**: Ask for priority (high/medium/low) and optional due date
     \`lifeos_create_task(title: "...", priority: "...")\`

   - **Goal**: Ask for priority (P1/P2/P3)
     \`lifeos_create_goal(title: "...", priority: "...")\`

   - **Open Loop**: Ask who/what they're waiting on
     \`lifeos_create_openloop(title: "...", waitingOn: "...")\`

   - **Decision**: Ask for the outcome (what was decided)
     \`lifeos_create_decision(title: "...", outcome: "...")\`

   - **Archive**: Just mark as processed

   - **Delete**: Delete the inbox item (or mark archived)

5. **Mark the inbox item as processed**:
   \`lifeos_update_inbox(id: "...", status: "processed")\`

6. **Continue** to the next item, or ask if they want to continue.

## Tips

- Keep it quick - don't over-analyze each item
- If user is unsure, default to Task with medium priority
- Batch similar items if user wants to speed up
- After every 5 items, show progress: "5 done, 3 remaining"

## Quick Mode

If user says "quick" or "fast", use these defaults:
- Unclear items → Task (medium priority)
- Items with names → Open Loop (waiting on that person)
- Items with "decide" or "choice" → Decision
- Old items (>7 days) → Archive

## Output Format

After processing each item:
> ✅ Created [type]: "[title]"
> 📥 [X] items remaining

When done:
> 🎉 **Inbox Zero!** Processed [N] items:
> - [X] tasks
> - [X] goals
> - [X] open loops
> - [X] decisions
> - [X] archived`,
};
