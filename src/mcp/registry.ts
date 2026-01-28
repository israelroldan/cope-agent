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

// ============================================================================
// Configurable Paths (for local dev vs remote deployment)
// ============================================================================

/**
 * Check if running in local development (on Israel's machine)
 */
function isLocalDev(): boolean {
  return process.env.HOME === '/Users/israel';
}

/**
 * Get a path from environment variable, with optional local dev fallback
 * Returns undefined if not configured (disables the MCP)
 */
function getPath(envVar: string, localDefault?: string): string | undefined {
  const envValue = process.env[envVar];
  if (envValue) return envValue;

  // Only use local defaults on Israel's machine
  if (localDefault && isLocalDev()) return localDefault;

  return undefined;
}

/**
 * Path configuration - returns undefined when not configured
 * This allows MCPs to be disabled on remote deployments
 */
const PATHS = {
  // MCP server locations
  get MCP_ICAL_DIR(): string | undefined {
    return getPath('MCP_ICAL_DIR', '/Users/israel/code/mcp-ical');
  },
  get MAGISTER_MCP_PATH(): string | undefined {
    return getPath('MAGISTER_MCP_PATH', '/Users/israel/code/israelroldan/magister-mcp/dist/index.js');
  },
  get YNAB_MCP_PATH(): string | undefined {
    return getPath('YNAB_MCP_PATH', '/Users/israel/code/mcp-ynab/.venv/bin/mcp-ynab');
  },

  // Browser and OAuth paths
  get PLAYWRIGHT_PROFILE(): string | undefined {
    return getPath('PLAYWRIGHT_PROFILE', path.join('/Users/israel', '.config', 'cope-agent', 'ics-browser-profile'));
  },
  get GOOGLE_OAUTH_CREDS(): string | undefined {
    return getPath('GOOGLE_OAUTH_CREDENTIALS', path.join('/Users/israel', '.config', 'cope', 'credentials', 'google-oauth-work.json'));
  },
};

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
const staticConfigs: Record<string, Omit<McpServerConfig, 'env' | 'args' | 'command'> & {
  command?: string;
  commandBuilder?: () => string | undefined;
  args?: string[];
  argsBuilder?: () => string[];
  envBuilder?: () => Record<string, string>;
  authPathsBuilder?: () => string[];
  requiresPath?: () => string | undefined;  // Returns undefined if not available
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
      GOOGLE_OAUTH_CREDENTIALS: PATHS.GOOGLE_OAUTH_CREDS || '',
    }),
    requiresPath: () => PATHS.GOOGLE_OAUTH_CREDS,
    displayName: 'Google Calendar (Work)',
    authType: 'auto',
    authPathsBuilder: () => [path.join(process.env.HOME || '', '.config', 'google-calendar-mcp')],
    authNotes: 'Browser opens on first use (requires OAuth)',
  },

  'ical-home': {
    name: 'ical-home',
    description: 'Home calendars via iCloud/macOS Calendar',
    type: 'uv',
    command: 'uv',
    argsBuilder: () => {
      const dir = PATHS.MCP_ICAL_DIR;
      return dir ? ['--directory', dir, 'run', 'mcp-ical'] : [];
    },
    requiresPath: () => PATHS.MCP_ICAL_DIR,
    displayName: 'iCal (Home)',
    authType: 'none',
    authNotes: 'Local calendars (macOS only)',
  },

  'magister': {
    name: 'magister',
    description: 'School schedules via Magister',
    type: 'node',
    command: 'node',
    argsBuilder: () => {
      const p = PATHS.MAGISTER_MCP_PATH;
      return p ? [p] : [];
    },
    requiresPath: () => PATHS.MAGISTER_MCP_PATH,
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
    // Command is built dynamically since it's the full path
    commandBuilder: () => PATHS.YNAB_MCP_PATH || 'mcp-ynab',
    args: [],
    requiresPath: () => PATHS.YNAB_MCP_PATH,
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
    argsBuilder: () => {
      const profile = PATHS.PLAYWRIGHT_PROFILE;
      return profile
        ? ['-y', '@playwright/mcp@latest', '--browser', 'chrome', '--user-data-dir', profile]
        : ['-y', '@playwright/mcp@latest', '--browser', 'chrome'];
    },
    requiresPath: () => PATHS.PLAYWRIGHT_PROFILE,
    displayName: 'Playwright (Browser)',
    authType: 'none',
    authNotes: 'Requires display (local only)',
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
 * Check if an MCP server is available (all required paths/config present)
 */
export function isMcpAvailable(name: string): boolean {
  const staticConfig = staticConfigs[name];
  if (!staticConfig) return false;

  // Check if required path is configured
  if (staticConfig.requiresPath) {
    const requiredPath = staticConfig.requiresPath();
    if (!requiredPath) return false;
  }

  // Check if required env vars are set (for env auth type)
  if (staticConfig.authType === 'env' && staticConfig.authEnvVars) {
    for (const envVar of staticConfig.authEnvVars) {
      if (!process.env[envVar]) return false;
    }
  }

  return true;
}

/**
 * Get MCP server configuration by name
 * Returns undefined if the MCP is not available (missing paths/config)
 */
export function getMcpServerConfig(name: string): McpServerConfig | undefined {
  const staticConfig = staticConfigs[name];
  if (!staticConfig) return undefined;

  // Check if MCP is available
  if (!isMcpAvailable(name)) {
    if (process.env.DEBUG) {
      console.log(`[DEBUG] MCP ${name} is not available (missing required config)`);
    }
    return undefined;
  }

  // Build env vars, args, command, and auth paths lazily (now that dotenv has loaded)
  const { envBuilder, argsBuilder, commandBuilder, authPathsBuilder, requiresPath, args, command, ...rest } = staticConfig;
  const env = envBuilder ? envBuilder() : {};
  const resolvedArgs = argsBuilder ? argsBuilder() : args;
  const resolvedCommand = commandBuilder ? commandBuilder() : command;
  const authPaths = authPathsBuilder ? authPathsBuilder() : rest.authPaths;

  return {
    ...rest,
    command: resolvedCommand,
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
 * List all MCP servers (both available and unavailable)
 */
export function listMcpServers(): Array<{ name: string; description: string; available: boolean }> {
  return Object.entries(staticConfigs).map(([name, config]) => ({
    name,
    description: config.description,
    available: isMcpAvailable(name),
  }));
}

/**
 * List only available MCP servers
 */
export function listAvailableMcpServers(): Array<{ name: string; description: string }> {
  return listMcpServers()
    .filter(s => s.available)
    .map(({ name, description }) => ({ name, description }));
}

/**
 * Get availability status for all MCPs (useful for debugging)
 */
export function getMcpAvailabilityStatus(): Record<string, { available: boolean; reason?: string }> {
  const status: Record<string, { available: boolean; reason?: string }> = {};

  for (const [name, config] of Object.entries(staticConfigs)) {
    if (config.requiresPath) {
      const path = config.requiresPath();
      if (!path) {
        status[name] = { available: false, reason: 'Required path not configured' };
        continue;
      }
    }

    if (config.authType === 'env' && config.authEnvVars) {
      const missing = config.authEnvVars.filter(v => !process.env[v]);
      if (missing.length > 0) {
        status[name] = { available: false, reason: `Missing env vars: ${missing.join(', ')}` };
        continue;
      }
    }

    status[name] = { available: true };
  }

  return status;
}
