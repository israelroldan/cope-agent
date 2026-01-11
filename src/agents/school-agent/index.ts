/**
 * School Agent Definition
 *
 * School schedules for Amélie (Magister) and Philippe (fixed).
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { AgentDefinition } from '../types.js';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dirname, 'prompt.md'), 'utf-8');

export const schoolAgent: AgentDefinition = {
  name: 'school-agent',
  description: 'School schedules for Amélie (via Magister) and Philippe (fixed schedule).',
  systemPrompt,
  ...config,
};
