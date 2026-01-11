/**
 * Finance Agent Definition
 *
 * Financial coaching and YNAB budget management specialist.
 * Helps with budget setup, spending analysis, and transaction entry.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { AgentDefinition } from '../types.js';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dirname, 'prompt.md'), 'utf-8');

export const financeAgent: AgentDefinition = {
  name: 'finance-agent',
  description: 'Financial coaching and YNAB budget management',
  systemPrompt,
  ...config,
};
