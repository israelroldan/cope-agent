"use strict";
/**
 * Credentials Store
 *
 * Manages sensitive credentials in ~/.config/cope-agent/.env
 * These are loaded automatically by the MCP server, so you don't need
 * to pass them from Claude Code's MCP config.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.KNOWN_CREDENTIALS = void 0;
exports.loadCredentials = loadCredentials;
exports.saveCredentials = saveCredentials;
exports.getCredential = getCredential;
exports.setCredential = setCredential;
exports.deleteCredential = deleteCredential;
exports.listCredentials = listCredentials;
exports.loadCredentialsIntoEnv = loadCredentialsIntoEnv;
exports.getConfigDir = getConfigDir;
exports.getCredentialsFile = getCredentialsFile;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Config directory
const CONFIG_DIR = path.join(process.env.HOME || '', '.config', 'cope-agent');
const CREDENTIALS_FILE = path.join(CONFIG_DIR, '.env');
/**
 * Known credentials and their descriptions
 */
exports.KNOWN_CREDENTIALS = {
    // API Keys
    ANTHROPIC_API_KEY: 'Anthropic API key for spawning subagents',
    ANTHROPIC_AUTH_TOKEN: 'Alternative auth token (z.ai proxies)',
    ANTHROPIC_BASE_URL: 'Custom API endpoint (optional)',
    COPE_API_KEY: 'API key for remote HTTP access (required for non-local requests)',
    // Slack
    SLACK_MCP_XOXB_TOKEN: 'Slack bot token for slack-tatoma MCP',
    SLACK_BOT_TOKEN: 'Slack bot OAuth token for Slack bot (xoxb-...)',
    SLACK_APP_TOKEN: 'Slack app-level token for Socket Mode (xapp-...)',
    // School
    MAGISTER_USER: 'Magister username for school MCP',
    MAGISTER_PASS: 'Magister password for school MCP',
    MAGISTER_SCHOOL: 'Magister school ID (default: sintlucas-vmbo)',
    // External services
    OMI_API_KEY: 'Omi API key for lifelog MCP',
    YNAB_API_TOKEN: 'YNAB API token for finance MCP (from Developer Settings)',
    // Sanity CMS
    SANITY_PROJECT_ID: 'Sanity project ID for LifeOS',
    SANITY_DATASET: 'Sanity dataset name (default: production)',
    SANITY_API_TOKEN: 'Sanity API token with read/write permissions',
    // Path overrides (for remote deployment)
    MCP_ICAL_DIR: 'Directory containing mcp-ical (default: /Users/israel/code/mcp-ical)',
    MAGISTER_MCP_PATH: 'Path to magister-mcp dist/index.js',
    YNAB_MCP_PATH: 'Path to mcp-ynab executable',
    PLAYWRIGHT_PROFILE: 'Browser profile directory for Playwright',
    GOOGLE_OAUTH_CREDENTIALS: 'Path to Google OAuth credentials JSON',
};
/**
 * Ensure config directory exists
 */
function ensureConfigDir() {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
}
/**
 * Parse .env file content into key-value pairs
 */
function parseEnvFile(content) {
    const result = {};
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#'))
            continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1)
            continue;
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        result[key] = value;
    }
    return result;
}
/**
 * Serialize key-value pairs to .env format
 */
function serializeEnvFile(data) {
    const lines = [
        '# COPE Agent Credentials',
        '# This file is auto-managed by cope-agent',
        '# Edit with: cope /credentials set <key> <value>',
        '',
    ];
    for (const [key, value] of Object.entries(data)) {
        // Quote values that contain spaces or special chars
        const needsQuotes = /[\s"'#]/.test(value);
        const quotedValue = needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value;
        lines.push(`${key}=${quotedValue}`);
    }
    return lines.join('\n') + '\n';
}
/**
 * Load credentials from store
 */
function loadCredentials() {
    if (!fs.existsSync(CREDENTIALS_FILE)) {
        return {};
    }
    try {
        const content = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
        return parseEnvFile(content);
    }
    catch {
        return {};
    }
}
/**
 * Save credentials to store
 */
function saveCredentials(credentials) {
    ensureConfigDir();
    fs.writeFileSync(CREDENTIALS_FILE, serializeEnvFile(credentials), {
        mode: 0o600, // Owner read/write only
    });
}
/**
 * Get a single credential
 */
function getCredential(key) {
    const credentials = loadCredentials();
    return credentials[key];
}
/**
 * Set a single credential
 */
function setCredential(key, value) {
    const credentials = loadCredentials();
    credentials[key] = value;
    saveCredentials(credentials);
}
/**
 * Delete a credential
 */
function deleteCredential(key) {
    const credentials = loadCredentials();
    if (key in credentials) {
        delete credentials[key];
        saveCredentials(credentials);
        return true;
    }
    return false;
}
/**
 * List all stored credentials (masked values)
 */
function listCredentials() {
    const stored = loadCredentials();
    return Object.entries(exports.KNOWN_CREDENTIALS).map(([key, description]) => ({
        key,
        set: key in stored && stored[key].length > 0,
        description,
    }));
}
/**
 * Load credentials into process.env
 * Call this at startup to make credentials available
 */
function loadCredentialsIntoEnv() {
    const credentials = loadCredentials();
    for (const [key, value] of Object.entries(credentials)) {
        // Don't override existing env vars (allows external override)
        if (!process.env[key]) {
            process.env[key] = value;
        }
    }
}
/**
 * Get the config directory path
 */
function getConfigDir() {
    return CONFIG_DIR;
}
/**
 * Get the credentials file path
 */
function getCredentialsFile() {
    return CREDENTIALS_FILE;
}
//# sourceMappingURL=credentials.js.map