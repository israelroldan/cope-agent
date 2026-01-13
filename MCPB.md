# COPE Agent - MCP Integration

This document describes how to connect COPE Agent to Claude Desktop or Claude Code.

## Connection Methods

There are two ways to connect COPE Agent:

| Method | Full Specialist Access | Setup Complexity |
|--------|----------------------|------------------|
| **HTTP Server (Recommended)** | Yes | Run server + configure client |
| **MCPB Bundle** | Limited | Install bundle only |

---

## Method 1: HTTP Server (Recommended)

This method provides **full access** to all specialists and local MCP servers (Gmail, Calendar, Slack, Notion, etc.).

### Step 1: Start the HTTP Server

```bash
# From the cope-agent directory
npm run serve

# Or for development with auto-reload
npm run serve:dev

# Custom port
PORT=8080 npm run serve
```

The server runs on `http://localhost:3847` by default.

### Step 2: Configure Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cope-agent": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3847/mcp"]
    }
  }
}
```

### Step 3: Configure Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "cope-agent": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3847/mcp"]
    }
  }
}
```

Or use the CLI:

```bash
claude mcp add cope-agent -- npx -y mcp-remote http://localhost:3847/mcp
```

### Running as a Background Service (macOS)

To run cope-agent automatically on login:

```bash
# Create LaunchAgent
cat > ~/Library/LaunchAgents/com.cope-agent.server.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cope-agent.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>$(which node)</string>
        <string>$(pwd)/dist/http-server.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$(pwd)</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/cope-agent.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/cope-agent.error.log</string>
</dict>
</plist>
EOF

# Start the service
launchctl load ~/Library/LaunchAgents/com.cope-agent.server.plist

# Check status
launchctl list | grep cope-agent

# Stop the service
launchctl unload ~/Library/LaunchAgents/com.cope-agent.server.plist
```

---

## Method 2: MCPB Bundle (Limited)

The MCPB bundle is a standalone package but has **limitations** - specialists cannot connect to local MCP servers (Gmail, Slack, etc.) because those require local processes and OAuth flows.

**Use this only for:**
- `discover_capability` - Query what specialists/workflows are available
- Testing the bundle format

### Building the Bundle

```bash
npm install
npm run bundle
```

Creates `cope-agent.mcpb` containing:
- `manifest.json` - MCPB v0.3 manifest
- `dist/` - Compiled server
- `config/` - Capabilities and identity
- `node_modules/` - Dependencies

### Installing in Claude Desktop

1. Open Claude Desktop settings
2. Navigate to Extensions
3. Drag `cope-agent.mcpb` into the extensions area
4. Configure the Anthropic Auth Token when prompted

### Bundle Commands

```bash
npm run bundle        # Build the bundle
npm run bundle:clean  # Remove bundle artifacts
npm run bundle:validate  # Validate manifest
npm run mcpb:dev      # Run MCPB server in dev mode
```

---

## Tools Reference

| Tool | Description |
|------|-------------|
| `discover_capability` | Find the right specialist for a task |
| `spawn_specialist` | Launch a domain-specific subagent |
| `spawn_parallel` | Run multiple specialists concurrently |

## Available Specialists

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
- `daily_briefing` - Morning: school, calendar, email, slack, priorities
- `daily_close` - End-of-day: decisions, progress review

### Weekly
- `week_start` - Monday planning
- `week_mid` - Wednesday check-in
- `week_end` - Friday review

### Finance
- `budget_review` - Weekly budget check-in
- `month_close` - Monthly financial review

### COPE Phases
- `clarify` - Define the real problem
- `organise` - Map constraints and context
- `prioritise` - Decide what matters now
- `execute` - Turn decisions into action

## Configuration

### Environment Variables

Set these in `~/.config/cope-agent/.env` or pass via the HTTP server environment:

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_AUTH_TOKEN` | Auth token for spawning specialists | Yes |
| `SLACK_MCP_XOXB_TOKEN` | Slack bot token | For slack-agent |
| `MAGISTER_USER` | Magister username | For school-agent |
| `MAGISTER_PASS` | Magister password | For school-agent |
| `OMI_API_KEY` | Omi API key | For lifelog-agent |
| `YNAB_API_TOKEN` | YNAB API token | For finance-agent |

### Managing Credentials

```bash
# Interactive CLI
npm start
/credentials list
/credentials set ANTHROPIC_AUTH_TOKEN your-token
```

## Usage Examples

### Discover Capabilities

```
Use discover_capability with query "check my email"
→ Returns: email-agent with gmail-work MCP
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

## Troubleshooting

### HTTP Server Issues

**Server won't start:**
```bash
# Check if port is in use
lsof -i :3847

# Try a different port
PORT=3848 npm run serve
```

**mcp-remote connection fails:**
```bash
# Test server is running
curl http://localhost:3847/health

# Check mcp-remote version
npx mcp-remote --version
```

### MCPB Bundle Issues

**"Unable to connect to required services"**
- This is expected - the bundle can't access local MCP servers
- Use the HTTP server method instead for full functionality

**"Invalid JSON-RPC message" errors**
- The bundle suppresses all console output to avoid this
- If you see this, rebuild: `npm run bundle`

## Development

### Project Structure

```
cope-agent/
├── src/
│   ├── http-server.ts   # HTTP MCP server (recommended)
│   ├── mcpb-server.ts   # MCPB bundle server (limited)
│   ├── mcp-server.ts    # Stdio MCP server
│   ├── tools/
│   │   ├── discover.ts  # Capability discovery
│   │   └── spawn.ts     # Specialist spawning
│   └── agents/          # Specialist definitions
├── config/
│   ├── capabilities.yaml
│   └── identity.md
├── manifest.json        # MCPB manifest
└── scripts/
    ├── bundle.sh
    └── validate-manifest.js
```

### Testing

```bash
# Test HTTP server
npm run serve:dev
curl http://localhost:3847/health

# Test MCPB server
npm run mcpb:dev
```

## License

MIT
