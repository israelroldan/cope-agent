# COPE Agent - MCPB Bundle

This document describes how to build, install, and configure the COPE Agent as an MCP Bundle (MCPB) for use with Claude Desktop and other MCPB-compatible applications.

## Overview

COPE Agent is a personal AI executive assistant built on a hierarchical agent architecture. The MCPB bundle provides three core tools:

| Tool | Description |
|------|-------------|
| `discover_capability` | Query available capabilities to find the right specialist |
| `spawn_specialist` | Launch a domain-specific subagent |
| `spawn_parallel` | Run multiple specialists concurrently |

## Building the Bundle

### Prerequisites

- Node.js >= 20.0.0
- npm

### Build Steps

```bash
# Install dependencies
npm install

# Build and create MCPB bundle
npm run bundle
```

This creates `cope-agent.mcpb` - a ZIP archive containing:
- `manifest.json` - MCPB v0.3 manifest
- `dist/` - Compiled server code
- `config/` - Capabilities and identity configuration
- `node_modules/` - Production dependencies
- `package.json` - Minimal package metadata

### Other Commands

```bash
# Clean bundle artifacts
npm run bundle:clean

# Validate manifest only
npm run bundle:validate

# Run MCPB server in development mode
npm run mcpb:dev

# Run compiled MCPB server
npm run mcpb
```

## Installation

### Claude Desktop

1. Open Claude Desktop settings
2. Navigate to the Extensions section
3. Drag `cope-agent.mcpb` into the extensions area
4. Configure the required credentials (see below)

### Manual Installation

Extract the bundle and add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "cope-agent": {
      "command": "node",
      "args": ["/path/to/bundle/dist/mcpb-server.js"],
      "env": {
        "ANTHROPIC_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Configuration

### Required Settings

| Setting | Description |
|---------|-------------|
| `anthropic_api_key` | Anthropic API key for spawning specialist agents |

### Optional Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `anthropic_auth_token` | Alternative auth token for proxies | - |
| `anthropic_base_url` | Custom API endpoint URL | - |
| `slack_token` | Slack bot token (xoxb-...) | - |
| `magister_user` | Magister username | - |
| `magister_pass` | Magister password | - |
| `magister_school` | Magister school ID | `sintlucas-vmbo` |
| `omi_api_key` | Omi wearable API key | - |
| `ynab_api_token` | YNAB API token | - |
| `debug_mode` | Enable debug logging | `false` |

## Available Specialists

The following specialist agents can be spawned:

| Specialist | Domain | MCP Servers |
|------------|--------|-------------|
| `email-agent` | Email management | gmail-work |
| `calendar-agent` | Calendar/scheduling | google-calendar-work, ical-home, magister |
| `slack-agent` | Slack workspace | slack-tatoma |
| `notion-personal-agent` | Personal LifeOS | notion-personal |
| `notion-work-agent` | Work Notion | notion-work |
| `lifelog-agent` | Omi wearable | omi |
| `school-agent` | School schedules | magister |
| `miro-agent` | Miro boards | miro |
| `finance-agent` | YNAB budgets | ynab |
| `cope-workflow-agent` | Multi-domain workflows | (spawns sub-specialists) |

## Workflows

Multi-domain workflows orchestrated by `cope-workflow-agent`:

### Daily
- `daily_briefing` - Morning routine: school, calendar, email, slack, priorities
- `daily_close` - End-of-day: capture decisions, review progress

### Weekly
- `week_start` - Monday planning: priorities, focus for the week
- `week_mid` - Wednesday check-in: course correct
- `week_end` - Friday review: wins, learnings, carries

### Finance
- `budget_review` - Weekly budget check-in
- `month_close` - Monthly financial review

### COPE Phases
- `clarify` - Define the real problem
- `organise` - Map constraints and context
- `prioritise` - Decide what matters now
- `execute` - Turn decisions into action

## Usage Examples

### Discover Capabilities

```
Use discover_capability with query "check my email" to find the email-agent
```

### Spawn a Specialist

```
Use spawn_specialist with:
- specialist: "calendar-agent"
- task: "What meetings do I have today?"
```

### Run Parallel Workflow

```
Use spawn_parallel with tasks:
- { specialist: "email-agent", task: "Summarize unread emails" }
- { specialist: "calendar-agent", task: "Get today's schedule" }
- { specialist: "slack-agent", task: "Check #founders-talk" }
```

## Security Notes

- All credentials are passed via environment variables from MCPB configuration
- No credentials are stored in the bundle itself
- API keys and passwords are marked as `sensitive` in the manifest
- Error messages are sanitized to prevent credential leakage
- Tool execution has configurable timeouts (default: 5 minutes)

## Troubleshooting

### Enable Debug Mode

Set `debug_mode` to `true` in the extension settings to see detailed logs.

### Common Issues

**"No Anthropic API key configured"**
- Ensure `anthropic_api_key` is set in extension settings

**"Unknown specialist"**
- Check the specialist name matches one in the Available Specialists table

**"Unable to connect to required services"**
- The required MCP servers for a specialist may not be configured
- Check that the necessary credentials are set for that domain

### Log Location

Logs are written to stderr. In Claude Desktop, check the application logs for output.

## Development

### Project Structure

```
cope-agent/
├── manifest.json        # MCPB manifest (v0.3)
├── src/
│   ├── mcpb-server.ts   # MCPB entry point
│   ├── mcp-server.ts    # Original MCP server
│   ├── tools/
│   │   ├── discover.ts  # Capability discovery
│   │   └── spawn.ts     # Specialist spawning
│   └── agents/          # Specialist definitions
├── config/
│   ├── capabilities.yaml
│   └── identity.md
└── scripts/
    ├── bundle.sh        # Bundle creation
    └── validate-manifest.js
```

### Local Testing

```bash
# Run server directly (development)
npm run mcpb:dev

# In another terminal, test with MCP inspector or similar tool
```

## License

MIT
