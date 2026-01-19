/**
 * MCP Server Registry
 *
 * Configurations for all MCP servers, loaded dynamically by specialist agents.
 * These are NOT loaded at startup - only when a specialist needs them.
 *
 * IMPORTANT: Environment variables are read lazily (at connection time)
 * to ensure dotenv has loaded .env before we read them.
 */

import * as path from 'path';

export interface McpServerConfig {
  name: string;
  description: string;
  type: 'docker' | 'node' | 'npx' | 'uv' | 'sse' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  // Auth metadata for status display
  displayName: string;
  authType: 'mcp-remote' | 'env' | 'auto' | 'none';
  authEnvVars?: string[];  // For env auth type - vars to check
  authUrl?: string;        // For mcp-remote - URL for token cache lookup
  authPaths?: string[];    // For file-based auth - paths to clear
  authNotes?: string;
  // UX hints
  slowStartup?: boolean;   // If true, show "connecting..." message to user
}

/**
 * Static server configurations (no env vars needed at definition time)
 *
 * For Docker containers, use argsBuilder to inject env vars with actual values
 * since `-e VAR` only works when VAR is in the shell's environment.
 */
const staticConfigs: Record<string, Omit<McpServerConfig, 'env' | 'args'> & {
  args?: string[];
  argsBuilder?: () => string[];
  envBuilder?: () => Record<string, string>;
  authPathsBuilder?: () => string[];
}> = {
  'gmail-work': {
    name: 'gmail-work',
    description: 'Tatoma work email via Gmail',
    type: 'npx',
    command: 'npx',
    args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'],
    displayName: 'Gmail (Work)',
    authType: 'auto',
    authPathsBuilder: () => [path.join(process.env.HOME || '', '.gmail-mcp')],
    authNotes: 'Browser opens on first use',
  },

  'slack-tatoma': {
    name: 'slack-tatoma',
    description: 'Tatoma Slack workspace',
    type: 'npx',
    command: 'npx',
    args: ['-y', 'slack-mcp-server@latest', '--transport', 'stdio'],
    envBuilder: () => ({
      SLACK_MCP_XOXB_TOKEN: process.env.SLACK_MCP_XOXB_TOKEN ?? '',
      SLACK_MCP_ADD_MESSAGE_TOOL: 'true',
    }),
    displayName: 'Slack (Tatoma)',
    authType: 'env',
    authEnvVars: ['SLACK_MCP_XOXB_TOKEN'],
  },

  'google-calendar-work': {
    name: 'google-calendar-work',
    description: 'Work calendar via Google Calendar',
    type: 'npx',
    command: 'npx',
    args: ['-y', '@cocal/google-calendar-mcp'],
    envBuilder: () => ({
      GOOGLE_OAUTH_CREDENTIALS: process.env.GOOGLE_OAUTH_CREDENTIALS ??
        '/Users/israel/.config/cope/credentials/google-oauth-work.json',
    }),
    displayName: 'Google Calendar (Work)',
    authType: 'auto',
    authPathsBuilder: () => [path.join(process.env.HOME || '', '.config', 'google-calendar-mcp')],
    authNotes: 'Browser opens on first use',
  },

  'ical-home': {
    name: 'ical-home',
    description: 'Home calendars via iCloud/macOS Calendar',
    type: 'uv',
    command: 'uv',
    args: ['--directory', '/Users/israel/code/mcp-ical', 'run', 'mcp-ical'],
    displayName: 'iCal (Home)',
    authType: 'none',
    authNotes: 'Local calendars',
  },

  'magister': {
    name: 'magister',
    description: 'School schedules via Magister',
    type: 'node',
    command: 'node',
    args: ['/Users/israel/code/israelroldan/magister-mcp/dist/index.js'],
    envBuilder: () => ({
      MAGISTER_SCHOOL: process.env.MAGISTER_SCHOOL ?? 'sintlucas-vmbo',
      MAGISTER_USER: process.env.MAGISTER_USER ?? '',
      MAGISTER_PASS: process.env.MAGISTER_PASS ?? '',
    }),
    displayName: 'Magister (School)',
    authType: 'env',
    authEnvVars: ['MAGISTER_USER', 'MAGISTER_PASS'],
  },

  'omi': {
    name: 'omi',
    description: 'Lifelog via Omi wearable',
    type: 'docker',
    command: 'docker',
    argsBuilder: () => [
      'run',
      '-i',
      '--rm',
      '-e', `OMI_API_KEY=${process.env.OMI_API_KEY ?? ''}`,
      'omiai/mcp-server',
    ],
    displayName: 'Omi (Lifelog)',
    authType: 'env',
    authEnvVars: ['OMI_API_KEY'],
  },

  // OAuth-based services use mcp-remote to handle browser auth flow
  // NOTE: Each Notion workspace uses a unique query param so mcp-remote
  // stores separate OAuth tokens for each (tokens are keyed by URL hash)
  'notion-work': {
    name: 'notion-work',
    description: 'Tatoma work Notion workspace',
    type: 'npx',
    command: 'npx',
    args: ['-y', 'mcp-remote', 'https://mcp.notion.com/mcp?workspace=work'],
    displayName: 'Notion (Work)',
    authType: 'mcp-remote',
    authUrl: 'https://mcp.notion.com/mcp?workspace=work',
    authNotes: 'Browser opens on first use - authorize WORK workspace',
  },

  'miro': {
    name: 'miro',
    description: 'Miro boards',
    type: 'npx',
    command: 'npx',
    args: ['-y', 'mcp-remote', 'https://mcp.miro.com'],
    displayName: 'Miro',
    authType: 'mcp-remote',
    authUrl: 'https://mcp.miro.com',
    authNotes: 'Browser opens on first use',
  },

  'ynab': {
    name: 'ynab',
    description: 'YNAB budget management',
    type: 'node',
    command: '/Users/israel/code/mcp-ynab/.venv/bin/mcp-ynab',
    args: [],
    envBuilder: () => ({
      YNAB_API_KEY: process.env.YNAB_API_TOKEN ?? '',
    }),
    displayName: 'YNAB (Budget)',
    authType: 'env',
    authEnvVars: ['YNAB_API_TOKEN'],
    slowStartup: true,
  },

  'playwright': {
    name: 'playwright',
    description: 'Browser automation via Playwright',
    type: 'npx',
    command: 'npx',
    args: [
      '-y', '@playwright/mcp@latest',
      '--browser', 'chrome',
      '--user-data-dir', '/Users/israel/.config/cope-agent/ics-browser-profile',
    ],
    displayName: 'Playwright (Browser)',
    authType: 'none',
    authNotes: 'No auth required - browser handles site logins',
  },

  'network-monitor': {
    name: 'network-monitor',
    description: 'Network request/response capture for browser automation',
    type: 'npx',
    command: 'npx',
    args: [
      '-y', 'playwright-min-network-mcp',
    ],
    displayName: 'Network Monitor',
    authType: 'none',
    authNotes: 'Captures XHR/API responses from browser',
  },
};

