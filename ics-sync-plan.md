# ICS Credit Card Sync: Implementation Plan

## Problem Statement

ICS (International Card Services) is a major Dutch credit card provider that lacks:
- Official API access for consumers
- Integration with YNAB or other budgeting tools
- PSD2/Open Banking aggregator support (GoCardless, Tink, etc.)

Currently, the only way to get transaction data is:
1. Manual login to https://www.icscards.nl (requires 2FA via app/SMS)
2. Navigate to transaction history
3. Manually copy or use browser extensions to export

This creates friction in the financial workflow, leaving credit card transactions outside YNAB until manually entered.

## Solution Overview

Build a dedicated **ics-sync-agent** that:
1. Uses Microsoft's Playwright MCP to control a headed browser
2. Opens ICS login page (user handles 2FA manually)
3. Scrapes transaction data once authenticated
4. Pushes transactions to YNAB as unapproved
5. Exits cleanly

The finance-agent remains focused on coaching, analysis, and categorization.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER TRIGGERS                                │
│                                                                      │
│   "sync my ics"  /  "import credit card"  /  "sync transactions"    │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        ORCHESTRATOR                                  │
│                                                                      │
│   Matches triggers → spawns ics-sync-agent                          │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       ICS-SYNC-AGENT                                 │
│                                                                      │
│   Specialist: Single responsibility                                  │
│   Model: sonnet (needs reasoning for page navigation)                │
│   MCP Servers: playwright, ynab                                      │
│                                                                      │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │  STEP 1: Navigate to ICS login                              │   │
│   │  STEP 2: Wait for user to complete 2FA                      │   │
│   │  STEP 3: Navigate to transaction history                    │   │
│   │  STEP 4: Extract transactions (payee, amount, date)         │   │
│   │  STEP 5: Push to YNAB as unapproved transactions            │   │
│   │  STEP 6: Report summary and close browser                   │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    TRANSACTIONS IN YNAB                              │
│                                                                      │
│   Status: Unapproved                                                 │
│   Ready for: finance-agent to help categorize                        │
└─────────────────────────────────────────────────────────────────────┘
```

## Separation of Concerns

| Agent | Responsibilities | MCP Servers |
|-------|------------------|-------------|
| **ics-sync-agent** | Browser automation, ICS navigation, transaction extraction, YNAB import | playwright, ynab |
| **finance-agent** | Budget coaching, spending analysis, transaction categorization, financial advice | ynab |

This keeps each agent sharp and focused on its domain.

## Technical Details

### Playwright MCP Server

Microsoft's official Playwright MCP (`@playwright/mcp`) provides browser automation via the Model Context Protocol.

**Key configuration options:**
```json
{
  "command": "npx",
  "args": [
    "-y", "@playwright/mcp@latest",
    "--headless=false",
    "--user-data-dir=/Users/israel/.config/cope-agent/ics-browser-profile",
    "--browser=chromium"
  ]
}
```

| Option | Value | Purpose |
|--------|-------|---------|
| `--headless=false` | visible browser | User can see login, complete 2FA |
| `--user-data-dir=<path>` | persistent profile | Cookies/sessions saved between runs |
| `--browser=chromium` | Chrome | Best compatibility with ICS portal |

**Available Playwright MCP tools:**
- `browser_navigate` - Navigate to URL
- `browser_click` - Click elements
- `browser_type` - Type text into inputs
- `browser_snapshot` - Get page accessibility tree
- `browser_wait` - Wait for conditions
- `browser_close` - Close browser

### ICS Portal Structure (to be validated)

Based on research and common patterns:

```
https://www.icscards.nl/sca-login
├── Login page
│   ├── Username/email input
│   ├── Password input
│   └── Submit → triggers 2FA
│
├── 2FA verification (app push or SMS)
│   └── User approves on phone
│
└── Dashboard (post-login)
    └── Mijn ICS → Overzicht → Transacties
        ├── Transaction list
        │   ├── Date
        │   ├── Description/Payee
        │   ├── Amount
        │   └── Category (if any)
        └── Pagination/date range filters
