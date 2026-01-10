# Finance Agent Implementation Plan

## Overview

Add a `finance-agent` specialist to cope-agent that connects to YNAB via MCP, providing financial coaching, budget management, and transaction entry through natural conversation.

**User's situation**: YNAB account exists with accounts defined, but no bank connections or budget configured yet. Wants help making YNAB less overwhelming.

---

## YNAB MCP Server Choice

**Recommended**: `@calebl/ynab-mcp-server` (npx-based)

**Why**: Best tool coverage for coaching use case:
- `ListBudgets` - Select active budget
- `BudgetSummary` - Shows underfunded categories and low accounts (key for coaching)
- `GetUnapprovedTransactions` - Review pending items
- `CreateTransaction` - Log purchases via conversation
- `ApproveTransaction` - Confirm transactions

**Setup**: `npx -y @smithery/cli install @calebl/ynab-mcp-server --client claude`

**Required credential**: `YNAB_API_TOKEN` (from YNAB Developer Settings)

---

## Files to Create/Modify

### 1. Create `src/agents/finance-agent.ts`

```typescript
import type { AgentDefinition } from './types.js';

export const financeAgent: AgentDefinition = {
  name: 'finance-agent',
  description: 'Financial coaching and YNAB budget management',
  mcpServers: ['ynab'],
  model: 'sonnet',
  systemPrompt: `You are Israel's financial coach, helping him build better money habits through YNAB.

## Your Approach

1. **Supportive, not judgmental** - Past decisions are learning opportunities
2. **Use real data** - Always pull from YNAB before giving advice
3. **Educate while helping** - Explain the 'why' behind recommendations
4. **Be specific** - Use exact numbers, not vague advice like "spend less"
5. **Celebrate progress** - Acknowledge wins, even small ones

## Context

- Currency: EUR (€)
- Banks: Bunq (daily), ABN AMRO (savings), ICS (credit card)
- YNAB Status: Setting up - help configure budget and categories

## Available Operations

- **Budget Overview**: Check category funding, account balances
- **Transaction Entry**: Log purchases ("spent €45 at Albert Heijn")
- **Review Pending**: Check and approve unapproved transactions
- **Spending Analysis**: Identify patterns and provide coaching

## Response Format

Keep responses concise for terminal. Use structure when helpful:

💰 **Balances**: Quick account summary
📊 **Budget Status**: Category health
⚠️ **Attention**: Items needing action
💡 **Insight**: Coaching observation

## YNAB Onboarding Help

Since budget isn't fully configured yet, help Israel:
1. Set up meaningful categories (groceries, restaurants, transport, subscriptions, etc.)
2. Assign realistic amounts based on spending patterns
3. Understand YNAB's "give every euro a job" philosophy
4. Build the habit of regular check-ins`,
};
```

### 2. Modify `src/agents/definitions.ts`

Add import and registration:
```typescript
import { financeAgent } from './finance-agent.js';

// In agentDefinitions record:
'finance-agent': financeAgent,
```

### 3. Add to `config/capabilities.yaml`

```yaml
  finance:
    description: "Financial coaching and YNAB budget management"
    triggers:
      - finance
      - budget
      - money
      - spending
      - ynab
      - expenses
      - savings
      - accounts
      - balance
      - transaction
      - category
      - underfunded
    specialist: finance-agent
    mcp_servers:
      - ynab
    workflows:
      - BudgetReview
      - LogTransaction
      - SpendingAnalysis
```

### 4. Add to `src/mcp/registry.ts`

```typescript
'ynab': {
  name: 'ynab',
  description: 'YNAB budget management',
  type: 'npx',
  command: 'npx',
  args: ['-y', '@calebl/ynab-mcp-server'],
  envBuilder: () => ({
    YNAB_API_TOKEN: process.env.YNAB_API_TOKEN ?? '',
  }),
},
```

### 5. Update `src/config/credentials.ts`

Add YNAB to `KNOWN_CREDENTIALS` record:
```typescript
YNAB_API_TOKEN: 'YNAB API token for finance MCP (from Developer Settings)',
```

---

## Implementation Order

1. **Add MCP server config** (`src/mcp/registry.ts`)
2. **Add credential definition** (`src/config/credentials.ts`)
3. **Create agent definition** (`src/agents/finance-agent.ts`)
4. **Register agent** (`src/agents/definitions.ts`)
5. **Add domain to manifest** (`config/capabilities.yaml`)

---

## Verification

1. **Build**: `npm run build`
2. **Set credential**: Start CLI, run `/credentials set YNAB_API_TOKEN <token>`
3. **Test discovery**: Ask "check my budget" - should route to finance-agent
4. **Test MCP connection**: Agent should list budgets via YNAB MCP
5. **Test coaching**: Ask "how am I doing financially?" - should provide budget summary

---

## Future Enhancements (not in scope)

- Financial workflows (weekly budget review, month-end close)
- Integration with daily briefing (user explicitly said no for now)
- Direct bank integrations (Bunq API) alongside YNAB
- Goal tracking and progress visualization
