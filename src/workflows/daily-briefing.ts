/**
 * Daily Briefing Workflow
 *
 * Morning routine to set up the day. Spawns multiple specialists in parallel
 * to gather information from school, calendar, email, slack, and LifeOS.
 */

import type { WorkflowDefinition, SpecialistTask } from './types.js';
import { LIFEOS_DATABASES } from './types.js';

/**
 * Get today's date in various formats
 */
function getDateContext(): { today: string; dayOfWeek: string; formatted: string } {
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return {
    today: now.toISOString().split('T')[0],
    dayOfWeek: days[now.getDay()],
    formatted: now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  };
}

/**
 * Generate specialist tasks for daily briefing
 */
export function getDailyBriefingTasks(): SpecialistTask[] {
  const { today, dayOfWeek } = getDateContext();

  return [
    {
      specialist: 'school-agent',
      task: `Get Amélie's school schedule for ${dayOfWeek} ${today}. Return dropoff time, pickup time, and any cancellations or schedule changes.`,
    },
    {
      specialist: 'calendar-agent',
      task: `Get today's calendar events (${today}) from both work and home calendars. Flag any conflicts with school pickup/dropoff times. Return event list with times.`,
    },
    {
      specialist: 'email-agent',
      task: `Check unread emails. Flag VIP senders (Sander, Maarten, Thomas). Return unread count and summaries of important messages that need action.`,
    },
    {
      specialist: 'slack-agent',
      task: `Check Slack activity from last 24 hours in #founders-talk and #product channels. Summarize key discussions and any messages requiring response.`,
    },
    {
      specialist: 'notion-personal-agent',
      task: `Query LifeOS for:
1. High priority tasks (Status != Done, Priority = High) from ${LIFEOS_DATABASES.TASKS}
2. Tasks with "Waiting On" property set (open loops)
3. Unprocessed inbox items from ${LIFEOS_DATABASES.NOTES}
Return as: priorities, open loops, inbox items.`,
    },
    {
      specialist: 'lifelog-agent',
      task: `Get overnight lifelog summary. Return: number of conversations, any detected action items or commitments, and notable memories from last 24 hours.`,
    },
  ];
}

export const dailyBriefingWorkflow: WorkflowDefinition = {
  name: 'daily-briefing',
  description: 'Morning routine to set up the day with school, calendar, email, slack, and priorities.',
  triggers: [
    "what's on today",
    "what's happening today",
    'daily briefing',
    'morning briefing',
    'start my day',
    'good morning',
    "today's schedule",
  ],
  category: 'daily',
  specialists: getDailyBriefingTasks(),

  systemPrompt: `You are orchestrating a daily briefing workflow. Your job is to:

1. Spawn all specialists in parallel using spawn_parallel
2. Aggregate their results into a cohesive daily briefing
3. Identify any conflicts or warnings (e.g., meetings overlapping with school pickup)
4. Highlight the most important item for the day

## Specialist Tasks to Spawn

Use spawn_parallel with these tasks:
- school-agent: Get dropoff/pickup times
- calendar-agent: Get today's events from all calendars
- email-agent: Check inbox, flag VIPs
- slack-agent: Check overnight activity
- notion-personal-agent: Get priorities and open loops from LifeOS
- lifelog-agent: Get overnight conversations and memories

## Output Format

Format the results as:

☀️ DAILY BRIEFING [${getDateContext().formatted}]

🏫 SCHOOL
   Leave by [time] for Amélie (1st period [time])
   Pickup: [time]
   [Any cancellations or changes]

📅 CALENDAR
   💼 Work:
      [event] (duration) [warnings if conflict]
   🏠 Home:
      [event] (duration)

📧 EMAIL
   Unread: [count] ([VIP count] from VIPs)
   * [VIP name]: "[subject]" - [action needed]
   
   Pending responses: [count]

💬 SLACK OVERNIGHT
   [channel]: [summary]
   DMs: [summary]
   
   Commitments detected:
   → [commitment]

🧠 LIFELOG
   Conversations: [count]
   Action items: [count]
   [Notable memory if any]

⚠️ CONFLICTS & WARNINGS
   [Any scheduling conflicts or important alerts]

📋 PRIORITIES
   1. [top priority]
   2. [second priority]
   3. [third priority]

🔄 OPEN LOOPS
   → [waiting on item]

📥 INBOX
   [unprocessed items count]

🎯 THE ONE THING: [What makes today successful?]`,

  outputFormat: `☀️ DAILY BRIEFING [date]

🏫 SCHOOL
   [school-agent output]

📅 CALENDAR
   [calendar-agent output]

📧 EMAIL
   [email-agent output]

💬 SLACK
   [slack-agent output]

🧠 LIFELOG
   [lifelog-agent output]

📋 PRIORITIES
   [notion-personal-agent output - priorities]

🔄 OPEN LOOPS
   [notion-personal-agent output - waiting on]

📥 INBOX
   [notion-personal-agent output - inbox]

🎯 THE ONE THING: [most important item for today]`,
};
