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
  execute: (input: Record<string, unknown>) => string | Promise<string>;
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

import * as https from 'https';
import * as http from 'http';

/**
 * Timer API configuration
 *
 * COPE_SERVER_URL: Full URL to the COPE HTTP server (e.g., https://cope-agent.fly.dev)
 *                  Defaults to https://localhost:3847 for local development
 *
 * COPE_API_KEY: API key for authenticating with remote server (required for non-localhost)
 */
function getTimerServerConfig(): { url: URL; apiKey?: string } {
  const serverUrl = process.env.COPE_SERVER_URL || 'https://localhost:3847';
  const apiKey = process.env.COPE_API_KEY;
  return { url: new URL(serverUrl), apiKey };
}

/**
 * Make an HTTP/HTTPS request to the timer API
 */
function timerRequest(
  method: string,
  path: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const { url, apiKey } = getTimerServerConfig();
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;

    // Determine port: use explicit port or protocol default
    const port = url.port
      ? parseInt(url.port, 10)
      : (isHttps ? 443 : 80);

    const headers: Record<string, string> = {};
    if (bodyStr) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(Buffer.byteLength(bodyStr));
    }
    if (apiKey) {
      headers['X-Api-Key'] = apiKey;
    }

    const req = transport.request({
      hostname: url.hostname,
      port,
      path,
      method,
      rejectUnauthorized: false, // Allow self-signed certs for localhost
      headers,
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({
            ok: res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode || 0,
            data: parsed,
          });
        } catch {
          resolve({ ok: false, status: res.statusCode || 0, data: { error: 'Invalid JSON response' } });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

/**
 * Set a countdown timer that displays in the COPE menubar app
 */
export const setTimerTool: UtilityTool = {
  name: 'set_timer',
  description: `Set a countdown timer that displays in the COPE menubar app.

When the timer expires, a full-screen alert appears to get the user's attention.
Use this for:
- Pomodoro/focus sessions (e.g., "25 minutes for deep work")
- Reminders ("10 minutes until meeting")
- Time-boxing tasks ("15 minutes to review emails")

The timer countdown appears in the macOS menu bar next to the COPE icon.`,

  input_schema: {
    type: 'object',
    properties: {
      minutes: {
        type: 'number',
        description: 'Timer duration in minutes (use this OR seconds, or both)',
      },
      seconds: {
        type: 'number',
        description: 'Timer duration in seconds (use this OR minutes, or both)',
      },
      label: {
        type: 'string',
        description: 'Label shown when timer expires (e.g., "Time to take a break")',
      },
    },
    required: ['label'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    const { minutes, seconds, label } = input as {
      minutes?: number;
      seconds?: number;
      label: string;
    };

    try {
      const response = await timerRequest('POST', '/timer', { minutes, seconds, label });

      const data = response.data as {
        error?: string;
        timer?: { id: string; endTime: number };
      };

      if (!response.ok) {
        return JSON.stringify({ success: false, error: data.error || 'Failed to set timer' });
      }

      // Calculate human-readable duration
      const totalSeconds = (minutes || 0) * 60 + (seconds || 0);
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      const durationStr = mins > 0
        ? secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
        : `${secs}s`;

      return JSON.stringify({
        success: true,
        message: `Timer set for ${durationStr}: "${label}"`,
        timerId: data.timer?.id,
        endTime: data.timer?.endTime,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const serverUrl = process.env.COPE_SERVER_URL || 'https://localhost:3847';
      return JSON.stringify({
        success: false,
        error: `Timer failed - COPE server isn't running. You'll need to start the menubar app first.`,
        debug: `Could not connect to ${serverUrl}: ${msg}`,
      });
    }
  },
};

/**
 * Cancel running timer(s)
 */
export const cancelTimerTool: UtilityTool = {
  name: 'cancel_timer',
  description: `Cancel running timer(s).
- Without timerId: cancels ALL running timers
- With timerId: cancels only the specified timer

Use when user wants to stop a timer before it expires.`,

  input_schema: {
    type: 'object',
    properties: {
      timerId: {
        type: 'string',
        description: 'Optional: ID of specific timer to cancel. If not provided, cancels all timers.',
      },
    },
    required: [],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    const { timerId } = input as { timerId?: string };

    try {
      const path = timerId ? `/timer/${timerId}` : '/timer';
      const response = await timerRequest('DELETE', path);

      const data = response.data as {
        error?: string;
        message?: string;
        count?: number;
      };

      if (!response.ok) {
        return JSON.stringify({ success: false, error: data.error || 'Failed to cancel timer' });
      }

      return JSON.stringify({
        success: true,
        message: data.message || 'Timer(s) cancelled',
        cancelledCount: data.count,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({
        success: false,
        error: `Failed to cancel timer: ${msg}. Is the COPE server running?`,
      });
    }
  },
};

/**
 * Registry of all utility tools
 */
export const utilityTools: Record<string, UtilityTool> = {
  count_items: countItemsTool,
  extract_number: extractNumberTool,
  set_timer: setTimerTool,
  cancel_timer: cancelTimerTool,
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
 * Execute a utility tool (supports both sync and async tools)
 */
export async function executeUtilityTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<string | null> {
  const tool = utilityTools[toolName];
  if (!tool) return null;
  return await tool.execute(toolInput);
}