/**
 * Get MCP server configuration by name
 * Environment variables and args are evaluated lazily when this is called
 */
export function getMcpServerConfig(name: string): McpServerConfig | undefined {
  const staticConfig = staticConfigs[name];
  if (!staticConfig) return undefined;

  // Build env vars, args, and auth paths lazily (now that dotenv has loaded)
  const { envBuilder, argsBuilder, authPathsBuilder, args, ...rest } = staticConfig;
  const env = envBuilder ? envBuilder() : {};
  const resolvedArgs = argsBuilder ? argsBuilder() : args;
  const authPaths = authPathsBuilder ? authPathsBuilder() : rest.authPaths;

  return {
    ...rest,
    args: resolvedArgs,
    env,
    authPaths,
  } as McpServerConfig;
}

/**
 * Get all MCP server names
 */
export function getAllMcpServerNames(): string[] {
  return Object.keys(staticConfigs);
}

/**
 * Get all MCP server configurations
 */
export function getAllMcpServerConfigs(): McpServerConfig[] {
  return getAllMcpServerNames().map(name => getMcpServerConfig(name)!);
}

/**
 * Get multiple MCP server configurations
 */
export function getMcpServerConfigs(names: string[]): McpServerConfig[] {
  return names
    .map(name => getMcpServerConfig(name))
    .filter((config): config is McpServerConfig => config !== undefined);
}

/**
 * Build the MCP server configuration object for the Agent SDK
 * This is passed to query() options.mcp_servers
 */
export function buildMcpServersOption(serverNames: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const name of serverNames) {
    const config = getMcpServerConfig(name);
    if (!config) continue;

    switch (config.type) {
      case 'docker':
      case 'node':
      case 'npx':
      case 'uv':
        result[name] = {
          command: config.command,
          args: config.args,
          env: config.env,
        };
        break;

      case 'sse':
        result[name] = {
          type: 'sse',
          url: config.url,
          headers: config.headers,
        };
        break;

      case 'http':
        result[name] = {
          type: 'http',
          url: config.url,
          headers: config.headers,
        };
        break;
    }
  }

  return result;
}

/**
 * List all available MCP servers
 */
export function listMcpServers(): Array<{ name: string; description: string }> {
  return Object.entries(staticConfigs).map(([name, config]) => ({
    name,
    description: config.description,
  }));
}
