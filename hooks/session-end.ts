#!/usr/bin/env bun
/**
 * COPE Session End Hook
 *
 * Prompts for day close and week review when appropriate.
 * Install in Claude Code: ~/.claude/settings.json → hooks.Stop
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
      dayOfWeek: localDate.getDay(),
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
    // Skip for subagents
    if (isSubagentSession()) {
      process.exit(0);
    }

    const stdinData = await Bun.stdin.text();
    if (!stdinData.trim()) {
      process.exit(0);
    }

    const { dayOfWeek, hour, weekNumber } = getLocalTime();
    const prompts: string[] = [];

    // Week end review (Friday afternoon)
    if (dayOfWeek === 5 && hour >= 15) {
      prompts.push(`**WEEK ${weekNumber} REVIEW**

It's Friday. Say "weekly review" to:
1. Capture wins
2. Identify carries for next week
3. Extract learnings
4. Create week review entry`);
    }

    // Day close (evening)
    if (hour >= 17) {
      prompts.push(`**DAY CLOSE**

Before you go, say "done for the day" to:
- Log decisions made today
- Capture new open loops
- Update priority status

Or just close if nothing to capture.`);
    }

    // Output prompts
    if (prompts.length > 0) {
      const output = `<system-reminder>
COPE SESSION END

${prompts.join('\n\n---\n\n')}
</system-reminder>`;

      console.log(output);
    }

  } catch (error) {
    console.error('[COPE] Session end hook error:', error);
  }

  process.exit(0);
}

main();
