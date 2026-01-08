/**
 * Workflow Type Definitions
 *
 * Workflows are multi-step processes that orchestrate specialist agents
 * to accomplish complex tasks like daily briefings or weekly reviews.
 */

/**
 * LifeOS database references
 * These are the Notion collection IDs for various LifeOS databases
 */
export const LIFEOS_DATABASES = {
  TASKS: 'collection://2dff8fbf-cf75-81ec-9d5a-000bd513a35c',
  NOTES: 'collection://2dff8fbf-cf75-8171-b984-000b1a6487f3',
  GOALS: 'collection://2dff8fbf-cf75-811f-a2e7-000b753d5c5a',
  JOURNAL: 'collection://2dff8fbf-cf75-816e-8222-000ba6610bff',
  DECISIONS: 'collection://8df780cc-91fe-4c51-9c59-d8f20c7dbd7b',
} as const;

/**
 * Specialist task definition for parallel spawning
 */
export interface SpecialistTask {
  specialist: string;
  task: string;
  context?: string;
}

/**
 * Workflow definition
 */
export interface WorkflowDefinition {
  /** Unique workflow identifier */
  name: string;

  /** Human-readable description */
  description: string;

  /** Keywords/phrases that trigger this workflow */
  triggers: string[];

  /** Category of workflow */
  category: 'daily' | 'weekly' | 'cope-phase' | 'ad-hoc';

  /** Specialists to spawn (in parallel if multiple) */
  specialists: SpecialistTask[];

  /** System prompt for the workflow orchestrator */
  systemPrompt: string;

  /** Output format template */
  outputFormat?: string;
}

/**
 * Workflow execution result
 */
export interface WorkflowResult {
  success: boolean;
  workflow: string;
  output?: string;
  error?: string;
  specialistResults?: Array<{
    specialist: string;
    success: boolean;
    response?: string;
    error?: string;
  }>;
}
