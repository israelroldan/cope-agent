/**
 * Workflow Type Definitions
 *
 * Workflows are multi-step processes that orchestrate specialist agents
 * to accomplish complex tasks like daily briefings or weekly reviews.
 */

// Re-export from centralized config for backwards compatibility
export { LIFEOS_DATABASES } from '../config/lifeos-schema.js';

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
