/**
 * Auth Module
 *
 * Authentication status for MCP servers.
 *
 * OAuth-based services (Notion, Miro) use mcp-remote which handles
 * browser-based authentication automatically on first connection.
 */

// Types
export type { AuthStatus } from './types.js';

// Auth status
export {
  MCP_AUTH_INFO,
  getAuthStatus,
  getAllAuthStatus,
  formatAuthStatus,
  formatAllAuthStatus,
} from './status.js';
