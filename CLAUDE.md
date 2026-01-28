# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
# Build TypeScript to dist/ (also copies prompt.md files from agents)
npm run build

# Run in development mode (uses bun, no build required)
npm run dev

# Type check without emitting
npm run typecheck

# Run the CLI (production)
npm start

# Run as MCP server (for Claude Code integration)
npm run mcp           # production (from dist/)
npm run mcp:dev       # development (via tsx)

# Run as HTTP server (for external integrations)
npm run serve         # production
npm run serve:dev     # development

# Menubar app (Electron, macOS)
npm run menubar:install   # install dependencies
npm run menubar           # run in development
npm run menubar:dist      # build distributable

# Sanity Studio (LifeOS backend)
npm run studio            # run local studio
npm run studio:build      # build for deployment
```

## Architecture Overview

COPE (Clarify, Organise, Prioritise, Execute) is a personal executive assistant built on a hierarchical agent architecture.

### Core Pattern: Orchestrator + Specialist Agents

```
User → CLI (src/index.ts) → CopeAgent (orchestrator)
                               │
                               ├── discover_capability → manifest lookup
                               ├── spawn_specialist → single domain task
                               └── spawn_parallel → multi-domain workflow
                                        │
                                        ↓
                              Specialist Agents (src/agents/)
                                        │
                                        ↓
                              MCP Servers (external services)
```

**Key design principle**: The orchestrator stays lean by never loading MCP tools directly. It uses `config/capabilities.yaml` (~800 tokens) for discovery, then spawns specialists who connect to specific MCP servers for their domain.

### Key Files

- `src/agent.ts` - `CopeAgent` class: orchestrator that manages conversation and delegates to specialists
- `src/tools/spawn.ts` - `spawnSpecialist()`: creates fresh agent contexts with domain-specific MCP connections
- `src/tools/discover.ts` - Capability discovery against the YAML manifest
- `src/core/manifest.ts` - Loads and queries `config/capabilities.yaml`
- `src/mcp/client.ts` - MCP client connecting to external servers (stdio, SSE transports)
- `src/mcp/registry.ts` - MCP server configurations (gmail, slack, notion, calendar, etc.)

### Specialist Agents

Defined in `src/agents/`, each has:
- `systemPrompt` - domain-specific instructions
- `mcpServers` - list of required MCP servers
- `model` - preferred Claude model (haiku/sonnet/opus)

Specialists: `email-agent`, `calendar-agent`, `slack-agent`, `lifeos-agent`, `notion-work-agent`, `lifelog-agent`, `school-agent`, `miro-agent`, `finance-agent`, `ics-sync-agent`, `cope-workflow-agent`

### Workflows

Defined in `src/workflows/`, workflows orchestrate multi-domain operations:
- **Daily**: `daily-briefing`, `daily-close`
- **Weekly**: `week-start`, `week-mid`, `week-end`
- **Finance**: `budget-review`, `month-close`
- **COPE phases**: `clarify`, `organise`, `prioritise`, `execute`

The `cope-workflow-agent` handles workflow execution by spawning multiple specialists in parallel.

### Configuration

- `config/capabilities.yaml` - Domain triggers, MCP servers, constraints, workflows
- `config/identity.md` - Agent personality and response format
- `~/.config/cope-agent/.env` - User credentials (managed via `/credentials` command)

### MCP Server Integration

MCP servers are registered in `src/mcp/registry.ts`. Types supported:
- `npx` - npm packages (gmail, slack, notion via mcp-remote)
- `node` - local Node.js servers (magister)
- `docker` - Docker containers (omi)
- `uv` - Python uv packages (ical)
- `sse`/`http` - Remote HTTP servers

Tool names are namespaced as `serverName__toolName` when passed to specialists.

## Running Modes

### MCP Server Mode

The agent can run as an MCP server itself (for Claude Code integration):

```bash
npm run mcp
```

This exposes `discover_capability`, `spawn_specialist`, and `spawn_parallel` as MCP tools.

### HTTP Server Mode

For external integrations via REST API:

```bash
npm run serve
```

### Menubar App

A macOS Electron menubar app that provides quick access to the agent. Located in `menubar-app/`. The app bundles the HTTP server and provides:
- Quick text input via menubar icon
- Launch options for Terminal/iTerm
- Countdown timer feature

## Adding New Components

### Adding a Specialist Agent

1. Create folder `src/agents/{name}-agent/` with:
   - `index.ts` - exports `AgentDefinition`
   - `config.ts` - model, MCP servers, max turns, utility tools
   - `prompt.md` - system prompt with domain knowledge

2. Register in `src/agents/definitions.ts`

3. Add domain to `config/capabilities.yaml` with triggers and MCP servers

4. If new MCP server needed, add config to `src/mcp/registry.ts`

### Adding a Workflow

1. Create workflow in `src/workflows/` implementing `WorkflowDefinition`

2. Register in `src/workflows/index.ts`

3. Add to `config/capabilities.yaml` under `workflows:` with triggers
