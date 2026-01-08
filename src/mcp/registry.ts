/**
 * MCP Server Registry
 *
 * Configurations for all MCP servers, loaded dynamically by specialist agents.
 * These are NOT loaded at startup - only when a specialist needs them.
 *
 * IMPORTANT: Environment variables are read lazily (at connection time)
 * to ensure dotenv has loaded .env before we read them.
 */

export interface McpServerConfig {
  name: string;
  description: string;
  type: 'docker' | 'node' | 'npx' | 'uv' | 'sse' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

/**
 * Static server configurations (no env vars needed at definition time)
 */
const staticConfigs: Record<string, Omit<McpServerConfig, 'env'> & {
  envBuilder?: () => Record<string, string>;
}> = {
  'gmail-work': {
    name: 'gmail-work',
    description: 'Tatoma work email via Gmail',
    type: 'npx',
    command: 'npx',
    args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'],
  },

  'slack-tatoma': {
    name: 'slack-tatoma',
    description: 'Tatoma Slack workspace',
    type: 'docker',
    command: 'docker',
    args: [
      'run',
      '-i',
      '--rm',
      '-e', 'SLACK_MCP_XOXB_TOKEN',
      '-e', 'SLACK_MCP_ADD_MESSAGE_TOOL=true',
      'ghcr.io/korotovsky/slack-mcp-server:latest',
    ],
    envBuilder: () => ({
      SLACK_MCP_XOXB_TOKEN: process.env.SLACK_MCP_XOXB_TOKEN ?? '',
    }),
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
  },

  'ical-home': {
    name: 'ical-home',
    description: 'Home calendars via iCloud/macOS Calendar',
    type: 'uv',
    command: 'uv',
    args: ['--directory', '/Users/israel/code/mcp-ical', 'run', 'mcp-ical'],
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
  },

  'omi': {
    name: 'omi',
    description: 'Lifelog via Omi wearable',
    type: 'docker',
    command: 'docker',
    args: [
      'run',
      '-i',
      '--rm',
      '-e', 'OMI_API_KEY',
      'omiai/mcp-server',
    ],
    envBuilder: () => ({
      OMI_API_KEY: process.env.OMI_API_KEY ?? '',
    }),
  },

  // OAuth-based services use mcp-remote to handle browser auth flow
  // See: https://developers.notion.com/docs/get-started-with-mcp
  'notion-work': {
    name: 'notion-work',
    description: 'Tatoma work Notion workspace',
    type: 'npx',
    command: 'npx',
    args: ['-y', 'mcp-remote', 'https://mcp.notion.com/mcp'],
    // mcp-remote handles OAuth: opens browser on first use, caches token
  },

  'notion-personal': {
    name: 'notion-personal',
    description: 'Personal Notion workspace (LifeOS)',
    type: 'npx',
    command: 'npx',
    args: ['-y', 'mcp-remote', 'https://mcp.notion.com/mcp'],
    // mcp-remote handles OAuth: opens browser on first use, caches token
  },

  'miro': {
    name: 'miro',
    description: 'Miro boards',
    type: 'npx',
    command: 'npx',
    args: ['-y', 'mcp-remote', 'https://mcp.miro.com'],
    // mcp-remote handles OAuth: opens browser on first use, caches token
  },
};

/**
 * Get MCP server configuration by name
 * Environment variables are evaluated lazily when this is called
 */
export function getMcpServerConfig(name: string): McpServerConfig | undefined {
  const staticConfig = staticConfigs[name];
  if (!staticConfig) return undefined;

  // Build env vars lazily (now that dotenv has loaded)
  const { envBuilder, ...rest } = staticConfig;
  const env = envBuilder ? envBuilder() : {};

  return {
    ...rest,
    env,
  } as McpServerConfig;
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
