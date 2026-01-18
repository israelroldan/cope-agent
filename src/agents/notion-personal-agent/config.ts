/**
 * Notion Personal Agent Configuration
 */

import type { AgentDefinition } from '../types.js';

export const config: Pick<AgentDefinition, 'model' | 'mcpServers' | 'maxTurns'> = {
  model: 'sonnet',
  mcpServers: ['notion-personal'],
  maxTurns: 25,
};
