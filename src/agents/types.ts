/**
 * Specialist Agent Type Definitions
 */

export interface AgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  mcpServers: string[];
  model: 'haiku' | 'sonnet' | 'opus';
  maxTurns?: number;  // Override default of 10 for agents that need more iterations
  utilityTools?: string[];  // Built-in utility tools: 'count_items', 'extract_number'
  sanityTools?: string[];  // Sanity CMS tools: 'lifeos_create_inbox', 'lifeos_query_tasks', etc.
}
