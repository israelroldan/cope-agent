# Config Externalization Plan

## Goal
Move hardcoded configurations from TypeScript to external YAML/Markdown files for easier editing without code changes.

---

## Improvements

### 1. MCP Registry → YAML

**Current**: `src/mcp/registry.ts` - 280 lines of TypeScript with server configs
**Target**: `config/mcp-servers.yaml` + thin TypeScript loader

```yaml
# config/mcp-servers.yaml
gmail-work:
  type: npx
  command: npx
  args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp']
  displayName: Gmail (Work)
  authType: auto
  authPaths: ['~/.gmail-mcp']
  authNotes: Browser opens on first use

slack-tatoma:
  type: npx
  command: npx
  args: ['-y', 'slack-mcp-server@latest', '--transport', 'stdio']
  displayName: Slack (Tatoma)
  authType: env
  authEnvVars: [SLACK_MCP_XOXB_TOKEN]
  env:
    SLACK_MCP_XOXB_TOKEN: ${SLACK_MCP_XOXB_TOKEN}
    SLACK_MCP_ADD_MESSAGE_TOOL: 'true'

ynab:
  type: node
  command: ${MCP_YNAB_PATH}  # Resolved from env or default
  displayName: YNAB (Budget)
  authType: env
  authEnvVars: [YNAB_API_TOKEN]
  env:
    YNAB_API_KEY: ${YNAB_API_TOKEN}
  slowStartup: true
```

**Loader** (`src/mcp/registry.ts` becomes ~50 lines):
```typescript
import { load } from 'yaml';
import { readFileSync } from 'fs';

const raw = readFileSync('config/mcp-servers.yaml', 'utf-8');
const configs = load(raw) as Record<string, McpServerConfig>;

// Resolve ${VAR} placeholders from process.env
function resolveEnv(obj: unknown): unknown { ... }

export function getMcpServerConfig(name: string): McpServerConfig | undefined {
  return resolveEnv(configs[name]);
}
```

**Complexity**: Medium - need env var interpolation for `${VAR}` syntax

---

### 2. Workflows → YAML

**Current**: `src/workflows/*.ts` - TypeScript files with workflow definitions
**Target**: `config/workflows.yaml` + executor in code

```yaml
# config/workflows.yaml
daily-briefing:
  type: data-gathering
  description: Morning overview of the day ahead
  triggers:
    - "what's on today"
    - "morning briefing"
    - "daily briefing"
  spawn:
    - specialist: school-agent
      task: Get dropoff/pickup times for today
    - specialist: calendar-agent
      task: Get today's events and meetings
    - specialist: email-agent
      task: Check inbox, flag VIP emails
    - specialist: slack-agent
      task: Check overnight activity
    - specialist: notion-personal-agent
      task: Get priorities and open loops
    - specialist: lifelog-agent
      task: Get overnight conversations
  output:
    emoji: ☀️
    sections: [school, calendar, email, slack, priorities, lifelog]
    closing: "🎯 THE ONE THING: [What makes today successful?]"

budget-review:
  type: data-gathering
  description: Weekly budget check
  triggers:
    - "budget review"
    - "spending check"
  spawn:
    - specialist: finance-agent
      task: Analyze this week's spending vs budget, flag overspending
  output:
    emoji: 💰

clarify:
  type: thinking
  description: COPE phase - define the real problem
  triggers:
    - "help me clarify"
    - "what's the real problem"
  questions:
    - What exactly is the problem?
    - What does success look like?
    - What assumptions am I making?
```

**Complexity**: Medium - need to handle two workflow types (data-gathering vs thinking)

---

### 3. LifeOS Databases → Config

**Current**: Hardcoded in `src/agents/cope-workflow-agent/template-utils.ts`
**Target**: `config/lifeos.yaml`

```yaml
# config/lifeos.yaml
databases:
  tasks: 1a2b3c4d-...
  notes: 2b3c4d5e-...
  goals: 3c4d5e6f-...
  journal: 4d5e6f7g-...
  decisions: 5e6f7g8h-...

# Can add other LifeOS-specific config here later
```

**Complexity**: Low - just move constants to YAML

---

### 4. Agent Descriptions from Frontmatter

**Current**: Description duplicated in `index.ts`
**Target**: Single source in `prompt.md` frontmatter

```markdown
---
description: Email management for Tatoma work Gmail. Use for inbox, send, draft, search, organize emails.
---

You are the email specialist for Israel's work Gmail...
```

**Loader update**:
```typescript
// src/agents/email-agent/index.ts
const content = readFileSync(join(__dirname, 'prompt.md'), 'utf-8');
const { data: frontmatter, content: systemPrompt } = parseFrontmatter(content);

export const emailAgent: AgentDefinition = {
  name: 'email-agent',
  description: frontmatter.description,
  systemPrompt,
  ...config,
};
```

**Complexity**: Low - add `gray-matter` package for frontmatter parsing

---

## Implementation Order

1. **LifeOS Databases** (Low effort, immediate win)
2. **Agent Frontmatter** (Low effort, reduces duplication)
3. **MCP Registry** (Medium effort, big maintainability win)
4. **Workflows** (Medium effort, enables non-code workflow changes)

---

## Dependencies

| Improvement | New Package |
|-------------|-------------|
| Frontmatter | `gray-matter` |
| YAML (already have) | `yaml` |

---

## Trade-offs

**Pros:**
- Edit configs without touching TypeScript
- Easier to understand at a glance
- Non-developers can tweak prompts/workflows
- Configs can be version-controlled separately

**Cons:**
- Lose TypeScript type checking on configs (mitigate with runtime validation)
- Two places to look (code + config)
- Env var interpolation adds complexity

---

## Validation Strategy

For YAML configs, add runtime validation on load:
```typescript
import { z } from 'zod';

const McpServerSchema = z.object({
  type: z.enum(['docker', 'node', 'npx', 'uv', 'sse', 'http']),
  command: z.string().optional(),
  // ...
});

// Validate on startup, fail fast if config is invalid
```

---

## Not Doing

- **capabilities.yaml** - Already externalized, working well
- **identity.md** - Already markdown
- **Agent configs (model/mcpServers)** - Keep in TypeScript for type safety, rarely change
