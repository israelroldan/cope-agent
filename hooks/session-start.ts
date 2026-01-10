#!/usr/bin/env bun
/**
 * COPE Session Start Hook
 *
 * Outputs time-based prompts to nudge briefings and reviews.
 * Install in Claude Code: ~/.claude/settings.json → hooks.SessionStart
 */

function isSubagentSession(): boolean {
  return process.env.CLAUDE_CODE_AGENT !== undefined ||
         process.env.SUBAGENT === 'true';
}

function getLocalTime(): { dayOfWeek: number; hour: number; weekNumber: number } {
  const tz = process.env.TIME_ZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();

  try {
    const localDate = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const startOfYear = new Date(localDate.getFullYear(), 0, 1);
    const days = Math.floor((localDate.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);

    return {
      dayOfWeek: localDate.getDay(), // 0 = Sunday, 1 = Monday
      hour: localDate.getHours(),
      weekNumber
    };
  } catch {
    return {
      dayOfWeek: now.getDay(),
      hour: now.getHours(),
      weekNumber: 1
    };
  }
}

async function main() {
  try {
    // Skip for subagents - they don't need CoS prompts
    if (isSubagentSession()) {
      process.exit(0);
    }

    const stdinData = await Bun.stdin.text();
    if (!stdinData.trim()) {
      process.exit(0);
    }

    const { dayOfWeek, hour, weekNumber } = getLocalTime();
    const prompts: string[] = [];

    // Week start (Monday morning)
    if (dayOfWeek === 1 && hour < 12) {
      prompts.push(`**WEEK ${weekNumber} START**

It's Monday. Time to set the week's direction.

Say "briefing" to review priorities, open loops, and set your top 3 for the week.`);
    }

    // Daily briefing (morning, any day)
    if (hour >= 6 && hour < 12) {
      prompts.push(`**DAILY BRIEFING**

Say "briefing" or "what's on today" to check:
- School pickup/dropoff times
- Calendar events
- Email and Slack digests
- Priorities and open loops`);
    }

    // Mid-week check (Wednesday)
    if (dayOfWeek === 3 && hour >= 9 && hour < 17) {
      prompts.push(`**MID-WEEK CHECK**

It's Wednesday. Say "mid-week check" to review progress and adjust priorities.`);
    }

    // Output prompts
    if (prompts.length > 0) {
      const output = `<system-reminder>
COPE SESSION START

${prompts.join('\n\n---\n\n')}

---
*Say "briefing done" or "skip" to dismiss.*
</system-reminder>`;

      console.log(output);
    }

  } catch (error) {
    // Never crash - just skip
    console.error('[COPE] Session start hook error:', error);
  }

  process.exit(0);
}

main();
