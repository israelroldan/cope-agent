"use strict";
/**
 * Config Module
 *
 * Configuration and credentials management for cope-agent.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCredentialsFile = exports.getConfigDir = exports.loadCredentialsIntoEnv = exports.listCredentials = exports.deleteCredential = exports.setCredential = exports.getCredential = exports.saveCredentials = exports.loadCredentials = exports.KNOWN_CREDENTIALS = void 0;
var credentials_js_1 = require("./credentials.js");
Object.defineProperty(exports, "KNOWN_CREDENTIALS", { enumerable: true, get: function () { return credentials_js_1.KNOWN_CREDENTIALS; } });
Object.defineProperty(exports, "loadCredentials", { enumerable: true, get: function () { return credentials_js_1.loadCredentials; } });
Object.defineProperty(exports, "saveCredentials", { enumerable: true, get: function () { return credentials_js_1.saveCredentials; } });
Object.defineProperty(exports, "getCredential", { enumerable: true, get: function () { return credentials_js_1.getCredential; } });
Object.defineProperty(exports, "setCredential", { enumerable: true, get: function () { return credentials_js_1.setCredential; } });
Object.defineProperty(exports, "deleteCredential", { enumerable: true, get: function () { return credentials_js_1.deleteCredential; } });
Object.defineProperty(exports, "listCredentials", { enumerable: true, get: function () { return credentials_js_1.listCredentials; } });
Object.defineProperty(exports, "loadCredentialsIntoEnv", { enumerable: true, get: function () { return credentials_js_1.loadCredentialsIntoEnv; } });
Object.defineProperty(exports, "getConfigDir", { enumerable: true, get: function () { return credentials_js_1.getConfigDir; } });
Object.defineProperty(exports, "getCredentialsFile", { enumerable: true, get: function () { return credentials_js_1.getCredentialsFile; } });
//# sourceMappingURL=index.js.map