/**
 * Miro Agent Definition
 *
 * Miro boards for diagrams and visual collaboration.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { AgentDefinition } from '../types.js';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dirname, 'prompt.md'), 'utf-8');

export const miroAgent: AgentDefinition = {
  name: 'miro-agent',
  description: 'Miro boards for diagrams and visual collaboration.',
  systemPrompt,
  ...config,
};
