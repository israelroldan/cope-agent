/**
 * Auth Status Module
 *
 * Check authentication status for all MCP servers.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import type { AuthStatus } from './types.js';

/**
 * MCP servers and their auth requirements
 */
export const MCP_AUTH_INFO: Record<string, {
  displayName: string;
  authType: 'mcp-remote' | 'env' | 'auto' | 'none';
  envVars?: string[];
  notes?: string;
}> = {
  'gmail-work': {
    displayName: 'Gmail (Work)',
    authType: 'auto',
    notes: 'Browser opens on first use',
  },
  'google-calendar-work': {
    displayName: 'Google Calendar (Work)',
    authType: 'auto',
    notes: 'Browser opens on first use',
  },
  'slack-tatoma': {
    displayName: 'Slack (Tatoma)',
    authType: 'env',
    envVars: ['SLACK_MCP_XOXB_TOKEN'],
  },
  'magister': {
    displayName: 'Magister (School)',
    authType: 'env',
    envVars: ['MAGISTER_USER', 'MAGISTER_PASS'],
  },
  'omi': {
    displayName: 'Omi (Lifelog)',
    authType: 'env',
    envVars: ['OMI_API_KEY'],
  },
  'ical-home': {
    displayName: 'iCal (Home)',
    authType: 'none',
    notes: 'Local calendars',
  },
  'notion-personal': {
    displayName: 'Notion (Personal)',
    authType: 'mcp-remote',
    notes: 'Uses mcp-remote: browser opens on first use',
  },
  'notion-work': {
    displayName: 'Notion (Work)',
    authType: 'mcp-remote',
    notes: 'Uses mcp-remote: browser opens on first use',
  },
  'miro': {
    displayName: 'Miro',
    authType: 'mcp-remote',
    notes: 'Uses mcp-remote: browser opens on first use',
  },
};

/**
 * Check if environment variables are set
 */
function checkEnvVars(envVars: string[]): { set: boolean; missing: string[] } {
  const missing = envVars.filter(v => !process.env[v]);
  return { set: missing.length === 0, missing };
}

/**
 * Get auth status for a single service
 */
export function getAuthStatus(service: string): AuthStatus {
  const info = MCP_AUTH_INFO[service];
  
  if (!info) {
    return {
      service,
      displayName: service,
      authenticated: false,
      error: 'Unknown service',
    };
  }
  
  const status: AuthStatus = {
    service,
    displayName: info.displayName,
    authenticated: false,
  };
  
  switch (info.authType) {
    case 'none':
      status.authenticated = true;
      break;
      
    case 'auto':
    case 'mcp-remote':
      // These handle auth automatically via browser
      status.authenticated = true;
      break;
      
    case 'env':
      if (info.envVars) {
        const envCheck = checkEnvVars(info.envVars);
        status.authenticated = envCheck.set;
        if (!envCheck.set) {
          status.error = `Missing: ${envCheck.missing.join(', ')}`;
        }
      }
      break;
  }
  
  return status;
}

/**
 * Get auth status for all MCP servers
 */
export function getAllAuthStatus(): AuthStatus[] {
  return Object.keys(MCP_AUTH_INFO).map(getAuthStatus);
}

/**
 * Format auth status for display
 */
export function formatAuthStatus(status: AuthStatus): string {
  const icon = status.authenticated ? '✅' : '❌';
  let line = `${icon} ${status.displayName}`;
  
  if (!status.authenticated && status.error) {
    line += ` - ${status.error}`;
  }
  
  return line;
}

/**
 * Format all auth status for display
 */
export function formatAllAuthStatus(): string {
  const statuses = getAllAuthStatus();
  const lines: string[] = ['📋 MCP Authentication Status\n'];

  const groups = {
    mcpRemote: statuses.filter(s => MCP_AUTH_INFO[s.service]?.authType === 'mcp-remote'),
    env: statuses.filter(s => MCP_AUTH_INFO[s.service]?.authType === 'env'),
    auto: statuses.filter(s => MCP_AUTH_INFO[s.service]?.authType === 'auto'),
    none: statuses.filter(s => MCP_AUTH_INFO[s.service]?.authType === 'none'),
  };

  if (groups.mcpRemote.length > 0) {
    lines.push('🌐 OAuth Services (mcp-remote - browser opens on first use):');
    groups.mcpRemote.forEach(s => lines.push(`   ${formatAuthStatus(s)}`));
    lines.push('');
  }

  if (groups.env.length > 0) {
    lines.push('🔑 Token Services (set env vars):');
    groups.env.forEach(s => lines.push(`   ${formatAuthStatus(s)}`));
    lines.push('');
  }

  if (groups.auto.length > 0) {
    lines.push('🔄 Auto-Auth Services (browser opens on first use):');
    groups.auto.forEach(s => lines.push(`   ${formatAuthStatus(s)}`));
    lines.push('');
  }

  if (groups.none.length > 0) {
    lines.push('📁 Local Services:');
    groups.none.forEach(s => lines.push(`   ${formatAuthStatus(s)}`));
  }

  lines.push('');
  lines.push('💡 To re-authenticate: /mcp auth <server>');

  return lines.join('\n');
}

