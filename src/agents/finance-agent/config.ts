/**
 * Finance Agent Configuration
 */

import type { AgentDefinition } from '../types.js';

export const config: Pick<AgentDefinition, 'model' | 'mcpServers' | 'maxTurns' | 'utilityTools'> = {
  model: 'sonnet',
  mcpServers: ['ynab'],
  maxTurns: 20,
  utilityTools: ['count_items', 'extract_number'],
};
