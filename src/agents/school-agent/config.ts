/**
 * School Agent Configuration
 */

import type { AgentDefinition } from '../types.js';

export const config: Pick<AgentDefinition, 'model' | 'mcpServers' | 'maxTurns'> = {
  model: 'haiku', // Simple queries, use lightweight model
  mcpServers: ['magister'],
  maxTurns: 12,
};
