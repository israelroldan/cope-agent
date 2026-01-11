/**
 * Notion Personal Agent Definition
 *
 * LifeOS - personal operating system in Notion. COPE backend.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { AgentDefinition } from '../types.js';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dirname, 'prompt.md'), 'utf-8');

export const notionPersonalAgent: AgentDefinition = {
  name: 'notion-personal-agent',
  description: 'LifeOS - personal operating system in Notion. Tasks, inbox, decisions, goals, journal.',
  systemPrompt,
  ...config,
};
