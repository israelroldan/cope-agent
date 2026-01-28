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

/**
 * Timer document from Sanity
 */
export interface SanityTimer {
  _id: string;
  _type: 'timer';
  id: string;
  label: string;
  endTime: number;
  durationMs: number;
  status: 'active' | 'expired' | 'cancelled';
  deviceId?: string;
  _createdAt: string;
  _updatedAt: string;
}

/**
 * Listener event for timer changes
 */
export interface TimerListenerEvent {
  type: 'sync' | 'create' | 'update' | 'delete';
  timers: SanityTimer[];
  changedTimer?: SanityTimer;
  deletedId?: string;
}

/**
 * Subscribe to timer changes in real-time
 *
 * Returns an unsubscribe function to stop listening.
 *
 * @param callback Function called when timers change
 * @param onError Optional error handler
 */
export function subscribeToTimers(
  callback: (event: TimerListenerEvent) => void,
  onError?: (error: Error) => void
): () => void {
  if (!isSanityConfigured()) {
    onError?.(new Error('Sanity not configured'));
    return () => {};
  }

  const client = getSanityClient();

  // First, fetch all active timers for initial sync
  const initialQuery = `*[_type == "timer" && status == "active"] | order(endTime asc)`;

  client.fetch<SanityTimer[]>(initialQuery)
    .then(timers => {
      callback({ type: 'sync', timers });
    })
    .catch(error => {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    });

  // Subscribe to real-time changes
  // Listen for all timer document changes
  const query = `*[_type == "timer"]`;

  const subscription = client.listen<SanityTimer>(query, {}, {
    includeResult: true,
    includePreviousRevision: false,
    visibility: 'query',
  }).subscribe({
    next: (update) => {
      // Re-fetch all active timers on any change
      // This is simpler than trying to merge individual changes
      client.fetch<SanityTimer[]>(initialQuery)
        .then(timers => {
          // Type narrow - 'mutation' events have transition, result, documentId
          if ('transition' in update && 'result' in update) {
            const mutationEvent = update as { transition: string; result?: SanityTimer; documentId?: string };
            if (mutationEvent.transition === 'update' && mutationEvent.result) {
              callback({
                type: 'update',
                timers,
                changedTimer: mutationEvent.result,
              });
            } else if (mutationEvent.transition === 'appear' && mutationEvent.result) {
              callback({
                type: 'create',
                timers,
                changedTimer: mutationEvent.result,
              });
            } else if (mutationEvent.transition === 'disappear') {
              callback({
                type: 'delete',
                timers,
                deletedId: mutationEvent.documentId,
              });
            } else {
              callback({ type: 'sync', timers });
            }
          } else {
            // Welcome/reconnect event - just sync
            callback({ type: 'sync', timers });
          }
        })
        .catch(error => {
          onError?.(error instanceof Error ? error : new Error(String(error)));
        });
    },
    error: (error) => {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    },
  });

  // Return unsubscribe function
  return () => {
    subscription.unsubscribe();
  };
}
