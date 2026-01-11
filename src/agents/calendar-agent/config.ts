/**
 * Calendar Agent Configuration
 */

import type { AgentDefinition } from '../types.js';

export const config: Pick<AgentDefinition, 'model' | 'mcpServers'> = {
  model: 'sonnet',
  mcpServers: ['google-calendar-work', 'ical-home', 'magister'],
};
