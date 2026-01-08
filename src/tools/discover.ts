/**
 * Discover Capability Tool
 *
 * Custom tool that allows the orchestrator to query available capabilities
 * without loading full MCP tool schemas.
 */

import { findMatchingDomains, findMatchingWorkflows, getDomain, getWorkflow, listDomains, listWorkflows } from '../core/manifest.js';
import { getAgentDefinition, listAgents } from '../agents/definitions.js';

export interface DiscoverResult {
  query: string;
  matchedDomains: Array<{
    domain: string;
    description: string;
    specialist: string;
    mcpServers: string[];
    matchedTriggers: string[];
    constraints?: string[];
  }>;
  matchedWorkflows: Array<{
    workflow: string;
    description: string;
    specialist: string;
    matchedTriggers: string[];
  }>;
  recommendation: string | null;
}

/**
 * Discover capabilities that match a user query
 *
 * This is the core discovery function that finds relevant domains
 * and workflows based on trigger keywords in the query.
 */
export function discoverCapabilities(query: string): DiscoverResult {
  const matchedDomains = findMatchingDomains(query).map(match => ({
    domain: match.domain,
    description: match.config.description,
    specialist: match.config.specialist,
    mcpServers: match.config.mcp_servers,
    matchedTriggers: match.matchedTriggers,
    constraints: match.config.constraints,
  }));

  const matchedWorkflows = findMatchingWorkflows(query).map(match => ({
    workflow: match.workflow,
    description: match.config.description,
    specialist: match.config.specialist,
    matchedTriggers: match.matchedTriggers,
  }));

  // Generate recommendation
  let recommendation: string | null = null;

  if (matchedWorkflows.length > 0) {
    // Workflows take priority (multi-domain operations)
    const topWorkflow = matchedWorkflows[0];
    recommendation = `Use workflow '${topWorkflow.workflow}' via ${topWorkflow.specialist}`;
  } else if (matchedDomains.length > 0) {
    // Single domain operation
    const topDomain = matchedDomains[0];
    recommendation = `Use domain '${topDomain.domain}' via ${topDomain.specialist}`;
  } else {
    recommendation = null;
  }

  return {
    query,
    matchedDomains,
    matchedWorkflows,
    recommendation,
  };
}

/**
 * Get detailed information about a specific domain
 */
export function getDomainDetails(domainName: string): {
  found: boolean;
  domain?: string;
  description?: string;
  specialist?: string;
  specialistDescription?: string;
  mcpServers?: string[];
  triggers?: string[];
  constraints?: string[];
  databases?: Record<string, string>;
} {
  const domain = getDomain(domainName);
  if (!domain) {
    return { found: false };
  }

  const agent = getAgentDefinition(domain.specialist);

  return {
    found: true,
    domain: domainName,
    description: domain.description,
    specialist: domain.specialist,
    specialistDescription: agent?.description,
    mcpServers: domain.mcp_servers,
    triggers: domain.triggers,
    constraints: domain.constraints,
    databases: domain.databases,
  };
}

/**
 * Get detailed information about a specific workflow
 */
export function getWorkflowDetails(workflowName: string): {
  found: boolean;
  workflow?: string;
  description?: string;
  specialist?: string;
  triggers?: string[];
  parallelTasks?: Array<{ domain: string; task: string }>;
} {
  const workflow = getWorkflow(workflowName);
  if (!workflow) {
    return { found: false };
  }

  return {
    found: true,
    workflow: workflowName,
    description: workflow.description,
    specialist: workflow.specialist,
    triggers: workflow.triggers,
    parallelTasks: workflow.parallel_tasks,
  };
}

/**
 * List all available capabilities (for help/exploration)
 */
export function listAllCapabilities(): {
  domains: Array<{ name: string; description: string }>;
  workflows: Array<{ name: string; description: string }>;
  agents: Array<{ name: string; description: string }>;
} {
  return {
    domains: listDomains(),
    workflows: listWorkflows(),
    agents: listAgents(),
  };
}

/**
 * Tool definition for the Agent SDK
 *
 * This is what gets passed to the orchestrator's tools array.
 */
export const discoverCapabilityTool = {
  name: 'discover_capability',
  description: `Query available capabilities to find the right specialist for a task.

Use this tool when you need to:
- Find which domain handles a user request
- Identify the correct specialist agent to spawn
- Check what MCP servers a domain requires
- Find multi-domain workflows (like daily briefing)

The tool matches against trigger keywords and returns:
- Matched domains with their specialists and MCP servers
- Matched workflows for multi-domain operations
- A recommendation for the best match

Example queries:
- "check email" → matches email domain
- "schedule meeting" → matches calendar domain
- "daily briefing" → matches briefing workflow
- "what's on today" → matches multiple domains`,

  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'The user query or task description to match against capabilities',
      },
      mode: {
        type: 'string',
        enum: ['discover', 'domain_details', 'workflow_details', 'list_all'],
        description: 'Mode of operation: discover (default), get details, or list all',
      },
      target: {
        type: 'string',
        description: 'For details modes: the name of the domain or workflow to get details for',
      },
    },
    required: ['query'],
  },

  /**
   * Execute the discover capability tool
   */
  execute: (input: { query: string; mode?: string; target?: string }): string => {
    const mode = input.mode ?? 'discover';

    switch (mode) {
      case 'discover': {
        const result = discoverCapabilities(input.query);
        return JSON.stringify(result, null, 2);
      }

      case 'domain_details': {
        if (!input.target) {
          return JSON.stringify({ error: 'target required for domain_details mode' });
        }
        const result = getDomainDetails(input.target);
        return JSON.stringify(result, null, 2);
      }

      case 'workflow_details': {
        if (!input.target) {
          return JSON.stringify({ error: 'target required for workflow_details mode' });
        }
        const result = getWorkflowDetails(input.target);
        return JSON.stringify(result, null, 2);
      }

      case 'list_all': {
        const result = listAllCapabilities();
        return JSON.stringify(result, null, 2);
      }

      default:
        return JSON.stringify({ error: `Unknown mode: ${mode}` });
    }
  },
};
