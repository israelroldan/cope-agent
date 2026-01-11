/**
 * Slack Agent Definition
 *
 * Tatoma Slack workspace with proactive context surfacing and commitment tracking.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { AgentDefinition } from '../types.js';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dirname, 'prompt.md'), 'utf-8');

export const slackAgent: AgentDefinition = {
  name: 'slack-agent',
  description: 'Tatoma Slack workspace with proactive context surfacing and commitment tracking.',
  systemPrompt,
  ...config,
};
