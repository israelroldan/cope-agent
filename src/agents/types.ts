/**
 * Specialist Agent Type Definitions
 */

export interface AgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  mcpServers: string[];
  model: 'haiku' | 'sonnet' | 'opus';
}
