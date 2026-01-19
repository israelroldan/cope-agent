/**
 * LifeOS Sanity Schema
 *
 * This file is the SOURCE OF TRUTH for LifeOS document types in Sanity CMS.
 * Sanity is schema-less, so no Studio deployment is needed - documents are
 * created with whatever structure we define here.
 *
 * When evolving the schema:
 * 1. Update the TypeScript types below
 * 2. Update SCHEMA_DEFINITIONS for documentation
 * 3. Add migration logic to migrateSchema() if needed
 *
 * Focused schema: Inbox, Open Loops, Goals, Tasks, Decisions.
 */

/**
 * Base document fields present in all Sanity documents
 */
export interface SanityDocument {
  _id: string;
  _type: string;
  _createdAt: string;
  _updatedAt: string;
  _rev: string;
}

/**
 * Inbox item - quick captures that need processing
 */
export interface InboxItem extends SanityDocument {
  _type: 'inbox';
  title: string;
  content?: string;
  status: 'unprocessed' | 'processed' | 'archived';
  source?: string; // Where it came from (voice, email, manual, etc.)
  tags?: string[];
}

/**
 * Input for creating an inbox item
 */
export interface InboxInput {
  title: string;
  content?: string;
  status?: 'unprocessed' | 'processed' | 'archived';
  source?: string;
  tags?: string[];
}

/**
 * Open Loop - something waiting on external input/action
 */
export interface OpenLoop extends SanityDocument {
  _type: 'openLoop';
  title: string;
  waitingOn: string; // Who/what we're waiting on
  status: 'active' | 'resolved' | 'stale';
  dueDate?: string; // ISO date string
  nextAction?: string; // What to do when resolved
  context?: string; // Additional context
}

/**
 * Input for creating an open loop
 */
export interface OpenLoopInput {
  title: string;
  waitingOn: string;
  status?: 'active' | 'resolved' | 'stale';
  dueDate?: string;
  nextAction?: string;
  context?: string;
}

/**
 * Goal - larger objectives with progress tracking
 *
 * Supports hierarchy for lightweight OKRs:
 * - Yearly goals (top level)
 *   - Quarterly goals (children of yearly)
 *     - Monthly goals (children of quarterly)
 *       - Weekly goals (children of monthly)
 */
export interface Goal extends SanityDocument {
  _type: 'goal';
  title: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'paused';
  priority: 'P1' | 'P2' | 'P3';
  timeframe?: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'ongoing';
  targetWeek?: string; // ISO week format: "2024-W03"
  progress?: number; // 0-100
  deadline?: string; // ISO date string
  description?: string;
  keyResults?: string[]; // Measurable outcomes
  parentGoal?: { _ref: string; _type: 'reference' }; // Reference to parent goal (for OKR hierarchy)
}

/**
 * Input for creating a goal
 */
export interface GoalInput {
  title: string;
  status?: 'not_started' | 'in_progress' | 'completed' | 'paused';
  priority: 'P1' | 'P2' | 'P3';
  timeframe?: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'ongoing';
  targetWeek?: string;
  progress?: number;
  deadline?: string;
  description?: string;
  keyResults?: string[];
  parentGoal?: string; // Parent goal ID (for OKR hierarchy)
}

/**
 * Task - actionable items with due dates
 */
export interface Task extends SanityDocument {
  _type: 'task';
  title: string;
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
  dueDate?: string; // ISO date string
  relatedGoal?: { _ref: string; _type: 'reference' }; // Reference to a Goal
  notes?: string;
  completedAt?: string; // ISO date string
}

/**
 * Input for creating a task
 */
export interface TaskInput {
  title: string;
  status?: 'todo' | 'in_progress' | 'done' | 'cancelled';
  priority?: 'high' | 'medium' | 'low';
  dueDate?: string;
  relatedGoal?: string; // Goal ID
  notes?: string;
}

/**
 * Decision - important choices that should be tracked
 */
export interface Decision extends SanityDocument {
  _type: 'decision';
  title: string;
  context?: string; // What was the situation/problem
  outcome: string; // What was decided
  rationale?: string; // Why this decision was made
  status: 'pending' | 'made' | 'revisit';
  decidedAt?: string; // ISO date string
  relatedGoal?: { _ref: string; _type: 'reference' }; // Reference to a Goal
  tags?: string[];
}

/**
 * Input for creating a decision
 */
export interface DecisionInput {
  title: string;
  context?: string;
  outcome: string;
  rationale?: string;
  status?: 'pending' | 'made' | 'revisit';
  decidedAt?: string;
  relatedGoal?: string; // Goal ID
  tags?: string[];
}

/**
 * Document type names for GROQ queries
 */
export const DOCUMENT_TYPES = {
  INBOX: 'inbox',
  OPEN_LOOP: 'openLoop',
  GOAL: 'goal',
  TASK: 'task',
  DECISION: 'decision',
} as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[keyof typeof DOCUMENT_TYPES];

// ============================================================================
// SCHEMA DEFINITIONS
// ============================================================================

/**
 * Schema version - increment when making breaking changes
 * that require migration
 */
export const SCHEMA_VERSION = 1;

/**
 * Field definition for documentation
 */
