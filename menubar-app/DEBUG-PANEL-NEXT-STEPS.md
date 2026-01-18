# Debug Panel Next Steps

## Issue: Tool Call Data is Truncated

Currently, the debug panel only shows **keys** of tool call inputs, not the actual values. This is by design in `src/debug/client.ts`:

```typescript
// Line 211-217
specialistToolCall(specialist: string, toolName: string, input: unknown): void {
  this.log('tool_call', {
    category: 'tool',
    specialist,
    method: toolName,
    data: typeof input === 'object' ? { keys: Object.keys(input as object) } : {},  // <-- Only keys!
  });
}
```

Similarly, tool results only show `resultLength`, not the actual content.

## What Needs to Change

### 1. Show Full Tool Call Inputs

In `src/debug/client.ts`, change `specialistToolCall`:

```typescript
specialistToolCall(specialist: string, toolName: string, input: unknown): void {
  this.log('tool_call', {
    category: 'tool',
    specialist,
    method: toolName,
    data: { input },  // Full input object
  });
}
```

### 2. Show Full Tool Results

Currently `specialistToolResult` only logs the length:

```typescript
specialistToolResult(specialist: string, toolName: string, resultLength: number): void {
```

Change to accept and log the actual result:

```typescript
specialistToolResult(specialist: string, toolName: string, result: string): void {
  this.log('tool_result', {
    category: 'tool',
    specialist,
    method: toolName,
    data: {
      resultLength: result.length,
      result: result.length > 10000 ? result.substring(0, 10000) + '...[truncated]' : result
    },
  });
}
```

### 3. Update Call Sites in `src/tools/spawn.ts`

Change line ~255:
```typescript
// Before
debug.specialistToolResult(specialist, toolUse.name, result.length);

// After
debug.specialistToolResult(specialist, toolUse.name, result);
```

### 4. Same for Orchestrator Tool Calls

In `src/debug/client.ts`, the `orchestratorToolCall` and `orchestratorToolResult` methods also truncate data. Update them similarly.

### 5. Consider Size Limits

Large payloads could slow down the debug viewer. Consider:
- Truncating very large strings (>10KB) with `...[truncated]`
- Adding a "Copy to clipboard" button for large data
- Lazy-loading large JSON in the detail panel

## Files to Modify

1. `src/debug/client.ts` - Update the convenience methods to include full data
2. `src/tools/spawn.ts` - Pass full result string instead of just length
3. `src/agent.ts` - Same for orchestrator tool calls
4. `src/http-server.ts` - Same for MCP server tool calls
5. `src/mcp-server.ts` - Same for stdio MCP server

## Optional Enhancements

- Add "Copy JSON" button to detail panel
- Add search/filter by content
- Add collapsible sections for large data
- Add export to file functionality
