#!/usr/bin/env node
/**
 * COPE Agent CLI
 *
 * Single entry point with subcommands:
 *   cope-agent           - Interactive CLI (default)
 *   cope-agent mcp       - MCP server mode
 *   cope-agent hook-start - Session start hook
 *   cope-agent hook-end   - Session end hook
 *   cope-agent hook-security - PreToolUse security validator
 */

const command = process.argv[2];

switch (command) {
  case 'mcp':
    // Run MCP server
    import('./mcp-server.js');
    break;

  case 'hook-start':
    // Run session start hook
    runHook('start');
    break;

  case 'hook-end':
    // Run session end hook
    runHook('end');
    break;

  case 'hook-security':
    // Run security validator hook
    runSecurityHook();
    break;

  case 'help':
  case '--help':
  case '-h':
    console.log(`
cope-agent - Personal executive assistant

Commands:
  cope-agent              Interactive CLI (default)
  cope-agent mcp          MCP server mode for Claude Code
  cope-agent hook-start   Session start hook (time-based prompts)
  cope-agent hook-end     Session end hook (day/week close)
  cope-agent hook-security PreToolUse security validator
  cope-agent help         Show this help
`);
    break;

  default:
    // Default to interactive CLI
    import('./index.js');
}

/**
 * Run a hook inline (avoids spawning bun for simple hooks)
 */
async function runHook(type: 'start' | 'end') {
  // Skip for subagents
  if (process.env.CLAUDE_CODE_AGENT || process.env.SUBAGENT === 'true') {
    process.exit(0);
  }

  // Read stdin (Claude Code sends hook data via stdin)
  // We don't use the data, but must consume it
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  const tz = process.env.TIME_ZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  let dayOfWeek: number, hour: number, weekNumber: number;

  try {
    const localDate = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const startOfYear = new Date(localDate.getFullYear(), 0, 1);
    const days = Math.floor((localDate.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    dayOfWeek = localDate.getDay();
    hour = localDate.getHours();
  } catch {
    dayOfWeek = now.getDay();
    hour = now.getHours();
    weekNumber = 1;
  }

  const prompts: string[] = [];

  if (type === 'start') {
    // Week start (Monday morning)
    if (dayOfWeek === 1 && hour < 12) {
      prompts.push(`**WEEK ${weekNumber} START**

It's Monday. Time to set the week's direction.

Say "briefing" to review priorities, open loops, and set your top 3 for the week.`);
    }

    // Daily briefing (morning)
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

    if (prompts.length > 0) {
      // Output as system-reminder (same format as PAI that works)
      console.log(`<system-reminder>
COPE SESSION START

${prompts.join('\n\n---\n\n')}

---
*Say "briefing done" or "skip" to dismiss.*
</system-reminder>`);
    }
  }

  if (type === 'end') {
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

    if (prompts.length > 0) {
      // Output as system-reminder (same format as PAI that works)
      console.log(`<system-reminder>
COPE SESSION END

${prompts.join('\n\n---\n\n')}
</system-reminder>`);
    }
  }

  process.exit(0);
}

/**
 * Security validator hook for PreToolUse
 * Blocks dangerous bash commands
 */
async function runSecurityHook() {
  // Read stdin (Claude Code sends tool payload)
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const stdinData = Buffer.concat(chunks).toString();

  if (!stdinData.trim()) {
    process.exit(0);
  }

  let payload: { tool_name?: string; tool_input?: { command?: string } };
  try {
    payload = JSON.parse(stdinData);
  } catch {
    process.exit(0);
  }

  // Only validate Bash commands
  if (payload.tool_name !== 'Bash') {
    process.exit(0);
  }

  const command = payload.tool_input?.command;
  if (!command) {
    process.exit(0);
  }

  // Attack patterns - categorized by severity
  const BLOCK_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
    // Catastrophic - always block
    { pattern: /rm\s+(-rf?|--recursive)\s+[\/~]/i, message: 'Catastrophic deletion (rm -rf /)' },
    { pattern: /rm\s+(-rf?|--recursive)\s+\*/i, message: 'Catastrophic deletion (rm -rf *)' },
    { pattern: />\s*\/dev\/sd[a-z]/i, message: 'Disk overwrite' },
    { pattern: /mkfs\./i, message: 'Filesystem format' },
    { pattern: /dd\s+if=.*of=\/dev/i, message: 'dd to device' },

    // Reverse shells - always block
    { pattern: /bash\s+-i\s+>&\s*\/dev\/tcp/i, message: 'Reverse shell (bash)' },
    { pattern: /nc\s+(-e|--exec)\s+\/bin\/(ba)?sh/i, message: 'Reverse shell (netcat)' },
    { pattern: /python.*socket.*connect/i, message: 'Reverse shell (python)' },
    { pattern: /perl.*socket.*connect/i, message: 'Reverse shell (perl)' },
    { pattern: /\|\s*\/bin\/(ba)?sh/i, message: 'Pipe to shell' },

    // Remote code execution - always block
    { pattern: /curl.*\|\s*(ba)?sh/i, message: 'Remote code execution (curl | sh)' },
    { pattern: /wget.*\|\s*(ba)?sh/i, message: 'Remote code execution (wget | sh)' },
    { pattern: /base64\s+-d.*\|\s*(ba)?sh/i, message: 'Base64 decode to shell' },

    // Prompt injection indicators - block
    { pattern: /ignore\s+(all\s+)?previous\s+instructions/i, message: 'Prompt injection' },
    { pattern: /disregard\s+(all\s+)?prior\s+instructions/i, message: 'Prompt injection' },
    { pattern: /\[INST\]/i, message: 'LLM injection marker' },
    { pattern: /<\|im_start\|>/i, message: 'ChatML injection' },

    // Data exfiltration - block
    { pattern: /curl.*(@|--upload-file)/i, message: 'Data exfiltration (curl upload)' },
    { pattern: /tar.*\|.*curl/i, message: 'Data exfiltration (tar + curl)' },

    // Config protection - block
    { pattern: /rm.*\.config\/cope-agent/i, message: 'cope-agent config protection' },
    { pattern: /rm.*\.claude/i, message: 'Claude config protection' },
  ];

  // Check for blocked patterns
  for (const { pattern, message } of BLOCK_PATTERNS) {
    if (pattern.test(command)) {
      console.log(`🚨 BLOCKED: ${message}`);
      console.log(`Command: ${command.substring(0, 100)}...`);
      // Exit code 2 signals block to Claude Code
      process.exit(2);
    }
  }

  // Warn patterns (allow but log)
  const WARN_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
    { pattern: /export\s+(ANTHROPIC|OPENAI|AWS|AZURE)_/i, message: 'API key export' },
    { pattern: /echo\s+\$\{?(ANTHROPIC|OPENAI)_/i, message: 'Echo API keys' },
    { pattern: /git\s+push.*(-f|--force)/i, message: 'Force push' },
    { pattern: /git\s+reset\s+--hard/i, message: 'Hard reset' },
    { pattern: /chmod\s+777/i, message: 'World writable permissions' },
  ];

  for (const { pattern, message } of WARN_PATTERNS) {
    if (pattern.test(command)) {
      console.log(`⚠️ WARNING: ${message}`);
    }
  }

  // Exit 0 = allow the command
  process.exit(0);
}