/**
 * Token storage locations for services that support re-auth
 */
const TOKEN_PATHS: Record<string, {
  type: 'mcp-remote' | 'file';
  url?: string;  // For mcp-remote, compute hash from URL
  paths?: string[];  // For file-based, direct paths to delete
}> = {
  'notion-personal': {
    type: 'mcp-remote',
    url: 'https://mcp.notion.com/mcp',
  },
  'notion-work': {
    type: 'mcp-remote',
    url: 'https://mcp.notion.com/mcp',  // Same URL, same tokens
  },
  'miro': {
    type: 'mcp-remote',
    url: 'https://mcp.miro.com',
  },
  'gmail-work': {
    type: 'file',
    paths: [
      path.join(process.env.HOME || '', '.gmail-mcp'),
    ],
  },
  'google-calendar-work': {
    type: 'file',
    paths: [
      path.join(process.env.HOME || '', '.config', 'google-calendar-mcp'),
    ],
  },
};

/**
 * Find mcp-remote auth directory (handles version variations)
 */
function findMcpRemoteDir(): string | null {
  const mcpAuthDir = path.join(process.env.HOME || '', '.mcp-auth');
  if (!fs.existsSync(mcpAuthDir)) return null;

  const entries = fs.readdirSync(mcpAuthDir);
  const mcpRemoteDir = entries.find(e => e.startsWith('mcp-remote-'));
  return mcpRemoteDir ? path.join(mcpAuthDir, mcpRemoteDir) : null;
}

/**
 * Clear cached tokens for a service to force re-authentication
 */
export function clearAuthTokens(service: string): { success: boolean; message: string } {
  const info = MCP_AUTH_INFO[service];
  if (!info) {
    return { success: false, message: `Unknown service: ${service}` };
  }

  // Env-based services can't be re-authed this way
  if (info.authType === 'env') {
    return {
      success: false,
      message: `${info.displayName} uses environment variables. Update your .env file instead.`
    };
  }

  if (info.authType === 'none') {
    return {
      success: false,
      message: `${info.displayName} doesn't require authentication.`
    };
  }

  const tokenInfo = TOKEN_PATHS[service];
  if (!tokenInfo) {
    return {
      success: false,
      message: `No token path configured for ${info.displayName}`
    };
  }

  try {
    if (tokenInfo.type === 'mcp-remote' && tokenInfo.url) {
      // Compute hash from URL and delete those files
      const hash = crypto.createHash('md5').update(tokenInfo.url).digest('hex');
      const mcpDir = findMcpRemoteDir();

      if (!mcpDir) {
        return { success: true, message: `No cached tokens found for ${info.displayName}` };
      }

      const patterns = [
        `${hash}_client_info.json`,
        `${hash}_code_verifier.txt`,
        `${hash}_tokens.json`,
      ];

      let deleted = 0;
      for (const pattern of patterns) {
        const filePath = path.join(mcpDir, pattern);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      }

      if (deleted > 0) {
        return {
          success: true,
          message: `Cleared ${deleted} token files for ${info.displayName}. Browser will open on next use.`
        };
      } else {
        return {
          success: true,
          message: `No cached tokens found for ${info.displayName}`
        };
      }
    }

    if (tokenInfo.type === 'file' && tokenInfo.paths) {
      let deleted = 0;
      for (const tokenPath of tokenInfo.paths) {
        if (fs.existsSync(tokenPath)) {
          // Remove directory recursively or file
          fs.rmSync(tokenPath, { recursive: true, force: true });
          deleted++;
        }
      }

      if (deleted > 0) {
        return {
          success: true,
          message: `Cleared credentials for ${info.displayName}. Browser will open on next use.`
        };
      } else {
        return {
          success: true,
          message: `No cached credentials found for ${info.displayName}`
        };
      }
    }

    return { success: false, message: `Unexpected token type for ${service}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to clear tokens: ${message}` };
  }
}

/**
 * List services that support re-authentication
 */
export function listReauthServices(): string[] {
  return Object.keys(TOKEN_PATHS);
}