```

**Note:** Actual structure needs validation by navigating the portal. Session timeout is reportedly ~1 minute of inactivity.

### Transaction Data Model

```typescript
interface ICSTransaction {
  date: string;           // YYYY-MM-DD
  payee: string;          // Merchant name
  amount: number;         // Negative for purchases
  originalCurrency?: string;  // If foreign transaction
  originalAmount?: number;
}

// Maps to YNAB CreateTransaction
interface YNABTransaction {
  account_id: string;     // ICS credit card account in YNAB
  date: string;           // YYYY-MM-DD
  amount: number;         // In milliunits (€10.50 = -10500)
  payee_name: string;
  memo?: string;
  import_id: string;      // For deduplication
  approved: false;        // Always unapproved for review
}
```

### Deduplication Strategy

To prevent duplicate imports, generate stable `import_id`:

```typescript
// Format: ICS:{date}:{amount}:{payee_hash}
const importId = `ICS:${date}:${amount}:${hash(payee).slice(0, 8)}`;
```

YNAB will reject transactions with duplicate `import_id`, making re-runs safe.

## MCP Registry Addition

Add to `src/mcp/registry.ts`:

```typescript
'playwright': {
  name: 'playwright',
  description: 'Browser automation via Playwright',
  type: 'npx',
  command: 'npx',
  args: [
    '-y', '@playwright/mcp@latest',
    '--headless=false',
    '--user-data-dir=/Users/israel/.config/cope-agent/ics-browser-profile',
    '--browser=chromium',
  ],
  displayName: 'Playwright (Browser)',
  authType: 'none',
  authNotes: 'No auth required - browser handles site logins',
},
```

## Agent Definition

### Directory Structure

```
src/agents/ics-sync-agent/
├── index.ts      # Agent definition export
├── config.ts     # Model and MCP servers
└── prompt.md     # System prompt
```

### System Prompt (prompt.md)

```markdown
You are a specialist agent for syncing ICS credit card transactions to YNAB.

## Your Single Responsibility

Import transactions from icscards.nl into YNAB. You are NOT a financial coach - that's the finance-agent's job.

## Workflow

### Step 1: Open ICS Login
- Navigate to https://www.icscards.nl/sca-login
- Wait for the login page to load

