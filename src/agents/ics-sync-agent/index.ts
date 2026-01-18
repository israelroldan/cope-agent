/**
 * ICS Sync Agent Definition
 *
 * Syncs ICS credit card transactions to YNAB via browser automation.
 * Uses Playwright MCP to navigate the ICS portal and extract transactions.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { AgentDefinition } from '../types.js';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dirname, 'prompt.md'), 'utf-8');

export const icsSyncAgent: AgentDefinition = {
  name: 'ics-sync-agent',
  description: 'ICS credit card transaction sync to YNAB',
  systemPrompt,
  ...config,
};
