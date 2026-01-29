#!/usr/bin/env node
/**
 * COPE Agent Slack Bot
 *
 * A Slack Socket Mode bot that provides mobile access to COPE agent via DMs and @mentions.
 * Uses Socket Mode for connection - no public webhook required.
 *
 * Required environment variables:
 *   SLACK_BOT_TOKEN - Bot OAuth token (xoxb-...)
 *   SLACK_APP_TOKEN - App-level token for Socket Mode (xapp-...)
 *   ANTHROPIC_AUTH_TOKEN - For agent functionality
 *
 * Slack App Setup:
 *   1. Create app at api.slack.com/apps
 *   2. Enable Socket Mode (Settings > Socket Mode)
 *   3. Add bot scopes: chat:write, im:history, im:read, im:write, app_mentions:read, users:read
 *   4. Create app-level token with connections:write scope
 *   5. Subscribe to events: message.im, app_mention
 *   6. Install to workspace
 */

import { App, LogLevel } from '@slack/bolt';
import { config } from 'dotenv';
import { loadCredentialsIntoEnv } from './config/index.js';

// Load credentials
loadCredentialsIntoEnv();
config({ quiet: true });

// Validate required environment variables
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN;
const ANTHROPIC_AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN;

if (!SLACK_BOT_TOKEN) {
  console.error('Error: SLACK_BOT_TOKEN environment variable is required');
  console.error('Set it via: cope /credentials set SLACK_BOT_TOKEN xoxb-...');
  process.exit(1);
}

if (!SLACK_APP_TOKEN) {
  console.error('Error: SLACK_APP_TOKEN environment variable is required');
  console.error('Set it via: cope /credentials set SLACK_APP_TOKEN xapp-...');
  process.exit(1);
}

if (!ANTHROPIC_AUTH_TOKEN) {
  console.error('Error: ANTHROPIC_AUTH_TOKEN environment variable is required');
  process.exit(1);
}

// Import agent after credentials are loaded
import { CopeAgent } from './agent.js';

// Create the Slack app with Socket Mode
const app = new App({
  token: SLACK_BOT_TOKEN,
  appToken: SLACK_APP_TOKEN,
  socketMode: true,
  logLevel: process.env.DEBUG ? LogLevel.DEBUG : LogLevel.INFO,
});

// Track active conversations per user
const userAgents = new Map<string, CopeAgent>();

/**
 * Get or create an agent for a user
 */
function getAgentForUser(userId: string): CopeAgent {
  let agent = userAgents.get(userId);
  if (!agent) {
    agent = new CopeAgent();
    userAgents.set(userId, agent);
  }
  return agent;
}

/**
 * Process a message and return the agent's response
 */
async function processMessage(text: string, userId: string): Promise<string> {
  const agent = getAgentForUser(userId);

  try {
    const response = await agent.chat(text);
    return response;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Error processing message for user ${userId}:`, msg);
    return `Sorry, I encountered an error: ${msg}`;
  }
}

// Handle direct messages
app.message(async ({ message, say }) => {
  // Only handle actual messages (not edits, deletes, etc.)
  if (message.subtype) return;

  // Type guard for regular messages
  if (!('text' in message) || !message.text || !('user' in message) || !message.user) {
    return;
  }

  const userId = message.user;
  const text = message.text;

  console.log(`[DM] User ${userId}: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);

  // Show typing indicator (via reaction since Socket Mode doesn't support typing)
  try {
    await app.client.reactions.add({
      token: SLACK_BOT_TOKEN,
      channel: message.channel,
      timestamp: message.ts,
      name: 'hourglass_flowing_sand',
    });
  } catch {
    // Ignore reaction errors
  }

  // Process the message
  const response = await processMessage(text, userId);

  // Remove typing indicator
  try {
    await app.client.reactions.remove({
      token: SLACK_BOT_TOKEN,
      channel: message.channel,
      timestamp: message.ts,
      name: 'hourglass_flowing_sand',
    });
  } catch {
    // Ignore reaction errors
  }

  // Send response
  await say({
    text: response,
    // Use blocks for better formatting
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: response,
        },
      },
    ],
  });

  console.log(`[DM] Response sent to ${userId} (${response.length} chars)`);
});

// Handle @mentions in channels
app.event('app_mention', async ({ event, say }) => {
  const userId = event.user || 'unknown';
  const text = event.text || '';

  // Remove the @mention from the text
  const cleanText = text.replace(/<@[A-Z0-9]+>/g, '').trim();

  if (!cleanText) {
    await say({
      text: "Hi! I'm your COPE agent. Ask me anything or tell me what you need help with.",
      thread_ts: event.ts, // Reply in thread
    });
    return;
  }

  console.log(`[Mention] User ${userId} in ${event.channel}: ${cleanText.substring(0, 100)}...`);

  // Show thinking reaction
  try {
    await app.client.reactions.add({
      token: SLACK_BOT_TOKEN,
      channel: event.channel,
      timestamp: event.ts,
      name: 'thinking_face',
    });
  } catch {
    // Ignore
  }

  // Process the message
  const response = await processMessage(cleanText, userId);

  // Remove thinking reaction
  try {
    await app.client.reactions.remove({
      token: SLACK_BOT_TOKEN,
      channel: event.channel,
      timestamp: event.ts,
      name: 'thinking_face',
    });
  } catch {
    // Ignore
  }

  // Reply in thread
  await say({
    text: response,
    thread_ts: event.ts,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: response,
        },
      },
    ],
  });

  console.log(`[Mention] Response sent (${response.length} chars)`);
});

// Handle app home opened
app.event('app_home_opened', async ({ event, client }) => {
  try {
    await client.views.publish({
      user_id: event.user,
      view: {
        type: 'home',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: 'COPE Agent',
              emoji: true,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Clarify \u00b7 Organise \u00b7 Prioritise \u00b7 Execute*\n\nYour personal executive assistant.',
            },
          },
          {
            type: 'divider',
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*How to use:*\n\u2022 Send me a DM to chat directly\n\u2022 @mention me in a channel for quick questions\n\u2022 I can help with tasks, scheduling, email, and more',
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Examples:*\n\u2022 "What\'s on my calendar today?"\n\u2022 "Set a timer for 5 minutes"\n\u2022 "Check my unread emails"\n\u2022 "Add a task to buy groceries"',
            },
          },
        ],
      },
    });
  } catch (error) {
    console.error('Error publishing home view:', error);
  }
});

// Start the app
(async () => {
  await app.start();

  console.log(`
\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
\u2502  COPE Agent Slack Bot                           \u2502
\u2502  Clarify \u00b7 Organise \u00b7 Prioritise \u00b7 Execute      \u2502
\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518

\u26A1 Socket Mode connected
\uD83D\uDCAC Ready to receive DMs and @mentions

Press Ctrl+C to stop.
`);
})();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down Slack bot...');
  await app.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await app.stop();
  process.exit(0);
});
