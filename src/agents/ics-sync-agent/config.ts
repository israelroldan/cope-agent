/**
 * ICS Sync Agent Configuration
 */

import type { AgentDefinition } from '../types.js';

export const config: Pick<AgentDefinition, 'model' | 'mcpServers' | 'maxTurns'> = {
  model: 'sonnet',
  mcpServers: ['playwright', 'ynab'],  // Back to playwright (network-monitor had issues)
  maxTurns: 50,  // Login polling + batch import (much fewer turns with batch)
};
