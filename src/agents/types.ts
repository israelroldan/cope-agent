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
}
