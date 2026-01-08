/**
 * Auth Status Module
 *
 * Check authentication status for all MCP servers.
 */

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
  
  return lines.join('\n');
}
