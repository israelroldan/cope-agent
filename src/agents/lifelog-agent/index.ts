/**
 * Lifelog Agent Definition
 *
 * Omi wearable lifelog - memories, conversations, recall.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { AgentDefinition } from '../types.js';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dirname, 'prompt.md'), 'utf-8');

export const lifelogAgent: AgentDefinition = {
  name: 'lifelog-agent',
  description: 'Omi wearable lifelog - memories, conversations, recall.',
  systemPrompt,
  ...config,
};
