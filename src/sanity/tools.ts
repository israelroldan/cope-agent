/**
 * LifeOS Sanity Tools
 *
 * CRUD tools for LifeOS data in Sanity CMS.
 * 12 tools: 3 per document type (create, query, update).
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
  Task,
  TaskInput,
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
      };

      const result = await client.create({
        _type: DOCUMENT_TYPES.OPEN_LOOP,
        ...data,
      });

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
      query += `] | order(dueDate asc, _createdAt desc) [0...${limit}] {
        _id, title, waitingOn, status, dueDate, nextAction, context, _createdAt
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
    },
    required: ['id'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    try {
      const client = getSanityClient();
      const id = String(input.id);

      const updates: Partial<OpenLoopInput> = {};
      if (input.status) updates.status = input.status as OpenLoopInput['status'];
      if (input.title) updates.title = String(input.title);
      if (input.waitingOn) updates.waitingOn = String(input.waitingOn);
      if (input.dueDate) updates.dueDate = String(input.dueDate);
      if (input.nextAction) updates.nextAction = String(input.nextAction);

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

Priority levels:
- P1: Must happen (critical)
- P2: Should happen (important)
- P3: Nice to have`,

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
    },
    required: ['title', 'priority'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    try {
      const client = getSanityClient();
      const data: GoalInput = {
        title: String(input.title),
        priority: input.priority as GoalInput['priority'],
        status: 'not_started',
        progress: 0,
        deadline: input.deadline ? String(input.deadline) : undefined,
        description: input.description ? String(input.description) : undefined,
        keyResults: Array.isArray(input.keyResults) ? input.keyResults.map(String) : undefined,
      };

      const result = await client.create({
        _type: DOCUMENT_TYPES.GOAL,
        ...data,
      });

      return JSON.stringify({
        success: true,
        id: result._id,
        message: `Goal "${data.title}" created (${data.priority})`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
};

export const queryGoalsTool: SanityTool = {
  name: 'lifeos_query_goals',
  description: `Query goals from LifeOS. Returns goals with progress tracking.

Filter by:
- status: not_started, in_progress, completed, paused
- priority: P1, P2, P3`,

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

      query += `] | order(priority asc, deadline asc) [0...${limit}] {
        _id, title, status, priority, progress, deadline, description, keyResults, _createdAt
      }`;

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
  description: `Update a goal in LifeOS. Use to update progress, status, etc.`,

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
      deadline: {
        type: 'string',
        description: 'Updated deadline (ISO format)',
      },
    },
    required: ['id'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    try {
      const client = getSanityClient();
      const id = String(input.id);

      const updates: Partial<GoalInput> = {};
      if (input.status) updates.status = input.status as GoalInput['status'];
      if (input.progress !== undefined) updates.progress = Number(input.progress);
      if (input.title) updates.title = String(input.title);
      if (input.priority) updates.priority = input.priority as GoalInput['priority'];
      if (input.deadline) updates.deadline = String(input.deadline);

      const result = await client.patch(id).set(updates).commit();

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
        notes: input.notes ? String(input.notes) : undefined,
      };

      // Build the document, handling the goal reference specially
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
- dueDate: today, overdue, upcoming`,

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

      query += `] | order(
        priority == "high" desc,
        priority == "medium" desc,
        dueDate asc,
        _createdAt desc
      ) [0...${limit}] {
        _id, title, status, priority, dueDate, notes, completedAt, _createdAt,
        "relatedGoal": relatedGoal->{_id, title, priority}
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
  lifeos_create_task: createTaskTool,
  lifeos_query_tasks: queryTasksTool,
  lifeos_update_task: updateTaskTool,
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
