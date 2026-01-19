# COPE Agent

A personal executive assistant built on a hierarchical agent architecture. COPE stands for **Clarify, Organise, Prioritise, Execute** - a framework for turning chaos into action.

## Overview

COPE Agent uses an orchestrator pattern where a lean central agent delegates to specialized agents, each connecting to domain-specific services via the Model Context Protocol (MCP).

```
User → CLI → CopeAgent (orchestrator)
                │
                ├── discover_capability → manifest lookup
                ├── spawn_specialist → single domain task
                └── spawn_parallel → multi-domain workflow
                         │
                         ↓
               Specialist Agents
                         │
                         ↓
               MCP Servers (Gmail, Slack, Notion, etc.)
```

**Key design principle**: The orchestrator never loads MCP tools directly. It uses a capability manifest (~800 tokens) for discovery, then spawns specialists who connect to specific MCP servers. This keeps the orchestrator lean and token-efficient.

## Installation

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run the CLI
npm start
```

## Usage

### CLI Mode

```bash
# Start interactive session
npm start

# Development mode (no build required)
npm run dev
```

### MCP Server Mode

COPE can run as an MCP server for integration with Claude Code:

```bash
npm run mcp           # production
npm run mcp:dev       # development
```

## Architecture

### Core Components

| Component | File | Purpose |
|-----------|------|---------|
| Orchestrator | `src/agent.ts` | Manages conversation, delegates to specialists |
| Spawn Tools | `src/tools/spawn.ts` | Creates specialist agent contexts |
| Discovery | `src/tools/discover.ts` | Matches queries to capabilities |
| Manifest | `src/core/manifest.ts` | Loads `config/capabilities.yaml` |
| MCP Client | `src/mcp/client.ts` | Connects to external MCP servers |
| MCP Registry | `src/mcp/registry.ts` | Server configurations |

### How It Works

1. **User sends message** → CopeAgent receives it
2. **Discovery** → `discover_capability` matches against trigger keywords
3. **Delegation** → `spawn_specialist` or `spawn_parallel` launches focused agents
4. **Execution** → Specialists connect to their MCP servers, execute tasks
5. **Aggregation** → Results return to orchestrator for final response

## Specialist Agents

Each specialist handles a specific domain with dedicated MCP connections.

| Agent | Domain | MCP Servers | Model |
|-------|--------|-------------|-------|
| `email-agent` | Gmail (Tatoma) | gmail-work | Sonnet |
| `calendar-agent` | Work + Home calendars | google-calendar-work, ical-home, magister | Sonnet |
| `slack-agent` | Tatoma workspace | slack-tatoma | Sonnet |
| `lifeos-agent` | Personal OS (Sanity CMS) | — | Sonnet |
| `notion-work-agent` | Tatoma wiki | notion-work | Sonnet |
| `lifelog-agent` | Omi wearable memories | omi | Sonnet |
| `school-agent` | Children's schedules | magister | Haiku |
| `miro-agent` | Diagrams & boards | miro | Sonnet |
| `finance-agent` | YNAB budget | ynab | Sonnet |
| `ics-sync-agent` | Credit card → YNAB | playwright, ynab | Sonnet |
| `cope-workflow-agent` | Multi-domain orchestration | — | Sonnet |

### Agent Structure

Each specialist in `src/agents/` follows this structure:

```
src/agents/email-agent/
├── index.ts      # Exports AgentDefinition
├── config.ts     # Model, MCP servers, max turns
└── prompt.md     # System prompt with domain knowledge
```

## Workflows

Workflows orchestrate multi-domain operations by spawning specialists in parallel.

### Daily Workflows

| Workflow | Triggers | Specialists |
|----------|----------|-------------|
| **Daily Briefing** | "what's on today", "good morning" | school, calendar, email, slack, lifeos, lifelog |
| **Daily Close** | "done for the day", "wrap up" | lifeos, lifelog |

### Weekly Workflows

| Workflow | Triggers | Specialists |
|----------|----------|-------------|
| **Week Start** | "week start", "monday planning" | lifeos, calendar |
| **Week Mid** | "week check", "wednesday check" | lifeos |
| **Week End** | "weekly review", "friday review" | lifeos, lifelog |
| **Budget Review** | "budget review", "budget check" | finance |

### Monthly Workflows

| Workflow | Triggers | Specialists |
|----------|----------|-------------|
| **Month Close** | "month close", "monthly review" | finance |

### COPE Phase Workflows

These are thinking frameworks with no specialists - pure coaching:

| Workflow | Triggers | Purpose |
|----------|----------|---------|
| **Clarify** | "clarify", "what's the real problem" | Define the real problem |
| **Organise** | "organize", "map the context" | Map constraints & dependencies |
| **Prioritise** | "prioritise", "too many options" | Decide what matters now |
| **Execute** | "execute", "next action" | Turn decisions into actions |

### LifeOS Workflows

| Workflow | Triggers | Purpose |
|----------|----------|---------|
| **Process Inbox** | "process inbox", "inbox zero" | Convert inbox items to tasks/goals/loops |

## Configuration

### Capability Manifest

`config/capabilities.yaml` defines domains, workflows, and trigger keywords:

```yaml
domains:
  email:
    description: "Email management for Tatoma"
    triggers: [inbox, unread, email, mail, send]
    specialist: email-agent
    mcp_servers: [gmail-work]

