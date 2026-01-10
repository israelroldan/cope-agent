/**
 * Auth Status Module
 *
 * Check authentication status for all MCP servers.
 * Uses registry.ts as single source of truth for server configs.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { AuthStatus } from './types.js';
import {
  getAllMcpServerConfigs,
  getMcpServerConfig,
  type McpServerConfig,
} from '../mcp/registry.js';

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
  const config = getMcpServerConfig(service);

  if (!config) {
    return {
      service,
      displayName: service,
      authenticated: false,
      error: 'Unknown service',
    };
  }

  const status: AuthStatus = {
    service,
    displayName: config.displayName,
    authenticated: false,
  };

  switch (config.authType) {
    case 'none':
      status.authenticated = true;
      break;

    case 'auto':
    case 'mcp-remote':
      // These handle auth automatically via browser
      status.authenticated = true;
      break;

    case 'env':
      if (config.authEnvVars) {
        const envCheck = checkEnvVars(config.authEnvVars);
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
  return getAllMcpServerConfigs().map(config => getAuthStatus(config.name));
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
  const configs = getAllMcpServerConfigs();
  const statuses = configs.map(c => getAuthStatus(c.name));
  const lines: string[] = ['📋 MCP Authentication Status\n'];

  const groups = {
    mcpRemote: statuses.filter((s, i) => configs[i].authType === 'mcp-remote'),
    env: statuses.filter((s, i) => configs[i].authType === 'env'),
    auto: statuses.filter((s, i) => configs[i].authType === 'auto'),
    none: statuses.filter((s, i) => configs[i].authType === 'none'),
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
  const config = getMcpServerConfig(service);
  if (!config) {
    return { success: false, message: `Unknown service: ${service}` };
  }

  // Env-based services can't be re-authed this way
  if (config.authType === 'env') {
    return {
      success: false,
      message: `${config.displayName} uses environment variables. Update your .env file instead.`
    };
  }

  if (config.authType === 'none') {
    return {
      success: false,
      message: `${config.displayName} doesn't require authentication.`
    };
  }

  try {
    // Handle mcp-remote OAuth tokens
    if (config.authType === 'mcp-remote' && config.authUrl) {
      const hash = crypto.createHash('md5').update(config.authUrl).digest('hex');
      const mcpDir = findMcpRemoteDir();

      if (!mcpDir) {
        return { success: true, message: `No cached tokens found for ${config.displayName}` };
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
          message: `Cleared ${deleted} token files for ${config.displayName}. Browser will open on next use.`
        };
      } else {
        return {
          success: true,
          message: `No cached tokens found for ${config.displayName}`
        };
      }
    }

    // Handle file-based auth (auto type with authPaths)
    if (config.authPaths && config.authPaths.length > 0) {
      let deleted = 0;
      for (const tokenPath of config.authPaths) {
        if (fs.existsSync(tokenPath)) {
          fs.rmSync(tokenPath, { recursive: true, force: true });
          deleted++;
        }
      }

      if (deleted > 0) {
        return {
          success: true,
          message: `Cleared credentials for ${config.displayName}. Browser will open on next use.`
        };
      } else {
        return {
          success: true,
          message: `No cached credentials found for ${config.displayName}`
        };
      }
    }

    return { success: false, message: `No re-auth method configured for ${config.displayName}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to clear tokens: ${message}` };
  }
}

/**
 * List services that support re-authentication
 */
export function listReauthServices(): string[] {
  return getAllMcpServerConfigs()
    .filter(c => c.authType === 'mcp-remote' || c.authType === 'auto')
    .map(c => c.name);
}

/**
 * Re-export MCP_AUTH_INFO for backwards compatibility
 * (maps to registry configs)
 */
export const MCP_AUTH_INFO: Record<string, {
  displayName: string;
  authType: 'mcp-remote' | 'env' | 'auto' | 'none';
  envVars?: string[];
  notes?: string;
}> = Object.fromEntries(
  getAllMcpServerConfigs().map(c => [
    c.name,
    {
      displayName: c.displayName,
      authType: c.authType,
      envVars: c.authEnvVars,
      notes: c.authNotes,
    },
  ])
);
