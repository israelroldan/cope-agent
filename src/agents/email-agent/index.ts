/**
 * Email Agent Definition
 *
 * Email management for Tatoma work Gmail with triage, tracking, and VIP handling.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { AgentDefinition } from '../types.js';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dirname, 'prompt.md'), 'utf-8');

export const emailAgent: AgentDefinition = {
  name: 'email-agent',
  description: 'Email management for Tatoma work Gmail. Use for inbox, send, draft, search, organize emails.',
  systemPrompt,
  ...config,
};
