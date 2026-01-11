/**
 * Notion Work Agent Definition
 *
 * Tatoma work Notion workspace for docs, projects, wiki.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { AgentDefinition } from '../types.js';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dirname, 'prompt.md'), 'utf-8');

export const notionWorkAgent: AgentDefinition = {
  name: 'notion-work-agent',
  description: 'Tatoma work Notion workspace for docs, projects, wiki.',
  systemPrompt,
  ...config,
};
