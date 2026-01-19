/**
 * LifeOS Sanity Initialization
 *
 * Utilities to verify and initialize the LifeOS Sanity setup.
 * Sanity is schema-less, so we don't deploy schemas - we just
 * verify connectivity and optionally seed initial data.
 */

import { getSanityClient, isSanityConfigured } from './client.js';
import { DOCUMENT_TYPES, SCHEMA_VERSION, SCHEMA_DEFINITIONS } from './schema.js';

export interface LifeOSStatus {
  configured: boolean;
  connected: boolean;
  schemaVersion: number;
  documentCounts: {
    inbox: number;
    openLoop: number;
    goal: number;
    task: number;
  };
  error?: string;
}

/**
 * Get the current status of LifeOS Sanity setup
 */
export async function getLifeOSStatus(): Promise<LifeOSStatus> {
  const status: LifeOSStatus = {
    configured: isSanityConfigured(),
    connected: false,
    schemaVersion: SCHEMA_VERSION,
    documentCounts: {
      inbox: 0,
      openLoop: 0,
      goal: 0,
      task: 0,
    },
  };

  if (!status.configured) {
    status.error = 'Sanity credentials not configured. Set SANITY_PROJECT_ID and SANITY_API_TOKEN.';
    return status;
  }

  try {
    const client = getSanityClient();

    // Test connection and get document counts
    const counts = await client.fetch<{ type: string; count: number }[]>(`
      *[_type in ["inbox", "openLoop", "goal", "task"]] {
        "type": _type
      } | group(type) {
        "type": @.type[0],
        "count": count(@)
      }
    `);

    status.connected = true;

    // Parse counts
    for (const item of counts) {
      if (item.type === 'inbox') status.documentCounts.inbox = item.count;
      if (item.type === 'openLoop') status.documentCounts.openLoop = item.count;
      if (item.type === 'goal') status.documentCounts.goal = item.count;
      if (item.type === 'task') status.documentCounts.task = item.count;
    }
  } catch (error) {
    status.error = error instanceof Error ? error.message : String(error);
  }

  return status;
}

export interface InitOptions {
  /** Create sample documents if the database is empty */
  seedSampleData?: boolean;
  /** Force re-seed even if documents exist */
  force?: boolean;
}

export interface InitResult {
  success: boolean;
  status: LifeOSStatus;
  actions: string[];
  error?: string;
}

/**
 * Initialize LifeOS Sanity setup
 *
 * - Verifies connectivity
 * - Optionally seeds sample data for testing
 */
export async function initializeLifeOS(options: InitOptions = {}): Promise<InitResult> {
  const actions: string[] = [];
  const status = await getLifeOSStatus();

  if (!status.configured) {
    return {
      success: false,
      status,
      actions,
      error: status.error,
    };
  }

  if (!status.connected) {
    return {
      success: false,
      status,
      actions,
      error: `Failed to connect to Sanity: ${status.error}`,
    };
  }

  actions.push('Connected to Sanity successfully');

  // Seed sample data if requested
  if (options.seedSampleData) {
    const totalDocs =
      status.documentCounts.inbox +
      status.documentCounts.openLoop +
      status.documentCounts.goal +
      status.documentCounts.task;

    if (totalDocs > 0 && !options.force) {
      actions.push(`Skipping seed: ${totalDocs} documents already exist (use force to override)`);
    } else {
      try {
        await seedSampleData();
        actions.push('Created sample documents');

        // Refresh status after seeding
        const newStatus = await getLifeOSStatus();
        return {
          success: true,
          status: newStatus,
          actions,
        };
      } catch (error) {
        return {
          success: false,
          status,
          actions,
          error: `Failed to seed data: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  }

  return {
    success: true,
    status,
    actions,
  };
}

/**
 * Seed sample data for testing
 */
async function seedSampleData(): Promise<void> {
  const client = getSanityClient();

  // Create sample goal
  const goal = await client.create({
    _type: DOCUMENT_TYPES.GOAL,
    title: 'Set up LifeOS',
    status: 'in_progress',
    priority: 'P1',
    progress: 50,
    description: 'Get the LifeOS system fully operational',
    keyResults: [
      'Sanity backend connected',
      'All CRUD operations working',
      'Integrated with daily briefing workflow',
    ],
  });

  // Create sample task linked to goal
  await client.create({
    _type: DOCUMENT_TYPES.TASK,
    title: 'Test LifeOS agent',
    status: 'todo',
    priority: 'high',
    relatedGoal: { _type: 'reference', _ref: goal._id },
    notes: 'Run through all the basic operations to verify everything works',
  });

  // Create sample inbox item
  await client.create({
    _type: DOCUMENT_TYPES.INBOX,
    title: 'Sample inbox item',
    content: 'This is a sample capture to test the inbox functionality',
    status: 'unprocessed',
    source: 'manual',
    tags: ['test', 'sample'],
  });

  // Create sample open loop
  await client.create({
    _type: DOCUMENT_TYPES.OPEN_LOOP,
    title: 'Waiting for Sanity API token',
    waitingOn: 'Sanity dashboard',
    status: 'resolved',
    nextAction: 'Add token to .env.local',
    context: 'Need read/write token for LifeOS dataset',
  });
}

/**
 * Print schema documentation to console
 */
export function printSchemaDocumentation(): void {
  console.log('\n=== LifeOS Schema Documentation ===\n');
  console.log(`Schema Version: ${SCHEMA_VERSION}\n`);

  for (const typeDef of SCHEMA_DEFINITIONS) {
    console.log(`## ${typeDef.title} (${typeDef.name})`);
    console.log(`   ${typeDef.description}\n`);
    console.log('   Fields:');
    for (const field of typeDef.fields) {
      const required = field.required ? ' (required)' : '';
      const options = field.options ? ` [${field.options.join(', ')}]` : '';
      console.log(`   - ${field.name}: ${field.type}${required}${options}`);
      console.log(`     ${field.description}`);
    }
    console.log('');
  }
}