workflows:
  daily_briefing:
    description: "Morning routine"
    triggers: [briefing, "what's on today"]
    specialist: cope-workflow-agent
    parallel_tasks:
      - domain: school
        task: "Get dropoff/pickup times"
      - domain: calendar
        task: "Get today's events"
```

### MCP Server Registry

`src/mcp/registry.ts` configures external service connections:

| Server | Type | Service |
|--------|------|---------|
| `gmail-work` | npx (mcp-remote) | Gmail OAuth |
| `slack-tatoma` | npx (mcp-remote) | Slack workspace |
| `google-calendar-work` | npx (mcp-remote) | Google Calendar |
| `ical-home` | uv | iCloud calendars |
| `magister` | node | School schedules |
| `omi` | docker | Wearable memories |
| `notion-work` | npx (mcp-remote) | Notion workspace |
| `miro` | npx | Miro boards |
| `ynab` | node | Budget tracking |
| `playwright` | npx | Browser automation |

### Credentials

Credentials are stored in `~/.config/cope-agent/.env` and managed via the `/credentials` command.

### Identity

`config/identity.md` defines the agent's personality and response format.

## LifeOS Document Types

The `lifeos-agent` manages a personal operating system via Sanity CMS with these document types:

| Type | Purpose |
|------|---------|
| **Inbox** | Quick captures needing processing |
| **Task** | Actionable items with due dates |
| **Goal** | OKR-style hierarchical goals (yearly→quarterly→monthly→weekly) |
| **Project** | Container for grouping tasks, linked to goals |
| **Open Loop** | Things waiting on external parties |
| **Decision** | Important choices tracked for future reference |

## Development

```bash
# Build TypeScript
npm run build

# Development mode (tsx, no build)
npm run dev

# Type check only
npm run typecheck

# Run as MCP server
npm run mcp:dev
```

### Adding a New Specialist

1. Create folder in `src/agents/`:
   ```
   src/agents/new-agent/
   ├── index.ts
   ├── config.ts
   └── prompt.md
   ```

2. Add to registry in `src/agents/definitions.ts`

3. Add domain to `config/capabilities.yaml`:
   ```yaml
   domains:
     new_domain:
       triggers: [keyword1, keyword2]
       specialist: new-agent
       mcp_servers: [server-name]
   ```

4. If needed, add MCP server config to `src/mcp/registry.ts`

### Adding a New Workflow

1. Create workflow file in `src/workflows/`:
   ```typescript
   export const newWorkflow: WorkflowDefinition = {
     name: 'new-workflow',
     description: 'What it does',
     category: 'daily' | 'weekly' | 'cope-phase' | 'lifeos' | 'ad-hoc',
     triggers: ['trigger phrase', 'another trigger'],
     specialists: [
       { name: 'specialist-agent', task: 'What to do' }
     ],
     systemPrompt: `Instructions for orchestrating this workflow...`
   };
   ```

2. Add to registry in `src/workflows/index.ts`

3. Add to `config/capabilities.yaml`:
   ```yaml
   workflows:
     new_workflow:
       triggers: [trigger phrase]
       specialist: cope-workflow-agent
   ```

## Token Efficiency

The architecture prioritizes token efficiency:

- **Orchestrator context**: ~800 tokens (capability manifest only)
- **Full MCP schemas**: ~70,000 tokens (if loaded directly)
- **Savings**: ~98% reduction in orchestrator context

This is achieved by:
1. Manifest-based discovery instead of loading all tool schemas
2. Specialists only load their required MCP servers
3. Fresh, isolated contexts per specialist invocation

## License

Private - All rights reserved.