interface FieldDef {
  name: string;
  type: 'string' | 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'array' | 'reference';
  required?: boolean;
  description: string;
  options?: string[]; // For enum-like fields
  of?: string; // For array types
  to?: string; // For reference types
}

/**
 * Document type definition for documentation
 */
interface DocumentTypeDef {
  name: string;
  title: string;
  description: string;
  fields: FieldDef[];
}

/**
 * Complete schema definitions - serves as documentation and can be
 * used to generate Sanity Studio schema if ever needed
 */
export const SCHEMA_DEFINITIONS: DocumentTypeDef[] = [
  {
    name: 'inbox',
    title: 'Inbox',
    description: 'Quick captures that need processing',
    fields: [
      { name: 'title', type: 'string', required: true, description: 'Title of the inbox item' },
      { name: 'content', type: 'text', description: 'Detailed content or notes' },
      {
        name: 'status',
        type: 'string',
        required: true,
        description: 'Processing status',
        options: ['unprocessed', 'processed', 'archived'],
      },
      { name: 'source', type: 'string', description: 'Origin of the capture (voice, email, manual, etc.)' },
      { name: 'tags', type: 'array', of: 'string', description: 'Tags for categorization' },
    ],
  },
  {
    name: 'openLoop',
    title: 'Open Loop',
    description: 'Something waiting on external input or action',
    fields: [
      { name: 'title', type: 'string', required: true, description: 'Description of the open loop' },
      { name: 'waitingOn', type: 'string', required: true, description: 'Who or what you are waiting on' },
      {
        name: 'status',
        type: 'string',
        required: true,
        description: 'Loop status',
        options: ['active', 'resolved', 'stale'],
      },
      { name: 'dueDate', type: 'date', description: 'Expected resolution date' },
      { name: 'nextAction', type: 'string', description: 'What to do when resolved' },
      { name: 'context', type: 'text', description: 'Additional context' },
    ],
  },
  {
    name: 'goal',
    title: 'Goal',
    description:
      'Larger objectives with progress tracking. Supports hierarchy for lightweight OKRs: yearly → quarterly → monthly → weekly goals.',
    fields: [
      { name: 'title', type: 'string', required: true, description: 'Goal title' },
      {
        name: 'status',
        type: 'string',
        required: true,
        description: 'Goal status',
        options: ['not_started', 'in_progress', 'completed', 'paused'],
      },
      {
        name: 'priority',
        type: 'string',
        required: true,
        description: 'Priority level (P1=critical, P2=important, P3=nice-to-have)',
        options: ['P1', 'P2', 'P3'],
      },
      {
        name: 'timeframe',
        type: 'string',
        description: 'Time period for this goal',
        options: ['weekly', 'monthly', 'quarterly', 'yearly', 'ongoing'],
      },
      { name: 'targetWeek', type: 'string', description: 'Target week (ISO format: 2024-W03)' },
      { name: 'progress', type: 'number', description: 'Completion percentage (0-100)' },
      { name: 'deadline', type: 'date', description: 'Target completion date' },
      { name: 'description', type: 'text', description: 'Detailed description' },
      { name: 'keyResults', type: 'array', of: 'string', description: 'Measurable outcomes' },
      {
        name: 'parentGoal',
        type: 'reference',
        to: 'goal',
        description: 'Parent goal for OKR hierarchy (e.g., weekly goal under monthly goal)',
      },
    ],
  },
  {
    name: 'task',
    title: 'Task',
    description: 'Actionable items with priority and due dates',
    fields: [
      { name: 'title', type: 'string', required: true, description: 'Task title (actionable verb preferred)' },
      {
        name: 'status',
        type: 'string',
        required: true,
        description: 'Task status',
        options: ['todo', 'in_progress', 'done', 'cancelled'],
      },
      {
        name: 'priority',
        type: 'string',
        required: true,
        description: 'Priority level (high=today, medium=this week, low=can wait)',
        options: ['high', 'medium', 'low'],
      },
      { name: 'dueDate', type: 'date', description: 'Due date' },
      { name: 'relatedGoal', type: 'reference', to: 'goal', description: 'Related goal' },
      { name: 'notes', type: 'text', description: 'Additional notes' },
      { name: 'completedAt', type: 'datetime', description: 'When the task was completed' },
    ],
  },
  {
    name: 'decision',
    title: 'Decision',
    description: 'Important choices that should be tracked for future reference',
    fields: [
      { name: 'title', type: 'string', required: true, description: 'Brief title of the decision' },
      { name: 'context', type: 'text', description: 'What was the situation or problem' },
      { name: 'outcome', type: 'text', required: true, description: 'What was decided' },
      { name: 'rationale', type: 'text', description: 'Why this decision was made' },
      {
        name: 'status',
        type: 'string',
        required: true,
        description: 'Decision status',
        options: ['pending', 'made', 'revisit'],
      },
      { name: 'decidedAt', type: 'date', description: 'When the decision was made' },
      { name: 'relatedGoal', type: 'reference', to: 'goal', description: 'Related goal' },
      { name: 'tags', type: 'array', of: 'string', description: 'Tags for categorization' },
    ],
  },
];

/**
 * Get schema definition by document type name
 */
export function getSchemaDefinition(typeName: string): DocumentTypeDef | undefined {
  return SCHEMA_DEFINITIONS.find(def => def.name === typeName);
}
