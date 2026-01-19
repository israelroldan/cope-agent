/**
 * Sanity CMS Client
 *
 * Lazy-initialized client for LifeOS data in Sanity.
 * Credentials are loaded from environment variables.
 */

import { createClient, type SanityClient } from '@sanity/client';

// Lazy-initialized client
let client: SanityClient | null = null;

/**
 * Get or create the Sanity client
 *
 * Required env vars:
 * - SANITY_PROJECT_ID: Your Sanity project ID
 * - SANITY_DATASET: Dataset name (default: production)
 * - SANITY_API_TOKEN: API token with read/write permissions
 */
export function getSanityClient(): SanityClient {
  if (!client) {
    const projectId = process.env.SANITY_PROJECT_ID;
    const dataset = process.env.SANITY_DATASET || 'production';
    const token = process.env.SANITY_API_TOKEN;

    if (!projectId) {
      throw new Error('SANITY_PROJECT_ID environment variable is required');
    }

    if (!token) {
      throw new Error('SANITY_API_TOKEN environment variable is required');
    }

    client = createClient({
      projectId,
      dataset,
      token,
      apiVersion: '2024-01-01',
      useCdn: false, // We need fresh data for LifeOS operations
    });

    if (process.env.DEBUG) {
      console.log(`[DEBUG] Sanity client initialized: project=${projectId}, dataset=${dataset}`);
    }
  }

  return client;
}

/**
 * Check if Sanity credentials are configured
 */
export function isSanityConfigured(): boolean {
  return !!(process.env.SANITY_PROJECT_ID && process.env.SANITY_API_TOKEN);
}
