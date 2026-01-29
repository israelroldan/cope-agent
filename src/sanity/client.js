"use strict";
/**
 * Sanity CMS Client
 *
 * Lazy-initialized client for LifeOS data in Sanity.
 * Credentials are loaded from environment variables.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSanityClient = getSanityClient;
exports.isSanityConfigured = isSanityConfigured;
exports.subscribeToTimers = subscribeToTimers;
const client_1 = require("@sanity/client");
// Lazy-initialized client
let client = null;
/**
 * Get or create the Sanity client
 *
 * Required env vars:
 * - SANITY_PROJECT_ID: Your Sanity project ID
 * - SANITY_DATASET: Dataset name (default: production)
 * - SANITY_API_TOKEN: API token with read/write permissions
 */
function getSanityClient() {
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
        client = (0, client_1.createClient)({
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
function isSanityConfigured() {
    return !!(process.env.SANITY_PROJECT_ID && process.env.SANITY_API_TOKEN);
}
/**
 * Subscribe to timer changes in real-time
 *
 * Returns an unsubscribe function to stop listening.
 *
 * @param callback Function called when timers change
 * @param onError Optional error handler
 */
function subscribeToTimers(callback, onError) {
    if (!isSanityConfigured()) {
        onError?.(new Error('Sanity not configured'));
        return () => { };
    }
    const client = getSanityClient();
    // First, fetch all active timers for initial sync
    const initialQuery = `*[_type == "timer" && status == "active"] | order(endTime asc)`;
    client.fetch(initialQuery)
        .then(timers => {
        callback({ type: 'sync', timers });
    })
        .catch(error => {
        onError?.(error instanceof Error ? error : new Error(String(error)));
    });
    // Subscribe to real-time changes
    // Listen for all timer document changes
    const query = `*[_type == "timer"]`;
    const subscription = client.listen(query, {}, {
        includeResult: true,
        includePreviousRevision: false,
        visibility: 'query',
    }).subscribe({
        next: (update) => {
            // Re-fetch all active timers on any change
            // This is simpler than trying to merge individual changes
            client.fetch(initialQuery)
                .then(timers => {
                // Type narrow - 'mutation' events have transition, result, documentId
                if ('transition' in update && 'result' in update) {
                    const mutationEvent = update;
                    if (mutationEvent.transition === 'update' && mutationEvent.result) {
                        callback({
                            type: 'update',
                            timers,
                            changedTimer: mutationEvent.result,
                        });
                    }
                    else if (mutationEvent.transition === 'appear' && mutationEvent.result) {
                        callback({
                            type: 'create',
                            timers,
                            changedTimer: mutationEvent.result,
                        });
                    }
                    else if (mutationEvent.transition === 'disappear') {
                        callback({
                            type: 'delete',
                            timers,
                            deletedId: mutationEvent.documentId,
                        });
                    }
                    else {
                        callback({ type: 'sync', timers });
                    }
                }
                else {
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
//# sourceMappingURL=client.js.map