# Improvement Ideas

## General COPE Improvements

### Dynamic Specialist Lists in spawn.ts

**Problem:** The `spawn.ts` tool has hardcoded lists of specialists in three places:
1. Error message (line ~111)
2. Tool description (lines ~331-342)
3. Specialist enum (lines ~352-364)

When adding a new specialist, you must update all three manually. Easy to forget.

**Solution:** Generate these dynamically from `agentDefinitions`:

```typescript
import { agentDefinitions, listAgents } from '../agents/definitions.js';

const availableSpecialists = Object.keys(agentDefinitions).join(', ');
const specialistEnum = Object.keys(agentDefinitions);
const specialistDescriptions = listAgents()
  .map(a => `- ${a.name}: ${a.description}`)
  .join('\n');
```

---

## ICS Sync Improvements

### ✅ Batch Transaction Import (DONE)

**Status:** Implemented

Added `create_transactions_batch` to YNAB MCP. All transactions now import in a single API call, avoiding rate limits.

---

### Network Request Interception (Speed Optimization)

**Status:** Attempted, deferred (compatibility issues)

**Problem:** Scraping the ICS site via accessibility tree / DOM is slow. Each page snapshot takes time.

**Observation:** ICS makes XHR/API calls that return structured JSON transaction data.

**Solution:** Use `playwright-min-network-mcp` to:
1. Capture XHR responses during user navigation
2. Parse the JSON directly (no DOM scraping)
3. Much faster and more reliable

**Attempted:** Had compatibility issues with the MCP server. Needs debugging.

**Implementation options to explore:**
1. Debug `playwright-min-network-mcp` connection issues
2. Use `@executeautomation/playwright-mcp-server` with `playwright_expect_response`
3. Custom script using Playwright directly

---

### Background Sync with Progress Updates

**Status:** Future enhancement

**Problem:** ICS sync takes a long time and the user is "in the dark" while waiting.

**Solution:** Run specialist in background with progress updates.

**Possible approaches:**
1. **Streaming updates**: Specialist emits progress events
2. **Background spawn**: Spawn agent in background, poll for status
3. **Split phases**: Login (interactive) → Sync (background)

**UX goal:**
- "Syncing transactions... 45/83 imported"
- "Sync complete! 83 transactions imported."

---

### Scheduled/Automatic Sync

**Status:** Future enhancement

**Idea:** Run sync automatically on a schedule (daily/weekly).

**Challenges:**
- 2FA still requires user interaction
- Could use persistent browser profile to extend session

**Possible approach:**
- Morning notification: "ICS has 5 new transactions. Sync now?"
- If session still valid, sync without 2FA
- If session expired, prompt user to log in

---

### Smart Categorization Pipeline

**Status:** Future enhancement

**Idea:** After import, automatically trigger finance-agent to help categorize.

```
ics-sync-agent completes
    → "12 new transactions imported"
    → Automatically spawn finance-agent
    → "I see 12 uncategorized transactions. Let's categorize them..."
```

---

### Transaction ID from ICS

**Status:** Future investigation

**Idea:** If ICS provides unique transaction IDs, use those for `import_id` instead of date+amount+payee hash.

**Benefit:** Would handle reserved→committed transitions without creating duplicates.

**Action:** Check ICS API/page for transaction reference numbers.

---

### Balance Verification

**Status:** Future enhancement

**Idea:** After sync, compare YNAB account balance with ICS reported balance.

**Benefit:** Catch missing or duplicate transactions early.
