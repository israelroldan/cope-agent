/**
 * Built-in Utility Tools
 *
 * Simple tools that can be injected into specialists alongside MCP tools.
 * These provide reliable counting and parsing that models often get wrong.
 */

import type Anthropic from '@anthropic-ai/sdk';

export interface UtilityTool {
  name: string;
  description: string;
  input_schema: Anthropic.Tool.InputSchema;
  execute: (input: Record<string, unknown>) => string;
}

/**
 * Count items in a JSON array or newline-separated list
 */
export const countItemsTool: UtilityTool = {
  name: 'count_items',
  description: `Count items accurately. Use this instead of counting manually.

Supports:
- JSON arrays: [1, 2, 3] → 3
- Newline-separated text: counts non-empty lines
- Markdown tables: counts data rows (excludes header and separator)

Always use this tool when you need to report counts to the user.`,

  input_schema: {
    type: 'object',
    properties: {
      data: {
        type: 'string',
        description: 'The data to count - JSON array, newline-separated list, or markdown table',
      },
      format: {
        type: 'string',
        enum: ['json', 'lines', 'markdown_table', 'auto'],
        description: 'Data format. Use "auto" to detect automatically (default)',
      },
    },
    required: ['data'],
  },

  execute: (input: Record<string, unknown>): string => {
    const data = String(input.data || '');
    const format = String(input.format || 'auto');

    try {
      let count: number;
      let detectedFormat: string;

      if (format === 'json' || (format === 'auto' && data.trim().startsWith('['))) {
        // JSON array
        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed)) {
          return JSON.stringify({ error: 'Data is not a JSON array', count: 0 });
        }
        count = parsed.length;
        detectedFormat = 'json';
      } else if (format === 'markdown_table' || (format === 'auto' && data.includes('|'))) {
        // Markdown table - count rows excluding header and separator
        const lines = data.split('\n').filter(line => line.trim());
        const dataRows = lines.filter(line => {
          const trimmed = line.trim();
          // Skip separator lines (|---|---|)
          if (/^\|[\s-:|]+\|$/.test(trimmed)) return false;
          // Skip header (first row with |)
          return true;
        });
        // Subtract 1 for header row if present
        const hasHeader = dataRows.length > 0 && dataRows[0].includes('|');
        count = hasHeader ? dataRows.length - 1 : dataRows.length;
        detectedFormat = 'markdown_table';
      } else {
        // Newline-separated
        const lines = data.split('\n').filter(line => line.trim().length > 0);
        count = lines.length;
        detectedFormat = 'lines';
      }

      return JSON.stringify({ count, format: detectedFormat });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ error: `Failed to count: ${msg}`, count: 0 });
    }
  },
};

/**
 * Extract a number from text
 */
export const extractNumberTool: UtilityTool = {
  name: 'extract_number',
  description: `Extract a specific number from text. Use this to get counts from tool responses.

Examples:
- "Found 75 uncategorized transactions" → 75
- "ICS Credit Card: 108 items" → 108
- "Total: €1,234.56" → 1234.56

Use the 'pattern' parameter to specify which number to extract if there are multiple.`,

  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The text containing the number to extract',
      },
      pattern: {
        type: 'string',
        description: 'Optional: text pattern before the number (e.g., "Total:", "ICS Credit Card:")',
      },
    },
    required: ['text'],
  },

  execute: (input: Record<string, unknown>): string => {
    const text = String(input.text || '');
    const pattern = input.pattern ? String(input.pattern) : null;

    try {
      let searchText = text;

      // If pattern provided, find text after pattern
      if (pattern) {
        const patternIndex = text.toLowerCase().indexOf(pattern.toLowerCase());
        if (patternIndex === -1) {
          return JSON.stringify({ error: `Pattern "${pattern}" not found in text`, number: null });
        }
        searchText = text.substring(patternIndex + pattern.length);
      }

      // Extract first number (supports decimals and comma thousands separators)
      const match = searchText.match(/[\d,]+\.?\d*/);
      if (!match) {
        return JSON.stringify({ error: 'No number found', number: null });
      }

      // Parse the number (remove commas)
      const numberStr = match[0].replace(/,/g, '');
      const number = parseFloat(numberStr);

      if (isNaN(number)) {
        return JSON.stringify({ error: 'Failed to parse number', number: null });
      }

      return JSON.stringify({ number, raw: match[0] });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ error: `Failed to extract: ${msg}`, number: null });
    }
  },
};

/**
 * Registry of all utility tools
 */
export const utilityTools: Record<string, UtilityTool> = {
  count_items: countItemsTool,
  extract_number: extractNumberTool,
};

/**
 * Get utility tools by name
 */
export function getUtilityTools(names: string[]): UtilityTool[] {
  return names
    .map(name => utilityTools[name])
    .filter((tool): tool is UtilityTool => tool !== undefined);
}

/**
 * Convert utility tools to Anthropic tool format
 */
export function utilityToolsToAnthropicTools(tools: UtilityTool[]): Anthropic.Tool[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema,
  }));
}

/**
 * Execute a utility tool
 */
export function executeUtilityTool(
  toolName: string,
  toolInput: Record<string, unknown>
): string | null {
  const tool = utilityTools[toolName];
  if (!tool) return null;
  return tool.execute(toolInput);
}
