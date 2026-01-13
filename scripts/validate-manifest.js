#!/usr/bin/env node
/**
 * MCPB Manifest Validator
 *
 * Validates manifest.json against MCPB spec v0.3 requirements.
 * Run: node scripts/validate-manifest.js [path/to/manifest.json]
 */

import fs from 'fs';
import path from 'path';

const MANIFEST_VERSION = '0.3';
const VALID_SERVER_TYPES = ['node', 'python', 'binary', 'uv'];
const VALID_PLATFORMS = ['darwin', 'win32', 'linux'];
const VALID_CONFIG_TYPES = ['string', 'number', 'boolean', 'directory', 'file'];

/**
 * Validation result
 * @typedef {{ valid: boolean, errors: string[], warnings: string[] }} ValidationResult
 */

/**
 * Validate manifest structure and required fields
 * @param {object} manifest - Parsed manifest object
 * @returns {ValidationResult}
 */
function validateManifest(manifest) {
  const errors = [];
  const warnings = [];

  // Required fields
  if (!manifest.manifest_version) {
    errors.push('Missing required field: manifest_version');
  } else if (manifest.manifest_version !== MANIFEST_VERSION) {
    warnings.push(`manifest_version '${manifest.manifest_version}' may not be compatible (expected ${MANIFEST_VERSION})`);
  }

  if (!manifest.name) {
    errors.push('Missing required field: name');
  } else if (!/^[a-z][a-z0-9-]*$/.test(manifest.name)) {
    errors.push('name must be lowercase alphanumeric with hyphens, starting with a letter');
  }

  if (!manifest.version) {
    errors.push('Missing required field: version');
  } else if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
    errors.push('version must follow semantic versioning (e.g., 1.0.0)');
  }

  if (!manifest.description) {
    errors.push('Missing required field: description');
  }

  // Author validation
  if (!manifest.author) {
    errors.push('Missing required field: author');
  } else if (!manifest.author.name) {
    errors.push('Missing required field: author.name');
  }

  // Server configuration
  if (!manifest.server) {
    errors.push('Missing required field: server');
  } else {
    if (!manifest.server.type) {
      errors.push('Missing required field: server.type');
    } else if (!VALID_SERVER_TYPES.includes(manifest.server.type)) {
      errors.push(`Invalid server.type '${manifest.server.type}'. Must be one of: ${VALID_SERVER_TYPES.join(', ')}`);
    }

    if (!manifest.server.entry_point) {
      errors.push('Missing required field: server.entry_point');
    }

    // Validate mcp_config if present
    if (manifest.server.mcp_config) {
      if (!manifest.server.mcp_config.command) {
        warnings.push('server.mcp_config.command not specified');
      }

      // Check for undefined user_config references
      if (manifest.user_config && manifest.server.mcp_config.env) {
        const envVars = manifest.server.mcp_config.env;
        for (const [key, value] of Object.entries(envVars)) {
          const match = String(value).match(/\$\{user_config\.([^}]+)\}/);
          if (match) {
            const configKey = match[1];
            if (!manifest.user_config[configKey]) {
              errors.push(`server.mcp_config.env.${key} references undefined user_config.${configKey}`);
            }
          }
        }
      }
    }
  }

  // User config validation
  if (manifest.user_config) {
    for (const [key, config] of Object.entries(manifest.user_config)) {
      if (!config.type) {
        errors.push(`user_config.${key}: missing required field 'type'`);
      } else if (!VALID_CONFIG_TYPES.includes(config.type)) {
        errors.push(`user_config.${key}: invalid type '${config.type}'. Must be one of: ${VALID_CONFIG_TYPES.join(', ')}`);
      }

      if (!config.title) {
        warnings.push(`user_config.${key}: missing 'title' (recommended for UI)`);
      }

      if (config.sensitive && config.type !== 'string') {
        warnings.push(`user_config.${key}: 'sensitive' only applies to string type`);
      }
    }
  }

  // Compatibility validation
  if (manifest.compatibility) {
    if (manifest.compatibility.platforms) {
      for (const platform of manifest.compatibility.platforms) {
        if (!VALID_PLATFORMS.includes(platform)) {
          errors.push(`Invalid platform '${platform}'. Must be one of: ${VALID_PLATFORMS.join(', ')}`);
        }
      }
    }
  }

  // Tools validation
  if (manifest.tools) {
    if (!Array.isArray(manifest.tools)) {
      errors.push('tools must be an array');
    } else {
      for (let i = 0; i < manifest.tools.length; i++) {
        const tool = manifest.tools[i];
        if (!tool.name) {
          errors.push(`tools[${i}]: missing required field 'name'`);
        }
      }
    }
  }

  // Optional field warnings
  if (!manifest.icon) {
    warnings.push('No icon specified - bundle will use default icon');
  }

  if (!manifest.license) {
    warnings.push('No license specified');
  }

  if (!manifest.repository) {
    warnings.push('No repository specified');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Main validation function
 */
function main() {
  const args = process.argv.slice(2);
  const manifestPath = args[0] || 'manifest.json';

  console.log(`Validating: ${manifestPath}`);
  console.log('');

  // Check file exists
  if (!fs.existsSync(manifestPath)) {
    console.error(`Error: File not found: ${manifestPath}`);
    process.exit(1);
  }

  // Read and parse manifest
  let manifest;
  try {
    const content = fs.readFileSync(manifestPath, 'utf8');
    manifest = JSON.parse(content);
  } catch (error) {
    console.error(`Error parsing manifest: ${error.message}`);
    process.exit(1);
  }

  // Validate
  const result = validateManifest(manifest);

  // Output results
  if (result.errors.length > 0) {
    console.log('ERRORS:');
    for (const error of result.errors) {
      console.log(`  ❌ ${error}`);
    }
    console.log('');
  }

  if (result.warnings.length > 0) {
    console.log('WARNINGS:');
    for (const warning of result.warnings) {
      console.log(`  ⚠️  ${warning}`);
    }
    console.log('');
  }

  if (result.valid) {
    console.log('✅ Manifest is valid!');
    console.log('');
    console.log('Summary:');
    console.log(`  Name: ${manifest.name}`);
    console.log(`  Version: ${manifest.version}`);
    console.log(`  Server type: ${manifest.server?.type}`);
    console.log(`  Entry point: ${manifest.server?.entry_point}`);
    console.log(`  Tools: ${manifest.tools?.length || 0}`);
    console.log(`  User configs: ${Object.keys(manifest.user_config || {}).length}`);
    process.exit(0);
  } else {
    console.log('❌ Manifest validation failed');
    process.exit(1);
  }
}

main();
