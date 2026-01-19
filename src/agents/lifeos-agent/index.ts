/**
 * LifeOS Agent Definition
 *
 * Personal operating system for tasks, goals, inbox, and open loops.
 * Uses Sanity CMS directly (no MCP servers).
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { AgentDefinition } from '../types.js';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dirname, 'prompt.md'), 'utf-8');

export const lifeosAgent: AgentDefinition = {
  name: 'lifeos-agent',
  description: 'LifeOS personal operating system. Use for tasks, goals, inbox captures, open loops, and priorities.',
  systemPrompt,
  ...config,
};
