/**
 * LifeOS Sanity Module
 *
 * Provides direct Sanity CMS integration for LifeOS data management.
 * No MCP server needed - tools are executed directly via @sanity/client.
 */

// Client
export { getSanityClient, isSanityConfigured } from './client.js';

// Schema types and definitions
export type {
  SanityDocument,
  InboxItem,
  InboxInput,
  OpenLoop,
  OpenLoopInput,
  Goal,
  GoalInput,
  Task,
  TaskInput,
  DocumentType,
} from './schema.js';

export {
  DOCUMENT_TYPES,
  SCHEMA_VERSION,
  SCHEMA_DEFINITIONS,
  getSchemaDefinition,
} from './schema.js';

// Tools
export type { SanityTool } from './tools.js';

export {
  sanityTools,
  getSanityTools,
  getAllSanityTools,
  sanityToolsToAnthropicTools,
  executeSanityTool,
} from './tools.js';

// Initialization
export { initializeLifeOS, getLifeOSStatus } from './init.js';
