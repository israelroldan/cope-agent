/**
 * Capability Manifest Loader
 *
 * Loads and queries the lightweight capability manifest that enables
 * dynamic context discovery without loading full MCP tool schemas.
 */

import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface DomainConfig {
  description: string;
  triggers: string[];
  specialist: string;
  mcp_servers: string[];
  constraints?: string[];
  vip_senders?: string[];
  priority_channels?: string[];
  databases?: Record<string, string>;
  workflows?: string[];
}

export interface WorkflowConfig {
  description: string;
  triggers: string[];
  specialist: string;
  parallel_tasks?: Array<{
    domain: string;
    task: string;
  }>;
}

export interface CapabilityManifest {
  version: number;
  identity: {
    name: string;
    role: string;
    framework: string;
  };
  domains: Record<string, DomainConfig>;
  workflows: Record<string, WorkflowConfig>;
}

let cachedManifest: CapabilityManifest | null = null;

/**
 * Load the capability manifest from YAML
 */
export function loadManifest(): CapabilityManifest {
  if (cachedManifest) {
    return cachedManifest;
  }

  const manifestPath = join(__dirname, '../../config/capabilities.yaml');
  const content = readFileSync(manifestPath, 'utf-8');
  cachedManifest = parseYaml(content) as CapabilityManifest;
  return cachedManifest;
}

/**
 * Find domains that match a query based on triggers
 */
export function findMatchingDomains(query: string): Array<{
  domain: string;
  config: DomainConfig;
  matchedTriggers: string[];
}> {
  const manifest = loadManifest();
  const queryLower = query.toLowerCase();
  const results: Array<{
    domain: string;
    config: DomainConfig;
    matchedTriggers: string[];
  }> = [];

  for (const [domain, config] of Object.entries(manifest.domains)) {
    const matchedTriggers = config.triggers.filter(trigger =>
      queryLower.includes(trigger.toLowerCase())
    );

    if (matchedTriggers.length > 0) {
      results.push({ domain, config, matchedTriggers });
    }
  }

  // Sort by number of matched triggers (more specific first)
  return results.sort((a, b) => b.matchedTriggers.length - a.matchedTriggers.length);
}

/**
 * Find workflows that match a query
 */
export function findMatchingWorkflows(query: string): Array<{
  workflow: string;
  config: WorkflowConfig;
  matchedTriggers: string[];
}> {
  const manifest = loadManifest();
  const queryLower = query.toLowerCase();
  const results: Array<{
    workflow: string;
    config: WorkflowConfig;
    matchedTriggers: string[];
  }> = [];

  for (const [workflow, config] of Object.entries(manifest.workflows)) {
    const matchedTriggers = config.triggers.filter(trigger =>
      queryLower.includes(trigger.toLowerCase())
    );

    if (matchedTriggers.length > 0) {
      results.push({ workflow, config, matchedTriggers });
    }
  }

  return results.sort((a, b) => b.matchedTriggers.length - a.matchedTriggers.length);
}

/**
 * Get domain configuration by name
 */
export function getDomain(name: string): DomainConfig | undefined {
  const manifest = loadManifest();
  return manifest.domains[name];
}

/**
 * Get workflow configuration by name
 */
export function getWorkflow(name: string): WorkflowConfig | undefined {
  const manifest = loadManifest();
  return manifest.workflows[name];
}

/**
 * Get the specialist agent for a domain or workflow
 */
export function getSpecialist(domainOrWorkflow: string): string | undefined {
  const manifest = loadManifest();

  if (manifest.domains[domainOrWorkflow]) {
    return manifest.domains[domainOrWorkflow].specialist;
  }

  if (manifest.workflows[domainOrWorkflow]) {
    return manifest.workflows[domainOrWorkflow].specialist;
  }

  return undefined;
}

/**
 * Get MCP servers required for a domain
 */
export function getMcpServers(domain: string): string[] {
  const config = getDomain(domain);
  return config?.mcp_servers ?? [];
}

/**
 * List all available domains with descriptions
 */
export function listDomains(): Array<{ name: string; description: string }> {
  const manifest = loadManifest();
  return Object.entries(manifest.domains).map(([name, config]) => ({
    name,
    description: config.description,
  }));
}

/**
 * List all available workflows with descriptions
 */
export function listWorkflows(): Array<{ name: string; description: string }> {
  const manifest = loadManifest();
  return Object.entries(manifest.workflows).map(([name, config]) => ({
    name,
    description: config.description,
  }));
}

/**
 * Get a compact summary of capabilities for context injection
 * This is what goes into the orchestrator's system prompt
 */
export function getCapabilitySummary(): string {
  const manifest = loadManifest();

  let summary = `# Available Capabilities\n\n`;

  summary += `## Domains\n`;
  for (const [name, config] of Object.entries(manifest.domains)) {
    summary += `- **${name}**: ${config.description}\n`;
    summary += `  Triggers: ${config.triggers.slice(0, 5).join(', ')}${config.triggers.length > 5 ? '...' : ''}\n`;
  }

  summary += `\n## Workflows\n`;
  for (const [name, config] of Object.entries(manifest.workflows)) {
    summary += `- **${name}**: ${config.description}\n`;
  }

  return summary;
}
