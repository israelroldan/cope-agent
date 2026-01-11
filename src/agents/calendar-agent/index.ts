/**
 * Calendar Agent Definition
 *
 * Calendar management across Work and Home with school constraint awareness.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { AgentDefinition } from '../types.js';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dirname, 'prompt.md'), 'utf-8');

export const calendarAgent: AgentDefinition = {
  name: 'calendar-agent',
  description: 'Calendar management across Work and Home. Respects school pickup as HARD constraint.',
  systemPrompt,
  ...config,
};
