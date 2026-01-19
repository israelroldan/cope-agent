/**
 * Sanity CLI Configuration
 *
 * This file is used by the Sanity CLI commands.
 * It reads credentials from the same .env file as the agent.
 */

import { defineCliConfig } from 'sanity/cli';
import { config } from 'dotenv';

// Load environment variables
config();

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_PROJECT_ID,
    dataset: process.env.SANITY_DATASET || 'production',
  },
});
