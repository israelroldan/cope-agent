/**
 * Config Module
 *
 * Configuration and credentials management for cope-agent.
 */

export {
  KNOWN_CREDENTIALS,
  loadCredentials,
  saveCredentials,
  getCredential,
  setCredential,
  deleteCredential,
  listCredentials,
  loadCredentialsIntoEnv,
  getConfigDir,
  getCredentialsFile,
} from './credentials.js';
