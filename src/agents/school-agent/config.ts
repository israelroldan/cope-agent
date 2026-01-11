/**
 * School Agent Configuration
 */

import type { AgentDefinition } from '../types.js';

export const config: Pick<AgentDefinition, 'model' | 'mcpServers'> = {
  model: 'haiku', // Simple queries, use lightweight model
  mcpServers: ['magister'],
};
