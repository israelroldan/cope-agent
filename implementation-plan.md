# cope-agent: Custom Agent with Dynamic Context Discovery

## Problem Statement

Current COPE setup consumes **70k tokens (35%)** on MCP tools before any work happens:
- 9 MCP servers load all tool schemas at startup
- Skills add another 14.7k tokens
- Only 25% of context remains for actual work

## Solution

Build **cope-agent** using the Claude Agent SDK with true dynamic context composition:
- Start with ~4k tokens (identity + capability manifest)
- Load domain-specific tools only when needed via specialist subagents
- Each subagent gets fresh context with only relevant MCP tools

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  ORCHESTRATOR (Main Agent) - ~4k tokens at startup          │
│  ├── CORE identity (~2k)                                    │
│  ├── Capability manifest (~800)                             │
│  ├── Built-in tools: Read, Write, Edit, Bash, Glob, Grep    │
│  └── Custom tools: discover_capability, spawn_specialist    │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  EmailAgent     │ │  CalendarAgent  │ │  SlackAgent     │
│  gmail-work     │ │  gcal + ical    │ │  slack-tatoma   │
│  only (~5k)     │ │  + magister     │ │  only (~1.3k)   │
└─────────────────┘ └─────────────────┘ └─────────────────┘
         (more specialists: Notion, Lifelog, School, Miro)
```

## Key Components

### 1. Capability Manifest (~800 tokens)
Lightweight YAML describing all capabilities without loading tool schemas:
```yaml
domains:
  email:
    triggers: [inbox, unread, email, send, draft]
    specialist: EmailAgent
    mcp_servers: [gmail-work]
  calendar:
    triggers: [calendar, schedule, meeting, free]
    specialist: CalendarAgent
    mcp_servers: [google-calendar-work, ical-home, magister]
  # ... other domains
```

### 2. Specialist Subagents
Each domain has a focused agent with only its relevant MCP servers:

| Agent | MCP Servers | Purpose |
|-------|-------------|---------|
| EmailAgent | gmail-work | Inbox, send, search, filters |
| CalendarAgent | gcal, ical, magister | Events, availability, school constraints |
| SlackAgent | slack-tatoma | Channels, messages, activity |
| NotionPersonalAgent | notion-personal | LifeOS (tasks, inbox, decisions) |
| NotionWorkAgent | notion-work | Work docs, projects |
| LifelogAgent | omi | Memories, conversations |
| SchoolAgent | magister | Pickup/dropoff times |
| COPEWorkflowAgent | (spawns sub-agents) | Daily briefing, reviews |

### 3. Dynamic Loading Flow
```
User: "Check my email"
  → Orchestrator matches "email" domain
  → Spawns EmailAgent with gmail-work MCP
  → EmailAgent executes, returns result
  → EmailAgent context released
  → Orchestrator formats response
