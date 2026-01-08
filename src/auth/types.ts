/**
 * Auth Status Types
 *
 * Simple type definitions for MCP auth status display.
 */

/**
 * Auth status for a service
 */
export interface AuthStatus {
  service: string;
  displayName: string;
  authenticated: boolean;
  error?: string;
}
