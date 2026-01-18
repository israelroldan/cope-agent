/**
 * COPE Workflow Agent Configuration
 */

import type { AgentDefinition } from '../types.js';

export const config: Pick<AgentDefinition, 'model' | 'mcpServers' | 'maxTurns'> = {
  model: 'sonnet',
  mcpServers: [], // This agent spawns sub-specialists, doesn't use MCPs directly
  maxTurns: 25,
};