### Step 2: Guide User Through Login
- Inform the user: "Please log in to ICS. I can see the login page."
- If you detect the user is on the 2FA screen, say: "Please approve the login on your ICS app or enter the SMS code."
- Wait for successful authentication (you'll see the dashboard)

### Step 3: Navigate to Transactions
- Go to Mijn ICS → Overzicht or the transactions page
- Look for "Transacties" or "Overzicht"

### Step 4: Extract Transactions
- Read the transaction list from the page
- For each transaction, extract:
  - Date
  - Payee/Description
  - Amount (in EUR)
- Note: Only extract transactions since the last sync (or last 30 days on first run)

### Step 5: Push to YNAB
- Use the YNAB MCP to create transactions
- Account: ICS credit card account
- Set approved: false (finance-agent will help categorize)
- Use import_id format: ICS:{date}:{amount}:{payee_hash}

### Step 6: Report and Close
- Summarize: "Imported X transactions to YNAB"
- List any that were skipped (duplicates)
- Close the browser

## Important Notes

- The user MUST handle 2FA manually - you cannot bypass it
- Session expires quickly (~1 min idle) - work efficiently
- If you encounter errors, describe what you see on screen
- All amounts are in EUR (€)
- Transactions should be imported as NEGATIVE amounts (credit card spending)

## YNAB Context

- Budget: [Will be discovered via ListBudgets]
- Account: ICS credit card account (ask user if unclear)
- Default category: Leave uncategorized (finance-agent handles this)

## What You Are NOT

- You are NOT a financial advisor
- You do NOT categorize transactions
- You do NOT analyze spending
- You simply import data - finance-agent does the rest
```

### Config (config.ts)

```typescript
export const config: Pick<AgentDefinition, 'model' | 'mcpServers'> = {
  model: 'sonnet',  // Needs reasoning for page navigation
  mcpServers: ['playwright', 'ynab'],
};
```

## Capabilities Manifest Update

Add to `config/capabilities.yaml`:

```yaml
ics_sync:
  description: "ICS credit card transaction sync to YNAB"
  triggers:
    - ics sync
    - sync ics
    - import ics
    - credit card sync
    - sync credit card
    - import credit card
    - sync transactions
    - ics import
  specialist: ics-sync-agent
  mcp_servers:
    - playwright
    - ynab
  workflows:
    - SyncTransactions
```

## Implementation Phases

### Phase 1: Foundation
- [ ] Add Playwright MCP to registry (`src/mcp/registry.ts`)
- [ ] Create ics-sync-agent directory structure
- [ ] Write initial system prompt
- [ ] Add agent to definitions registry
- [ ] Add triggers to capabilities.yaml
- [ ] Test Playwright MCP connection independently

### Phase 2: ICS Portal Navigation
- [ ] Research actual ICS portal structure (login flow, pages)
- [ ] Implement login page navigation
- [ ] Handle 2FA wait state (detect when user completes it)
- [ ] Navigate to transactions page
- [ ] Handle pagination/date filters

### Phase 3: Transaction Extraction
- [ ] Parse transaction table from accessibility tree
- [ ] Extract date, payee, amount fields
- [ ] Handle edge cases (foreign transactions, pending, etc.)
- [ ] Implement date range filtering (since last sync)

### Phase 4: YNAB Integration
- [ ] Discover budget and ICS account
- [ ] Map ICS transactions to YNAB format
- [ ] Implement import_id generation for deduplication
- [ ] Push transactions as unapproved
- [ ] Handle API errors gracefully

### Phase 5: Polish
- [ ] Store last sync date for incremental imports
- [ ] Add session recovery (if browser crashes)
- [ ] Improve error messages
- [ ] Test full flow end-to-end
- [ ] Document usage in README

## Future Enhancements

### Scheduled Sync
- Run sync automatically (daily/weekly)
- Use persistent browser profile to reduce 2FA frequency
- Notify user only when new transactions imported

### Smart Categorization Pipeline
After import, automatically trigger finance-agent:
```
ics-sync-agent completes
    → "12 new transactions imported"
    → Automatically spawn finance-agent
    → "I see 12 new transactions. Let's categorize them..."
```

### Multi-Card Support
If user has multiple ICS cards, support selecting which to sync.

### Statement Download
Instead of scraping transaction list, download PDF/CSV statement and parse.

### Balance Verification
After sync, verify YNAB balance matches ICS reported balance.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ICS changes website structure | Medium | High | Accessibility tree approach is more resilient than CSS selectors; prompt can be updated |
| 2FA blocks automation | Certain | N/A | By design - user handles 2FA manually |
| Session expires mid-scrape | Medium | Medium | Work efficiently, handle gracefully |
| Rate limiting | Low | Medium | Only runs on user request, not automated |
| YNAB API errors | Low | Low | Standard error handling, retry logic |

## Testing Strategy

1. **Manual walkthrough**: Navigate ICS portal manually, document structure
2. **Playwright MCP test**: Verify browser control works in headed mode
3. **Partial flow**: Test login → dashboard navigation without full import
4. **Mock YNAB**: Test transaction creation with test budget
5. **Full integration**: End-to-end with real ICS login and YNAB

## Dependencies

- `@playwright/mcp` - Microsoft's official Playwright MCP server
- Existing `ynab` MCP server (already configured)
- User's ICS account credentials (handled via browser)
- User's YNAB budget with ICS credit card account

## Open Questions

1. **Persistent session**: How long does ICS session last in persistent profile? Can we avoid 2FA on every run?
2. **Transaction history depth**: How far back can we access? Only current statement or historical?
3. **Pending transactions**: Does ICS show pending transactions? Should we import them?
4. **Multiple cards**: Does user have multiple ICS cards? Need card selection?

---

## Appendix: Research Links

- [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp)
- [ICS Portal](https://www.icscards.nl/sca-login)
- [ICS-Exporter userscript](https://github.com/IeuanK/ICS-Exporter) - Reference for page structure
- [ics-cards-downloadstatements](https://github.com/sietsevdschoot/ics-cards-downloadstatements) - API approach reference
- [YNAB API - Create Transaction](https://api.ynab.com/v1#/Transactions/createTransaction)