```

## Project Structure

```
cope-agent/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── agent.ts              # Core orchestrator
│   ├── core/
│   │   ├── identity.ts       # CORE personality & time-based prompts
│   │   └── manifest.ts       # Capability loader
│   ├── tools/
│   │   ├── discover.ts       # Capability discovery
│   │   └── spawn.ts          # Subagent spawning with MCP
│   ├── agents/
│   │   ├── types.ts          # AgentDefinition interface
│   │   ├── definitions.ts    # Agent registry
│   │   ├── email-agent.ts
│   │   ├── calendar-agent.ts
│   │   ├── slack-agent.ts
│   │   ├── notion-personal-agent.ts
│   │   ├── notion-work-agent.ts
│   │   ├── lifelog-agent.ts
│   │   ├── school-agent.ts
│   │   ├── miro-agent.ts
│   │   └── cope-workflow-agent.ts
│   ├── mcp/
│   │   ├── registry.ts       # MCP server configurations
│   │   └── client.ts         # MCP client (stdio/SSE/HTTP)
│   ├── auth/
│   │   ├── types.ts          # Auth status types
│   │   ├── status.ts         # Auth status checking
│   │   └── index.ts          # Auth module exports
│   └── workflows/
│       ├── types.ts          # WorkflowDefinition & LifeOS DBs
│       ├── index.ts          # Workflow registry
│       ├── daily-briefing.ts # Morning routine
│       ├── daily-close.ts    # End-of-day routine
│       ├── week-start.ts     # Monday planning
│       ├── week-mid.ts       # Wednesday check
│       ├── week-end.ts       # Friday review
│       ├── clarify.ts        # COPE Phase 1
│       ├── organise.ts       # COPE Phase 2
│       ├── prioritise.ts     # COPE Phase 3
│       └── execute.ts        # COPE Phase 4
├── config/
│   ├── capabilities.yaml     # Capability manifest (~800 tokens)
│   └── identity.md           # CORE identity
└── package.json
```

## Implementation Phases

### Phase 1: Foundation ✅ COMPLETE
- [x] Initialize TypeScript project with Agent SDK
- [x] Implement capability manifest loader (`src/core/manifest.ts`)
- [x] Build `discover_capability` custom tool (`src/tools/discover.ts`)
- [x] Create basic orchestrator loop (`src/agent.ts`)
- [x] Build CLI interface (`src/index.ts`)

**Result: ~2.5k tokens at startup vs 70k original (96% reduction)**

### Phase 2: Specialist Subagents ✅ COMPLETE
- [x] Build MCP registry with all 9 server configs (`src/mcp/registry.ts`)
- [x] Implement `spawn_specialist` tool (`src/tools/spawn.ts`)
- [x] Create all 9 specialist agent definitions (`src/agents/definitions.ts`)
  - email-agent, calendar-agent, slack-agent
  - notion-personal-agent, notion-work-agent
  - lifelog-agent, school-agent, miro-agent
  - cope-workflow-agent (orchestrates multi-domain)
- [x] Integrate MCP connections (`src/mcp/client.ts` with stdio/SSE/HTTP transports)

### Phase 3: COPE Workflows ✅ COMPLETE
- [x] Implement parallel subagent pattern via `spawn_parallel` tool
- [x] Port DailyBriefing workflow (`src/workflows/daily-briefing.ts`)
- [x] Port DailyClose workflow (`src/workflows/daily-close.ts`)
- [x] Port Weekly workflows (`src/workflows/week-start.ts`, `week-mid.ts`, `week-end.ts`)
- [x] Implement Clarify/Organise/Prioritise/Execute phases (`src/workflows/`)
- [x] Add time-based prompt hooks (`src/core/identity.ts`)
- [x] Update capabilities.yaml with all workflow triggers

### Phase 4: CLI & Polish
- [x] Build terminal interface with streaming
- [x] Add command shortcuts (/quit, /clear, /status, /help)
- [x] Add /mcp command for auth status
- [ ] Implement session persistence
- [ ] Write tests
- [ ] Create migration script from current setup

## Critical Files to Port

| Current Location | Purpose |
|------------------|---------|
| `/Users/israel/.config/pai/skills/COPE/SKILL.md` | COPE framework definition |
| `/Users/israel/.config/pai/skills/COPE/Workflows/DailyBriefing.md` | Parallel subagent pattern |
| `/Users/israel/.config/pai/skills/skill-index.json` | Basis for capability manifest |
| `/Users/israel/.config/pai/hooks/cope-session-start.ts` | Time-based prompts |
| `/Users/israel/code/israelroldan/cope/.mcp.json` | MCP server configurations |

## Key Decisions

1. **TypeScript SDK** - Matches existing codebase, better types
2. **Subagents for all MCP ops** - Fresh connections, context isolation
3. **Capability manifest** - ~800 tokens vs ~70k for full tool schemas
4. **Per-specialist models** - Haiku for simple (school), Sonnet for complex
5. **LifeOS remains source of truth** - No new state management needed

## MCP Authentication

Different MCP servers require different authentication methods.

### Auth Methods by MCP Server

| MCP | Type | Auth Method | Setup |
|-----|------|-------------|-------|
| gmail-work | npx | Auto-auth | Browser opens on first use |
| google-calendar-work | npx | Auto-auth | Browser opens on first use |
| slack-tatoma | docker | Bot token | `SLACK_MCP_XOXB_TOKEN` env var |
| magister | node | Username/pass | `MAGISTER_USER`, `MAGISTER_PASS` env vars |
| omi | docker | API key | `OMI_API_KEY` env var |
| ical-home | uv | None | Local calendars |
| notion-personal | npx | mcp-remote | Browser opens on first use |
| notion-work | npx | mcp-remote | Browser opens on first use |
| miro | npx | mcp-remote | Browser opens on first use |

### OAuth Services via mcp-remote

Notion and Miro use the `mcp-remote` package to handle OAuth:
- **No env vars needed** - tokens managed by mcp-remote
- **Browser opens on first use** - user authorizes via OAuth
- **Tokens cached automatically** - subsequent connections instant
- Based on [Notion's official docs](https://developers.notion.com/docs/get-started-with-mcp)

```json
{
  "command": "npx",
  "args": ["-y", "mcp-remote", "https://mcp.notion.com/mcp"]
}
```

### Auto-Auth Services

These MCP servers handle auth themselves (browser opens on first use):
- Gmail, Google Calendar (via Google OAuth)

### Token-Based Services

These need environment variables configured:
- `SLACK_MCP_XOXB_TOKEN` - Slack bot token
- `MAGISTER_USER`, `MAGISTER_PASS` - School portal credentials
- `OMI_API_KEY` - Omi wearable API key

### CLI Commands

```bash
/mcp              # Show auth status for all MCPs
```

## Verification

After each phase:
1. Run `cope-agent` and test domain queries ("check email", "what's on calendar")
2. Use `/mcp` to verify MCP auth is configured
3. Verify subagent spawning with correct MCP servers
4. Test daily briefing parallel execution
5. Compare output quality to current Claude Code setup
6. Measure context usage (target: <10k at idle vs 70k current)

## Rollback Plan

- Keep Claude Code installation intact during development
- Both can run in parallel
- LifeOS (Notion) data is unchanged
- No migration of persistent state needed
