import { app, Tray, Menu, nativeImage, shell, dialog, clipboard, Notification, NativeImage } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';

// Auto-launch support
import AutoLaunch from 'auto-launch';

// Server state
let serverProcess: ChildProcess | null = null;
let tray: Tray | null = null;
let isServerRunning = false;

// Paths
const isDev = !app.isPackaged;
const resourcesPath = isDev
  ? path.join(__dirname, '..', '..')
  : process.resourcesPath;

const serverPath = isDev
  ? path.join(resourcesPath, 'dist', 'http-server.js')
  : path.join(resourcesPath, 'server', 'http-server.js');

const certsPath = isDev
  ? path.join(resourcesPath, 'certs')
  : path.join(resourcesPath, 'certs');

// Auto-launch configuration
const autoLauncher = new AutoLaunch({
  name: 'COPE Agent',
  path: app.getPath('exe'),
  mac: {
    useLaunchAgent: true
  }
});

// Icons (we'll create simple ones, or use template icons)
function createTrayIcon(running: boolean): NativeImage {
  // Create a simple icon programmatically
  // In production, you'd use proper icon files
  const size = 22;
  const canvas = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="${running ? '#4CAF50' : '#9E9E9E'}" />
      <text x="${size/2}" y="${size/2 + 4}" font-size="12" text-anchor="middle" fill="white" font-family="system-ui">C</text>
    </svg>
  `;

  // For now, return a simple template image
  // Electron will use the template suffix for proper dark/light mode handling
  return nativeImage.createEmpty();
}

// Check if server is healthy
async function checkServerHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3847,
      path: '/health',
      method: 'GET',
      rejectUnauthorized: false, // Allow self-signed certs
      timeout: 2000
    };

    const protocol = fs.existsSync(path.join(certsPath, 'localhost+2.pem')) ? https : http;

    const req = protocol.request(options, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

// Start the server
async function startServer(): Promise<void> {
  if (serverProcess) {
    console.log('Server already running');
    return;
  }

  const nodePath = process.execPath.includes('Electron')
    ? 'node'
    : process.execPath;

  // Set up environment
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production'
  };

  // If in packaged app, set paths for the bundled server
  if (!isDev) {
    env.COPE_CONFIG_PATH = path.join(resourcesPath, 'server-config');
    env.COPE_CERTS_PATH = certsPath;
  }

  serverProcess = spawn('node', [serverPath], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  });

  serverProcess.stdout?.on('data', (data) => {
    console.log(`[Server] ${data.toString()}`);
  });

  serverProcess.stderr?.on('data', (data) => {
    console.error(`[Server Error] ${data.toString()}`);
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
    serverProcess = null;
    updateTrayMenu();
  });

  serverProcess.on('exit', (code) => {
    console.log(`Server exited with code ${code}`);
    serverProcess = null;
    isServerRunning = false;
    updateTrayMenu();
  });

  // Wait for server to be ready
  let attempts = 0;
  while (attempts < 10) {
    await new Promise(resolve => setTimeout(resolve, 500));
    if (await checkServerHealth()) {
      isServerRunning = true;
      updateTrayMenu();
      return;
    }
    attempts++;
  }

  console.error('Server failed to become healthy');
}

// Stop the server
function stopServer(): void {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
    isServerRunning = false;
    updateTrayMenu();
  }
}

// Update tray icon and menu
function updateTrayMenu(): void {
  if (!tray) return;

  const statusText = isServerRunning ? 'Running' : 'Stopped';
  const statusIcon = isServerRunning ? '🟢' : '⚪';

  autoLauncher.isEnabled().then((isEnabled) => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: `COPE Agent - ${statusText}`,
        enabled: false
      },
      { type: 'separator' },
      {
        label: isServerRunning ? 'Stop Server' : 'Start Server',
        click: () => {
          if (isServerRunning) {
            stopServer();
          } else {
            startServer();
          }
        }
      },
      {
        label: 'Restart Server',
        enabled: isServerRunning,
        click: () => {
          stopServer();
          setTimeout(() => startServer(), 1000);
        }
      },
      { type: 'separator' },
      {
        label: 'Open Health Check',
        enabled: isServerRunning,
        click: () => {
          const protocol = fs.existsSync(path.join(certsPath, 'localhost+2.pem')) ? 'https' : 'http';
          shell.openExternal(`${protocol}://localhost:3847/health`);
        }
      },
      {
        label: 'Copy MCP Config',
        click: () => {
          const protocol = fs.existsSync(path.join(certsPath, 'localhost+2.pem')) ? 'https' : 'http';
          const config = {
            mcpServers: {
              'cope-agent': {
                command: 'npx',
                args: ['-y', 'mcp-remote', `${protocol}://localhost:3847/mcp`]
              }
            }
          };
          clipboard.writeText(JSON.stringify(config, null, 2));

          // Show notification
          if (Notification.isSupported()) {
            new Notification({
              title: 'COPE Agent',
              body: 'MCP configuration copied to clipboard'
            }).show();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Start at Login',
        type: 'checkbox',
        checked: isEnabled,
        click: async (menuItem) => {
          if (menuItem.checked) {
            await autoLauncher.enable();
          } else {
            await autoLauncher.disable();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'About COPE Agent',
        click: () => {
          dialog.showMessageBox({
            type: 'info',
            title: 'About COPE Agent',
            message: 'COPE Agent',
            detail: 'Clarify · Organise · Prioritise · Execute\n\nVersion 0.1.0\n\nA personal executive assistant built on hierarchical agent architecture.',
            buttons: ['OK']
          });
        }
      },
      {
        label: 'Quit',
        click: () => {
          stopServer();
          app.quit();
        }
      }
    ]);

    tray?.setContextMenu(contextMenu);
    tray?.setToolTip(`COPE Agent - ${statusText}`);
  });
}

// Create the tray
function createTray(): void {
  // Use a template image for proper dark/light mode support
  // The 'Template' suffix tells macOS to treat it as a template
  const iconPath = isDev
    ? path.join(__dirname, '..', 'assets', 'IconTemplate.png')
    : path.join(resourcesPath, 'assets', 'IconTemplate.png');

  let icon: NativeImage;

  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    // Create a simple fallback icon
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('COPE Agent');

  // On macOS, clicking the tray icon shows the menu
  tray.on('click', () => {
    tray?.popUpContextMenu();
  });

  updateTrayMenu();
}

// Main app initialization
app.whenReady().then(async () => {
  // Hide dock icon on macOS (menubar apps typically don't show in dock)
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }

  createTray();

  // Auto-start server on launch
  await startServer();
});

// Prevent app from quitting when all windows are closed
app.on('window-all-closed', () => {
  // Do nothing - keep app running in menubar
});

// Clean up on quit
app.on('before-quit', () => {
  stopServer();
});

// Handle second instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus the tray menu or show a notification
    if (tray) {
      tray.popUpContextMenu();
    }
  });
}
