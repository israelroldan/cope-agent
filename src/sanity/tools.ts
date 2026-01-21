/**
 * LifeOS Sanity Tools
 *
 * CRUD tools for LifeOS data in Sanity CMS.
 * 21 tools: 3 per document type (create, query, update/delete).
 */

import type Anthropic from '@anthropic-ai/sdk';
import { getSanityClient, isSanityConfigured } from './client.js';
import type {
  InboxItem,
  InboxInput,
  OpenLoop,
  OpenLoopInput,
  Goal,
  GoalInput,
  Project,
  ProjectInput,
  Task,
  TaskInput,
  Decision,
  DecisionInput,
  Note,
  NoteInput,
} from './schema.js';
import { DOCUMENT_TYPES } from './schema.js';

/**
 * Sanity tool interface (similar to UtilityTool)
 */
export interface SanityTool {
  name: string;
  description: string;
  input_schema: Anthropic.Tool.InputSchema;
  execute: (input: Record<string, unknown>) => Promise<string>;
}

// ============================================================================
// INBOX TOOLS
// ============================================================================

export const createInboxTool: SanityTool = {
  name: 'lifeos_create_inbox',
  description: `Create a new inbox item in LifeOS. Use for quick captures that need processing later.

Example: Capture a thought, note, or item to process later.`,

  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Title of the inbox item',
      },
      content: {
        type: 'string',
        description: 'Optional detailed content',
      },
      source: {
        type: 'string',
        description: 'Where this came from (voice, email, manual, etc.)',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional tags for categorization',
      },
    },
    required: ['title'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    try {
      const client = getSanityClient();
      const data: InboxInput = {
        title: String(input.title),
        content: input.content ? String(input.content) : undefined,
        status: 'unprocessed',
        source: input.source ? String(input.source) : undefined,
        tags: Array.isArray(input.tags) ? input.tags.map(String) : undefined,
      };

      const result = await client.create({
        _type: DOCUMENT_TYPES.INBOX,
        ...data,
      });

      return JSON.stringify({
        success: true,
        id: result._id,
        message: `Inbox item "${data.title}" created`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
};

export const queryInboxTool: SanityTool = {
  name: 'lifeos_query_inbox',
  description: `Query inbox items from LifeOS. Returns items matching the filter criteria.

Use GROQ filters like:
- status == "unprocessed" (default)
- All items: no filter needed
- By tag: "work" in tags`,

  input_schema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['unprocessed', 'processed', 'archived', 'all'],
        description: 'Filter by status (default: unprocessed)',
      },
      limit: {
        type: 'number',
        description: 'Max items to return (default: 20)',
      },
    },
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    try {
      const client = getSanityClient();
      const status = input.status || 'unprocessed';
      const limit = Number(input.limit) || 20;

      let query = `*[_type == "${DOCUMENT_TYPES.INBOX}"`;
      if (status !== 'all') {
        query += ` && status == "${status}"`;
      }
      query += `] | order(_createdAt desc) [0...${limit}] {
        _id, title, content, status, source, tags, _createdAt
      }`;

      const results = await client.fetch<InboxItem[]>(query);

      return JSON.stringify({
        success: true,
        count: results.length,
        items: results,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
};

export const updateInboxTool: SanityTool = {
  name: 'lifeos_update_inbox',
  description: `Update an inbox item in LifeOS. Use to mark as processed, add content, or archive.`,

  input_schema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The _id of the inbox item to update',
      },
      status: {
        type: 'string',
        enum: ['unprocessed', 'processed', 'archived'],
        description: 'New status',
      },
      title: {
        type: 'string',
        description: 'Updated title',
      },
      content: {
        type: 'string',
        description: 'Updated content',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Updated tags',
      },
      source: {
        type: 'string',
        description: 'Updated source (voice, email, manual, etc.)',
      },
    },
    required: ['id'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    try {
      const client = getSanityClient();
      const id = String(input.id);

      const updates: Partial<InboxInput> = {};
      if (input.status) updates.status = input.status as InboxInput['status'];
      if (input.title) updates.title = String(input.title);
      if (input.content) updates.content = String(input.content);
      if (Array.isArray(input.tags)) updates.tags = input.tags.map(String);
      if (input.source) updates.source = String(input.source);

      const result = await client.patch(id).set(updates).commit();

      return JSON.stringify({
        success: true,
        id: result._id,
        message: 'Inbox item updated',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
};

// ============================================================================
// OPEN LOOP TOOLS
// ============================================================================

export const createOpenLoopTool: SanityTool = {
  name: 'lifeos_create_openloop',
  description: `Create a new open loop in LifeOS. Use when waiting on someone or something external.

Example: "Waiting on John to review the proposal"`,

  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Title describing the open loop',
      },
      waitingOn: {
        type: 'string',
        description: 'Who or what you are waiting on',
      },
      dueDate: {
        type: 'string',
        description: 'Expected resolution date (ISO format: YYYY-MM-DD)',
      },
      nextAction: {
        type: 'string',
        description: 'What to do when this resolves',
      },
      context: {
        type: 'string',
        description: 'Additional context',
      },
      relatedProject: {
        type: 'string',
        description: 'ID of related project (optional)',
      },
    },
    required: ['title', 'waitingOn'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    try {
      const client = getSanityClient();
      const data: OpenLoopInput = {
        title: String(input.title),
        waitingOn: String(input.waitingOn),
        status: 'active',
        dueDate: input.dueDate ? String(input.dueDate) : undefined,
        nextAction: input.nextAction ? String(input.nextAction) : undefined,
        context: input.context ? String(input.context) : undefined,
        relatedProject: input.relatedProject ? String(input.relatedProject) : undefined,
      };

      const doc: { _type: string; [key: string]: unknown } = {
        _type: DOCUMENT_TYPES.OPEN_LOOP,
        title: data.title,
        waitingOn: data.waitingOn,
        status: data.status,
      };
      if (data.dueDate) doc.dueDate = data.dueDate;
      if (data.nextAction) doc.nextAction = data.nextAction;
      if (data.context) doc.context = data.context;
      if (data.relatedProject) {
        doc.relatedProject = { _type: 'reference', _ref: data.relatedProject };
      }

      const result = await client.create(doc);

      return JSON.stringify({
        success: true,
        id: result._id,
        message: `Open loop "${data.title}" created (waiting on: ${data.waitingOn})`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
};

export const queryOpenLoopsTool: SanityTool = {
  name: 'lifeos_query_openloops',
  description: `Query open loops from LifeOS. Returns items you're waiting on.

Filter by status:
- active (default): Currently waiting
- resolved: Completed loops
- stale: Overdue or needs attention
- all: Everything`,

  input_schema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['active', 'resolved', 'stale', 'all'],
        description: 'Filter by status (default: active)',
      },
      relatedProject: {
        type: 'string',
        description: 'Filter by project ID',
      },
      limit: {
        type: 'number',
        description: 'Max items to return (default: 20)',
      },
    },
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    try {
      const client = getSanityClient();
      const status = input.status || 'active';
      const limit = Number(input.limit) || 20;

      let query = `*[_type == "${DOCUMENT_TYPES.OPEN_LOOP}"`;
      if (status !== 'all') {
        query += ` && status == "${status}"`;
      }
      if (input.relatedProject) {
        query += ` && relatedProject._ref == "${input.relatedProject}"`;
      }
      query += `] | order(dueDate asc, _createdAt desc) [0...${limit}] {
        _id, title, waitingOn, status, dueDate, nextAction, context, _createdAt,
        "relatedProject": relatedProject->{_id, title, priority}
      }`;

      const results = await client.fetch<OpenLoop[]>(query);

      return JSON.stringify({
        success: true,
        count: results.length,
        items: results,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
};

export const updateOpenLoopTool: SanityTool = {
  name: 'lifeos_update_openloop',
  description: `Update an open loop in LifeOS. Use to mark as resolved, update due date, etc.`,

  input_schema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The _id of the open loop to update',
      },
      status: {
        type: 'string',
        enum: ['active', 'resolved', 'stale'],
        description: 'New status',
      },
      title: {
        type: 'string',
        description: 'Updated title',
      },
      waitingOn: {
        type: 'string',
        description: 'Updated waiting on',
      },
      dueDate: {
        type: 'string',
        description: 'Updated due date (ISO format)',
      },
      nextAction: {
        type: 'string',
        description: 'Updated next action',
      },
      context: {
        type: 'string',
        description: 'Updated context',
      },
      relatedProject: {
        type: 'string',
        description: 'Link to project ID',
      },
    },
    required: ['id'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    try {
      const client = getSanityClient();
      const id = String(input.id);

      const updates: Record<string, unknown> = {};
      if (input.status) updates.status = input.status;
      if (input.title) updates.title = String(input.title);
      if (input.waitingOn) updates.waitingOn = String(input.waitingOn);
      if (input.dueDate) updates.dueDate = String(input.dueDate);
      if (input.nextAction) updates.nextAction = String(input.nextAction);
      if (input.context) updates.context = String(input.context);
      if (input.relatedProject) {
        updates.relatedProject = { _type: 'reference', _ref: String(input.relatedProject) };
      }

      const result = await client.patch(id).set(updates).commit();

      return JSON.stringify({
        success: true,
        id: result._id,
        message: 'Open loop updated',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
};

// ============================================================================
// GOAL TOOLS
// ============================================================================

export const createGoalTool: SanityTool = {
  name: 'lifeos_create_goal',
  description: `Create a new goal in LifeOS. Use for larger objectives with progress tracking.

Supports OKR-style hierarchy: yearly → quarterly → monthly → weekly goals.

Priority levels:
- P1: Must happen (critical)
- P2: Should happen (important)
- P3: Nice to have

Timeframes:
- weekly: Goals for this week
- monthly: Goals for this month
- quarterly: Goals for this quarter
- yearly: Goals for this year
- ongoing: No specific end date

Use parentGoal to link to a higher-level goal (e.g., link weekly goal to monthly goal).`,

  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Goal title',
      },
      priority: {
        type: 'string',
        enum: ['P1', 'P2', 'P3'],
        description: 'Priority level',
      },
      timeframe: {
        type: 'string',
        enum: ['weekly', 'monthly', 'quarterly', 'yearly', 'ongoing'],
        description: 'Time period for this goal',
      },
      targetWeek: {
        type: 'string',
        description: 'Target week in ISO format (e.g., 2024-W03). Auto-set for weekly goals.',
      },
      deadline: {
        type: 'string',
        description: 'Target completion date (ISO format)',
      },
      description: {
        type: 'string',
        description: 'Detailed description',
      },
      keyResults: {
        type: 'array',
        items: { type: 'string' },
        description: 'Measurable outcomes',
      },
      parentGoal: {
        type: 'string',
        description: 'ID of parent goal for OKR hierarchy (e.g., link weekly goal to monthly goal)',
      },
    },
    required: ['title', 'priority'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    try {
      const client = getSanityClient();

      // Auto-calculate targetWeek for weekly goals if not provided
      let targetWeek = input.targetWeek ? String(input.targetWeek) : undefined;
      if (input.timeframe === 'weekly' && !targetWeek) {
        const now = new Date();
        const year = now.getFullYear();
        const start = new Date(year, 0, 1);
        const diff = now.getTime() - start.getTime();
        const oneWeek = 1000 * 60 * 60 * 24 * 7;
        const weekNum = Math.ceil(diff / oneWeek);
        targetWeek = `${year}-W${String(weekNum).padStart(2, '0')}`;
      }

      const data: GoalInput = {
        title: String(input.title),
        priority: input.priority as GoalInput['priority'],
        status: 'not_started',
        progress: 0,
        timeframe: input.timeframe as GoalInput['timeframe'],
        targetWeek,
        deadline: input.deadline ? String(input.deadline) : undefined,
        description: input.description ? String(input.description) : undefined,
        keyResults: Array.isArray(input.keyResults) ? input.keyResults.map(String) : undefined,
        parentGoal: input.parentGoal ? String(input.parentGoal) : undefined,
      };

      // Build document with proper reference structure
      const doc: { _type: string; [key: string]: unknown } = {
        _type: DOCUMENT_TYPES.GOAL,
        title: data.title,
        priority: data.priority,
        status: data.status,
        progress: data.progress,
      };
      if (data.timeframe) doc.timeframe = data.timeframe;
      if (data.targetWeek) doc.targetWeek = data.targetWeek;
      if (data.deadline) doc.deadline = data.deadline;
      if (data.description) doc.description = data.description;
      if (data.keyResults) doc.keyResults = data.keyResults;
      if (data.parentGoal) {
        doc.parentGoal = { _type: 'reference', _ref: data.parentGoal };
      }

      const result = await client.create(doc);

      const timeInfo = data.timeframe ? ` [${data.timeframe}]` : '';
      const parentInfo = data.parentGoal ? ' (linked to parent)' : '';
      return JSON.stringify({
        success: true,
        id: result._id,
        message: `Goal "${data.title}" created (${data.priority})${timeInfo}${parentInfo}`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
};

export const queryGoalsTool: SanityTool = {
  name: 'lifeos_query_goals',
  description: `Query goals from LifeOS. Returns goals with progress tracking and hierarchy.

Filter by:
- status: not_started, in_progress, completed, paused
- priority: P1, P2, P3
- timeframe: weekly, monthly, quarterly, yearly, ongoing
- targetWeek: ISO week (e.g., 2024-W03) for weekly goals
- parentGoal: ID to get child goals of a specific goal
- topLevel: true to get only goals without parents (root goals)`,

  input_schema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['not_started', 'in_progress', 'completed', 'paused', 'all'],
        description: 'Filter by status (default: all active = not completed/paused)',
      },
      priority: {
        type: 'string',
        enum: ['P1', 'P2', 'P3', 'all'],
        description: 'Filter by priority (default: all)',
      },
      timeframe: {
        type: 'string',
        enum: ['weekly', 'monthly', 'quarterly', 'yearly', 'ongoing', 'all'],
        description: 'Filter by timeframe (default: all)',
      },
      targetWeek: {
        type: 'string',
        description: 'Filter weekly goals by ISO week (e.g., 2024-W03)',
      },
      parentGoal: {
        type: 'string',
        description: 'Get child goals of this parent goal ID',
      },
      topLevel: {
        type: 'boolean',
        description: 'If true, only return goals without a parent (root/top-level goals)',
      },
      includeChildren: {
        type: 'boolean',
        description: 'If true, include child goals in the response',
      },
      limit: {
        type: 'number',
        description: 'Max items to return (default: 20)',
      },
    },
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    try {
      const client = getSanityClient();
      const status = input.status || 'all';
      const priority = input.priority || 'all';
      const timeframe = input.timeframe || 'all';
      const limit = Number(input.limit) || 20;

      let query = `*[_type == "${DOCUMENT_TYPES.GOAL}"`;

      // Status filter
      if (status === 'all') {
        // Show active goals by default (not completed or paused)
        query += ` && status in ["not_started", "in_progress"]`;
      } else if (status !== 'all') {
        query += ` && status == "${status}"`;
      }

      // Priority filter
      if (priority !== 'all') {
        query += ` && priority == "${priority}"`;
      }

      // Timeframe filter
      if (timeframe !== 'all') {
        query += ` && timeframe == "${timeframe}"`;
      }

      // Target week filter
      if (input.targetWeek) {
        query += ` && targetWeek == "${input.targetWeek}"`;
      }

      // Parent goal filter (get children of a specific goal)
      if (input.parentGoal) {
        query += ` && parentGoal._ref == "${input.parentGoal}"`;
      }

      // Top level filter (goals without parents)
      if (input.topLevel === true) {
        query += ` && !defined(parentGoal)`;
      }

      // Build projection with optional children
      let projection = `{
        _id, title, status, priority, timeframe, targetWeek, progress, deadline, description, keyResults, _createdAt,
        "parentGoal": parentGoal->{_id, title, priority, timeframe}`;

      if (input.includeChildren === true) {
        projection += `,
        "children": *[_type == "goal" && parentGoal._ref == ^._id] | order(priority asc) {
          _id, title, status, priority, timeframe, targetWeek, progress
        }`;
      }

      projection += `}`;

      query += `] | order(priority asc, deadline asc) [0...${limit}] ${projection}`;

      const results = await client.fetch<Goal[]>(query);

      return JSON.stringify({
        success: true,
        count: results.length,
        items: results,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
};

export const updateGoalTool: SanityTool = {
  name: 'lifeos_update_goal',
  description: `Update a goal in LifeOS. Use to update progress, status, timeframe, parent link, etc.`,

  input_schema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The _id of the goal to update',
      },
      status: {
        type: 'string',
        enum: ['not_started', 'in_progress', 'completed', 'paused'],
        description: 'New status',
      },
      progress: {
        type: 'number',
        description: 'Progress percentage (0-100)',
      },
      title: {
        type: 'string',
        description: 'Updated title',
      },
      priority: {
        type: 'string',
        enum: ['P1', 'P2', 'P3'],
        description: 'Updated priority',
      },
      timeframe: {
        type: 'string',
        enum: ['weekly', 'monthly', 'quarterly', 'yearly', 'ongoing'],
        description: 'Updated timeframe',
      },
      targetWeek: {
        type: 'string',
        description: 'Updated target week (ISO format: 2024-W03)',
      },
      deadline: {
        type: 'string',
        description: 'Updated deadline (ISO format)',
      },
      description: {
        type: 'string',
        description: 'Updated description',
      },
      keyResults: {
        type: 'array',
        items: { type: 'string' },
        description: 'Updated key results (measurable outcomes)',
      },
      parentGoal: {
        type: 'string',
        description: 'Link to parent goal ID (for OKR hierarchy)',
      },
      removeParent: {
        type: 'boolean',
        description: 'Set to true to remove parent goal link',
      },
    },
    required: ['id'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    try {
      const client = getSanityClient();
      const id = String(input.id);

      const updates: Record<string, unknown> = {};
      if (input.status) updates.status = input.status;
      if (input.progress !== undefined) updates.progress = Number(input.progress);
      if (input.title) updates.title = String(input.title);
      if (input.priority) updates.priority = input.priority;
      if (input.timeframe) updates.timeframe = input.timeframe;
      if (input.targetWeek) updates.targetWeek = String(input.targetWeek);
      if (input.deadline) updates.deadline = String(input.deadline);
      if (input.description) updates.description = String(input.description);
      if (Array.isArray(input.keyResults)) updates.keyResults = input.keyResults.map(String);

      // Handle parent goal reference
      if (input.parentGoal) {
        updates.parentGoal = { _type: 'reference', _ref: String(input.parentGoal) };
      }

      // Build patch
      let patch = client.patch(id).set(updates);

      // Handle removing parent goal
      if (input.removeParent === true) {
        patch = patch.unset(['parentGoal']);
      }

      const result = await patch.commit();

      return JSON.stringify({
        success: true,
        id: result._id,
        message: 'Goal updated',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
};

// ============================================================================
// PROJECT TOOLS
// ============================================================================

export const createProjectTool: SanityTool = {
  name: 'lifeos_create_project',
  description: `Create a new project in LifeOS. Use for grouping related tasks and work.

Priority levels:
- P1: Critical, must complete
- P2: Important
- P3: Nice to have

Status options:
- not_started: Haven't begun
- in_progress: Actively working
- completed: Done
- paused: Temporarily stopped
- on_hold: Waiting on external factors`,

  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Project title',
      },
      description: {
        type: 'string',
        description: 'Project description',
      },
      priority: {
        type: 'string',
        enum: ['P1', 'P2', 'P3'],
        description: 'Priority level',
      },
      status: {
        type: 'string',
        enum: ['not_started', 'in_progress', 'completed', 'paused', 'on_hold'],
        description: 'Project status (default: not_started)',
      },
      relatedGoal: {
        type: 'string',
        description: 'ID of related goal (optional)',
      },
      deadline: {
        type: 'string',
        description: 'Target completion date (ISO format)',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags for categorization',
      },
    },
    required: ['title', 'priority'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    try {
      const client = getSanityClient();
      const data: ProjectInput = {
        title: String(input.title),
        description: input.description ? String(input.description) : undefined,
        priority: input.priority as ProjectInput['priority'],
        status: (input.status as ProjectInput['status']) || 'not_started',
        relatedGoal: input.relatedGoal ? String(input.relatedGoal) : undefined,
        deadline: input.deadline ? String(input.deadline) : undefined,
        tags: Array.isArray(input.tags) ? input.tags.map(String) : undefined,
      };

      const doc: { _type: string; [key: string]: unknown } = {
        _type: DOCUMENT_TYPES.PROJECT,
        title: data.title,
        priority: data.priority,
        status: data.status,
      };
      if (data.description) doc.description = data.description;
      if (data.deadline) doc.deadline = data.deadline;
      if (data.tags) doc.tags = data.tags;
      if (data.relatedGoal) {
        doc.relatedGoal = { _type: 'reference', _ref: data.relatedGoal };
      }

      const result = await client.create(doc);

      return JSON.stringify({
        success: true,
        id: result._id,
        message: `Project "${data.title}" created (${data.priority})`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
};

export const queryProjectsTool: SanityTool = {
  name: 'lifeos_query_projects',
  description: `Query projects from LifeOS. Returns projects matching filter criteria.

Filter by:
- status: not_started, in_progress, completed, paused, on_hold
- priority: P1, P2, P3`,

  input_schema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['not_started', 'in_progress', 'completed', 'paused', 'on_hold', 'active', 'all'],
        description: 'Filter by status. "active" = not_started + in_progress (default)',
      },
      priority: {
        type: 'string',
        enum: ['P1', 'P2', 'P3', 'all'],
        description: 'Filter by priority (default: all)',
      },
      relatedGoal: {
        type: 'string',
        description: 'Filter by related goal ID',
      },
      limit: {
        type: 'number',
        description: 'Max items to return (default: 20)',
      },
    },
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    try {
      const client = getSanityClient();
      const status = input.status || 'active';
      const priority = input.priority || 'all';
      const limit = Number(input.limit) || 20;

      let query = `*[_type == "${DOCUMENT_TYPES.PROJECT}"`;

      // Status filter
      if (status === 'active') {
        query += ` && status in ["not_started", "in_progress"]`;
      } else if (status !== 'all') {
        query += ` && status == "${status}"`;
      }

      // Priority filter
      if (priority !== 'all') {
        query += ` && priority == "${priority}"`;
      }

      // Related goal filter
      if (input.relatedGoal) {
        query += ` && relatedGoal._ref == "${input.relatedGoal}"`;
      }

      query += `] | order(priority asc, deadline asc, _createdAt desc) [0...${limit}] {
        _id, title, description, status, priority, deadline, tags, _createdAt,
        "relatedGoal": relatedGoal->{_id, title, priority}
      }`;

      const results = await client.fetch<Project[]>(query);

      return JSON.stringify({
        success: true,
        count: results.length,
        items: results,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
};

export const updateProjectTool: SanityTool = {
  name: 'lifeos_update_project',
  description: `Update a project in LifeOS. Use to update status, priority, description, etc.`,

  input_schema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The _id of the project to update',
      },
      title: {
        type: 'string',
        description: 'Updated title',
      },
      description: {
        type: 'string',
        description: 'Updated description',
      },
      status: {
        type: 'string',
        enum: ['not_started', 'in_progress', 'completed', 'paused', 'on_hold'],
        description: 'New status',
      },
      priority: {
        type: 'string',
        enum: ['P1', 'P2', 'P3'],
        description: 'Updated priority',
      },
      deadline: {
        type: 'string',
        description: 'Updated deadline (ISO format)',
      },
      relatedGoal: {
        type: 'string',
        description: 'Link to goal ID',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Updated tags',
      },
    },
    required: ['id'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    try {
      const client = getSanityClient();
      const id = String(input.id);

      const updates: Record<string, unknown> = {};
      if (input.title) updates.title = String(input.title);
      if (input.description) updates.description = String(input.description);
      if (input.status) updates.status = input.status;
      if (input.priority) updates.priority = input.priority;
      if (input.deadline) updates.deadline = String(input.deadline);
      if (Array.isArray(input.tags)) updates.tags = input.tags.map(String);
      if (input.relatedGoal) {
        updates.relatedGoal = { _type: 'reference', _ref: String(input.relatedGoal) };
      }

      const result = await client.patch(id).set(updates).commit();

      return JSON.stringify({
        success: true,
        id: result._id,
        message: 'Project updated',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
};

// ============================================================================
// TASK TOOLS
// ============================================================================

export const createTaskTool: SanityTool = {
  name: 'lifeos_create_task',
  description: `Create a new task in LifeOS. Use for actionable items with due dates.

Priority levels:
- high: Do today/ASAP
- medium: This week
- low: Can wait`,

  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Task title (actionable verb preferred)',
      },
      priority: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description: 'Priority level (default: medium)',
      },
      dueDate: {
        type: 'string',
        description: 'Due date (ISO format)',
      },
      relatedGoal: {
        type: 'string',
        description: 'ID of related goal (optional)',
      },
      relatedProject: {
        type: 'string',
        description: 'ID of related project (optional)',
      },
      notes: {
        type: 'string',
        description: 'Additional notes',
      },
    },
    required: ['title'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    try {
      const client = getSanityClient();
      const data: TaskInput = {
        title: String(input.title),
        status: 'todo',
        priority: (input.priority as TaskInput['priority']) || 'medium',
        dueDate: input.dueDate ? String(input.dueDate) : undefined,
        relatedGoal: input.relatedGoal ? String(input.relatedGoal) : undefined,
        relatedProject: input.relatedProject ? String(input.relatedProject) : undefined,
        notes: input.notes ? String(input.notes) : undefined,
      };

      // Build the document, handling references specially
      const doc: { _type: string; [key: string]: unknown } = {
        _type: DOCUMENT_TYPES.TASK,
        title: data.title,
        status: data.status,
        priority: data.priority,
      };
      if (data.dueDate) doc.dueDate = data.dueDate;
      if (data.notes) doc.notes = data.notes;
      if (data.relatedGoal) {
        doc.relatedGoal = { _type: 'reference', _ref: data.relatedGoal };
      }
      if (data.relatedProject) {
        doc.relatedProject = { _type: 'reference', _ref: data.relatedProject };
      }

      const result = await client.create(doc);

      return JSON.stringify({
        success: true,
        id: result._id,
        message: `Task "${data.title}" created (${data.priority} priority)`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
};

export const queryTasksTool: SanityTool = {
  name: 'lifeos_query_tasks',
  description: `Query tasks from LifeOS. Returns tasks matching filter criteria.

Filter by:
- status: todo, in_progress, done, cancelled
- priority: high, medium, low
- dueDate: today, overdue, upcoming
- relatedProject: filter by project ID`,

  input_schema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['todo', 'in_progress', 'done', 'cancelled', 'active', 'all'],
        description: 'Filter by status. "active" = todo + in_progress (default)',
      },
      priority: {
        type: 'string',
        enum: ['high', 'medium', 'low', 'all'],
        description: 'Filter by priority (default: all)',
      },
      dueFilter: {
        type: 'string',
        enum: ['today', 'overdue', 'upcoming', 'all'],
        description: 'Filter by due date: today, overdue (<today), upcoming (<=7 days)',
      },
      relatedProject: {
        type: 'string',
        description: 'Filter by project ID',
      },
      limit: {
        type: 'number',
        description: 'Max items to return (default: 20)',
      },
    },
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    try {
      const client = getSanityClient();
      const status = input.status || 'active';
      const priority = input.priority || 'all';
      const dueFilter = input.dueFilter || 'all';
      const limit = Number(input.limit) || 20;

      // Get today's date in ISO format
      const today = new Date().toISOString().split('T')[0];
      const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      let query = `*[_type == "${DOCUMENT_TYPES.TASK}"`;

      // Status filter
      if (status === 'active') {
        query += ` && status in ["todo", "in_progress"]`;
      } else if (status !== 'all') {
        query += ` && status == "${status}"`;
      }

      // Priority filter
      if (priority !== 'all') {
        query += ` && priority == "${priority}"`;
      }

      // Due date filter
      if (dueFilter === 'today') {
        query += ` && dueDate == "${today}"`;
      } else if (dueFilter === 'overdue') {
        query += ` && dueDate < "${today}" && dueDate != null`;
      } else if (dueFilter === 'upcoming') {
        query += ` && dueDate <= "${weekFromNow}" && dueDate >= "${today}"`;
      }

      // Project filter
      if (input.relatedProject) {
        query += ` && relatedProject._ref == "${input.relatedProject}"`;
      }

      query += `] | order(
        priority == "high" desc,
        priority == "medium" desc,
        dueDate asc,
        _createdAt desc
      ) [0...${limit}] {
        _id, title, status, priority, dueDate, notes, completedAt, _createdAt,
        "relatedGoal": relatedGoal->{_id, title, priority},
        "relatedProject": relatedProject->{_id, title, priority}
      }`;

      const results = await client.fetch<Task[]>(query);

      return JSON.stringify({
        success: true,
        count: results.length,
        items: results,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
};

export const updateTaskTool: SanityTool = {
  name: 'lifeos_update_task',
  description: `Update a task in LifeOS. Use to mark as done, update priority, etc.`,

  input_schema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The _id of the task to update',
      },
      status: {
        type: 'string',
        enum: ['todo', 'in_progress', 'done', 'cancelled'],
        description: 'New status',
      },
      title: {
        type: 'string',
        description: 'Updated title',
      },
      priority: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description: 'Updated priority',
      },
      dueDate: {
        type: 'string',
        description: 'Updated due date (ISO format)',
      },
      notes: {
        type: 'string',
        description: 'Updated notes',
      },
      relatedGoal: {
        type: 'string',
        description: 'Link to goal ID',
      },
      relatedProject: {
        type: 'string',
        description: 'Link to project ID',
      },
    },
    required: ['id'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    try {
      const client = getSanityClient();
      const id = String(input.id);

      const updates: Record<string, unknown> = {};
      if (input.status) {
        updates.status = input.status;
        // Auto-set completedAt when marking as done
        if (input.status === 'done') {
          updates.completedAt = new Date().toISOString();
        }
      }
      if (input.title) updates.title = String(input.title);
      if (input.priority) updates.priority = input.priority;
      if (input.dueDate) updates.dueDate = String(input.dueDate);
      if (input.notes) updates.notes = String(input.notes);
      if (input.relatedGoal) {
        updates.relatedGoal = { _type: 'reference', _ref: String(input.relatedGoal) };
      }
      if (input.relatedProject) {
        updates.relatedProject = { _type: 'reference', _ref: String(input.relatedProject) };
      }

      const result = await client.patch(id).set(updates).commit();

      return JSON.stringify({
        success: true,
        id: result._id,
        message: 'Task updated',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
};

// ============================================================================
// DECISION TOOLS
// ============================================================================

export const createDecisionTool: SanityTool = {
  name: 'lifeos_create_decision',
  description: `Create a new decision in LifeOS. Use to track important choices and their rationale.

Example: Record a decision about architecture, hiring, priorities, etc.`,

  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Brief title of the decision',
      },
      outcome: {
        type: 'string',
        description: 'What was decided',
      },
      context: {
        type: 'string',
        description: 'What was the situation or problem',
      },
      rationale: {
        type: 'string',
        description: 'Why this decision was made',
      },
      status: {
        type: 'string',
        enum: ['pending', 'made', 'revisit'],
        description: 'Decision status (default: made)',
      },
      decidedAt: {
        type: 'string',
        description: 'When the decision was made (ISO date)',
      },
      relatedGoal: {
        type: 'string',
        description: 'Optional goal ID this decision relates to',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags for categorization',
      },
    },
    required: ['title', 'outcome'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    try {
      const client = getSanityClient();
      const data: DecisionInput = {
        title: String(input.title),
        outcome: String(input.outcome),
        context: input.context ? String(input.context) : undefined,
        rationale: input.rationale ? String(input.rationale) : undefined,
        status: (input.status as DecisionInput['status']) || 'made',
        decidedAt: input.decidedAt ? String(input.decidedAt) : new Date().toISOString().split('T')[0],
        relatedGoal: input.relatedGoal ? String(input.relatedGoal) : undefined,
        tags: Array.isArray(input.tags) ? input.tags.map(String) : undefined,
      };

      const doc: { _type: string; [key: string]: unknown } = {
        _type: DOCUMENT_TYPES.DECISION,
        ...data,
      };

      // Add goal reference if provided
      if (data.relatedGoal) {
        doc.relatedGoal = { _ref: data.relatedGoal, _type: 'reference' };
      }

      const result = await client.create(doc);

      return JSON.stringify({
        success: true,
        id: result._id,
        message: `Decision "${data.title}" recorded`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
};

export const queryDecisionsTool: SanityTool = {
  name: 'lifeos_query_decisions',
  description: `Query decisions from LifeOS. Returns decisions matching the filter criteria.

Use to review past decisions, find decisions by tag, or list recent choices.`,

  input_schema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['pending', 'made', 'revisit', 'all'],
        description: 'Filter by status (default: all)',
      },
      tag: {
        type: 'string',
        description: 'Filter by tag',
      },
      limit: {
        type: 'number',
        description: 'Max results (default: 50)',
      },
    },
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    try {
      const client = getSanityClient();
      const limit = Number(input.limit) || 50;

      let query = `*[_type == "${DOCUMENT_TYPES.DECISION}"`;
      const params: Record<string, unknown> = {};

      if (input.status && input.status !== 'all') {
        query += ` && status == $status`;
        params.status = input.status;
      }

      if (input.tag) {
        query += ` && $tag in tags`;
        params.tag = input.tag;
      }

      query += `] | order(decidedAt desc)[0...${limit}]`;
      query += `{_id, title, outcome, context, rationale, status, decidedAt, tags, "relatedGoal": relatedGoal->title}`;

      const results = await client.fetch<Decision[]>(query, params);

      return JSON.stringify({
        success: true,
        count: results.length,
        items: results,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
};

export const updateDecisionTool: SanityTool = {
  name: 'lifeos_update_decision',
  description: `Update a decision in LifeOS. Use to add rationale, change status, or update details.`,

  input_schema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The _id of the decision to update',
      },
      title: {
        type: 'string',
        description: 'Updated title',
      },
      outcome: {
        type: 'string',
        description: 'Updated outcome',
      },
      context: {
        type: 'string',
        description: 'Updated context',
      },
      rationale: {
        type: 'string',
        description: 'Updated rationale',
      },
      status: {
        type: 'string',
        enum: ['pending', 'made', 'revisit'],
        description: 'Updated status',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Updated tags',
      },
      decidedAt: {
        type: 'string',
        description: 'Updated decision date (ISO format YYYY-MM-DD)',
      },
      relatedGoal: {
        type: 'string',
        description: 'Link to goal ID',
      },
    },
    required: ['id'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    try {
      const client = getSanityClient();
      const id = String(input.id);

      const updates: Record<string, unknown> = {};
      if (input.title) updates.title = String(input.title);
      if (input.outcome) updates.outcome = String(input.outcome);
      if (input.context) updates.context = String(input.context);
      if (input.rationale) updates.rationale = String(input.rationale);
      if (input.status) updates.status = input.status;
      if (Array.isArray(input.tags)) updates.tags = input.tags.map(String);
      if (input.decidedAt) updates.decidedAt = String(input.decidedAt);
      if (input.relatedGoal) {
        updates.relatedGoal = { _type: 'reference', _ref: String(input.relatedGoal) };
      }

      const result = await client.patch(id).set(updates).commit();

      return JSON.stringify({
        success: true,
        id: result._id,
        message: 'Decision updated',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
};

// ============================================================================
// NOTE TOOLS
// ============================================================================

export const createNoteTool: SanityTool = {
  name: 'lifeos_create_note',
  description: `Create a new note attached to a document in LifeOS.

Use to add discrete notes to projects, tasks, open loops, goals, or decisions.
Each note is timestamped via _createdAt.

Example: "Add a note to the project about the API change"`,

  input_schema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The note content',
      },
      relatedTo: {
        type: 'string',
        description: 'The _id of the document to attach this note to',
      },
      relatedToType: {
        type: 'string',
        enum: ['project', 'openLoop', 'task', 'goal', 'decision'],
        description: 'The type of document this note is attached to',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional tags for categorization',
      },
    },
    required: ['content', 'relatedTo', 'relatedToType'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    try {
      const client = getSanityClient();
      const data: NoteInput = {
        content: String(input.content),
        relatedTo: String(input.relatedTo),
        relatedToType: input.relatedToType as NoteInput['relatedToType'],
        tags: Array.isArray(input.tags) ? input.tags.map(String) : undefined,
      };

      const doc: { _type: string; [key: string]: unknown } = {
        _type: DOCUMENT_TYPES.NOTE,
        content: data.content,
        relatedTo: { _type: 'reference', _ref: data.relatedTo },
        relatedToType: data.relatedToType,
      };
      if (data.tags) doc.tags = data.tags;

      const result = await client.create(doc);

      return JSON.stringify({
        success: true,
        id: result._id,
        message: `Note added to ${data.relatedToType}`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
};

export const queryNotesTool: SanityTool = {
  name: 'lifeos_query_notes',
  description: `Query notes from LifeOS. Returns notes attached to documents.

Filter by:
- relatedTo: Get all notes for a specific document ID
- relatedToType: Get all notes for a document type (project, task, etc.)`,

  input_schema: {
    type: 'object',
    properties: {
      relatedTo: {
        type: 'string',
        description: 'Filter by parent document ID',
      },
      relatedToType: {
        type: 'string',
        enum: ['project', 'openLoop', 'task', 'goal', 'decision'],
        description: 'Filter by parent document type',
      },
      limit: {
        type: 'number',
        description: 'Max items to return (default: 50)',
      },
    },
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    try {
      const client = getSanityClient();
      const limit = Number(input.limit) || 50;

      let query = `*[_type == "${DOCUMENT_TYPES.NOTE}"`;

      if (input.relatedTo) {
        query += ` && relatedTo._ref == "${input.relatedTo}"`;
      }

      if (input.relatedToType) {
        query += ` && relatedToType == "${input.relatedToType}"`;
      }

      query += `] | order(_createdAt desc) [0...${limit}] {
        _id, content, relatedToType, tags, _createdAt,
        "relatedTo": relatedTo->{_id, title}
      }`;

      const results = await client.fetch<Note[]>(query);

      return JSON.stringify({
        success: true,
        count: results.length,
        items: results,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
};

export const deleteNoteTool: SanityTool = {
  name: 'lifeos_delete_note',
  description: `Delete a note from LifeOS.`,

  input_schema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The _id of the note to delete',
      },
    },
    required: ['id'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    try {
      const client = getSanityClient();
      const id = String(input.id);

      await client.delete(id);

      return JSON.stringify({
        success: true,
        message: 'Note deleted',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
};

// ============================================================================
// TOOL REGISTRY
// ============================================================================

/**
 * All Sanity tools indexed by name
 */
export const sanityTools: Record<string, SanityTool> = {
  lifeos_create_inbox: createInboxTool,
  lifeos_query_inbox: queryInboxTool,
  lifeos_update_inbox: updateInboxTool,
  lifeos_create_openloop: createOpenLoopTool,
  lifeos_query_openloops: queryOpenLoopsTool,
  lifeos_update_openloop: updateOpenLoopTool,
  lifeos_create_goal: createGoalTool,
  lifeos_query_goals: queryGoalsTool,
  lifeos_update_goal: updateGoalTool,
  lifeos_create_project: createProjectTool,
  lifeos_query_projects: queryProjectsTool,
  lifeos_update_project: updateProjectTool,
  lifeos_create_task: createTaskTool,
  lifeos_query_tasks: queryTasksTool,
  lifeos_update_task: updateTaskTool,
  lifeos_create_decision: createDecisionTool,
  lifeos_query_decisions: queryDecisionsTool,
  lifeos_update_decision: updateDecisionTool,
  lifeos_create_note: createNoteTool,
  lifeos_query_notes: queryNotesTool,
  lifeos_delete_note: deleteNoteTool,
};

/**
 * Get Sanity tools by name
 */
export function getSanityTools(names: string[]): SanityTool[] {
  return names
    .map(name => sanityTools[name])
    .filter((tool): tool is SanityTool => tool !== undefined);
}

/**
 * Get all Sanity tools
 */
export function getAllSanityTools(): SanityTool[] {
  return Object.values(sanityTools);
}

/**
 * Convert Sanity tools to Anthropic tool format
 */
export function sanityToolsToAnthropicTools(tools: SanityTool[]): Anthropic.Tool[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema,
  }));
}

/**
 * Execute a Sanity tool (async)
 */
export async function executeSanityTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<string | null> {
  const tool = sanityTools[toolName];
  if (!tool) return null;

  // Check if Sanity is configured
  if (!isSanityConfigured()) {
    // Debug: log what we found
    if (process.env.DEBUG) {
      console.log('[DEBUG] Sanity credentials check failed:');
      console.log('  SANITY_PROJECT_ID:', process.env.SANITY_PROJECT_ID ? 'SET' : 'NOT SET');
      console.log('  SANITY_API_TOKEN:', process.env.SANITY_API_TOKEN ? 'SET' : 'NOT SET');
    }
    return JSON.stringify({
      success: false,
      error: 'Sanity not configured. Set SANITY_PROJECT_ID and SANITY_API_TOKEN.',
    });
  }

  return tool.execute(toolInput);
}
