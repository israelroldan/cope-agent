import { app, Tray, Menu, nativeImage, shell, dialog, clipboard, Notification, NativeImage, BrowserWindow, ipcMain } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';

// Auto-launch support
import AutoLaunch from 'auto-launch';

// Sanity real-time listener for timers
// Import from main project's compiled dist/
import { subscribeToTimers, isSanityConfigured, type SanityTimer, type TimerListenerEvent } from '../../dist/sanity/client.js';
import { loadCredentialsIntoEnv } from '../../dist/config/index.js';

// Server state
let serverProcess: ChildProcess | null = null;
let studioProcess: ChildProcess | null = null;
let tray: Tray | null = null;
let isServerRunning = false;
let isStudioRunning = false;
let debugWindow: BrowserWindow | null = null;

// Timer state (synced from Sanity) - supports multiple timers
interface TimerInfo {
  id: string;
  _id?: string;
  label: string;
  endTime: number;
  remainingMs: number;
}
let activeTimers: TimerInfo[] = [];
let previousTimerIds: Set<string> = new Set(); // Track which timers we knew about
let timerUnsubscribe: (() => void) | null = null; // Sanity subscription
let timerUpdateInterval: NodeJS.Timeout | null = null; // For updating remainingMs display
let timerAlertWindows: BrowserWindow[] = []; // One window per display
let usingSanityTimers = false; // Whether we're using Sanity or HTTP fallback

// Studio port - use a private/ephemeral port to avoid conflicts
// (54321 conflicts with Supabase default)
const STUDIO_PORT = 64321;

// Safe logging that won't crash on EPIPE
function safeLog(...args: unknown[]): void {
  try {
    console.log(...args);
  } catch {
    // Ignore EPIPE errors when stdout is closed
  }
}

function safeError(...args: unknown[]): void {
  try {
    console.error(...args);
  } catch {
    // Ignore EPIPE errors when stderr is closed
  }
}

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
    safeLog('Server already running');
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
    safeLog(`[Server] ${data.toString()}`);
  });

  serverProcess.stderr?.on('data', (data) => {
    safeError(`[Server Error] ${data.toString()}`);
  });

  serverProcess.on('error', (err) => {
    safeError('Failed to start server:', err);
    serverProcess = null;
    updateTrayMenu();
  });

  serverProcess.on('exit', (code) => {
    safeLog(`Server exited with code ${code}`);
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

  safeError('Server failed to become healthy');
}

// Stop the server
function stopServer(): void {
  if (serverProcess) {
    stopTimerSubscription();
    serverProcess.kill('SIGTERM');
    serverProcess = null;
    isServerRunning = false;
    updateTrayMenu();
  }
}

// Check if studio is healthy
async function checkStudioHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: STUDIO_PORT,
      path: '/',
      method: 'GET',
      timeout: 2000
    }, (res) => {
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

// ============================================================================
// Timer Functions
// ============================================================================

/**
 * Format milliseconds as MM:SS or H:MM:SS
 */
function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Update the tray title with timer countdown
 * Shows closest timer + "(+X)" if there are more
 */
function updateTrayTitle(): void {
  if (!tray) return;

  // Filter to only active timers (remaining > 0)
  const runningTimers = activeTimers.filter(t => t.remainingMs > 0);

  if (runningTimers.length === 0) {
    tray.setTitle('');
    return;
  }

  // Sort by soonest first
  runningTimers.sort((a, b) => a.endTime - b.endTime);
  const closest = runningTimers[0];
  const remaining = runningTimers.length - 1;

  let title = formatTime(closest.remainingMs);
  if (remaining > 0) {
    title += ` (+${remaining})`;
  }

  tray.setTitle(title);
}

/**
 * Handle timer updates from Sanity
 */
function handleTimerUpdate(event: TimerListenerEvent): void {
  const now = Date.now();
  const newTimers = event.timers || [];

  // Convert Sanity timers to TimerInfo format
  const timerInfos: TimerInfo[] = newTimers.map(t => ({
    id: t.id,
    _id: t._id,
    label: t.label,
    endTime: t.endTime,
    remainingMs: Math.max(0, t.endTime - now),
  }));

  // Check for expired timers
  for (const prevId of previousTimerIds) {
    const currentTimer = timerInfos.find(t => t.id === prevId);
    // Timer expired if it was active before and now has remainingMs <= 0
    if (currentTimer && currentTimer.remainingMs <= 0) {
      showTimerAlert(currentTimer.label || 'Timer complete');
      // Mark timer as expired in Sanity
      cancelTimerViaApi(prevId);
    }
  }

  // Update state - only keep timers with remaining time
  activeTimers = timerInfos.filter(t => t.remainingMs > 0);
  previousTimerIds = new Set(activeTimers.map(t => t.id));

  updateTrayTitle();
  updateTrayMenu();
}

/**
 * Update timer remainingMs for display (called every second)
 */
function updateTimerDisplay(): void {
  const now = Date.now();
  let hasChanges = false;

  for (const timer of activeTimers) {
    const newRemaining = Math.max(0, timer.endTime - now);

    // Check if timer just expired
    if (timer.remainingMs > 0 && newRemaining <= 0) {
      showTimerAlert(timer.label || 'Timer complete');
      cancelTimerViaApi(timer.id);
      hasChanges = true;
    }

    timer.remainingMs = newRemaining;
  }

  // Remove expired timers from local state
  if (hasChanges) {
    activeTimers = activeTimers.filter(t => t.remainingMs > 0);
    previousTimerIds = new Set(activeTimers.map(t => t.id));
    updateTrayMenu();
  }

  updateTrayTitle();
}

/**
 * Poll timer state from HTTP server (fallback when Sanity not configured)
 */
async function pollTimerStateHttp(): Promise<void> {
  if (!isServerRunning) return;

  return new Promise((resolve) => {
    const protocol = fs.existsSync(path.join(certsPath, 'localhost+2.pem')) ? https : http;

    const req = protocol.request({
      hostname: 'localhost',
      port: 3847,
      path: '/timer',
      method: 'GET',
      rejectUnauthorized: false,
      timeout: 2000
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data) as {
            count: number;
            timers: TimerInfo[];
          };

          const newTimers = response.timers || [];

          // Check for expired timers
          for (const prevId of previousTimerIds) {
            const currentTimer = newTimers.find(t => t.id === prevId);
            if (currentTimer && currentTimer.remainingMs <= 0) {
              showTimerAlert(currentTimer.label || 'Timer complete');
              cancelTimerViaApi(prevId);
            }
          }

          // Update state
          activeTimers = newTimers.filter(t => t.remainingMs > 0);
          previousTimerIds = new Set(activeTimers.map(t => t.id));

          updateTrayTitle();
          updateTrayMenu();
        } catch {
          // Ignore parse errors
        }
        resolve();
      });
    });

    req.on('error', () => resolve());
    req.on('timeout', () => {
      req.destroy();
      resolve();
    });

    req.end();
  });
}

/**
 * Start timer subscription (Sanity real-time or HTTP fallback)
 */
function startTimerSubscription(): void {
  if (timerUnsubscribe || timerUpdateInterval) return;

  // Load credentials so Sanity client can authenticate
  loadCredentialsIntoEnv();

  // Try to use Sanity real-time listener
  if (isSanityConfigured()) {
    safeLog('Starting Sanity timer subscription...');
    usingSanityTimers = true;

    timerUnsubscribe = subscribeToTimers(
      (event) => {
        handleTimerUpdate(event);
      },
      (error) => {
        safeError('Sanity timer subscription error:', error);
        // Fall back to HTTP polling on error
        stopTimerSubscription();
        usingSanityTimers = false;
        startHttpTimerPolling();
      }
    );

    // Still need an interval to update the countdown display
    timerUpdateInterval = setInterval(() => {
      updateTimerDisplay();
    }, 1000);
  } else {
    safeLog('Sanity not configured, using HTTP polling for timers');
    startHttpTimerPolling();
  }
}

/**
 * Start HTTP polling for timers (fallback)
 */
function startHttpTimerPolling(): void {
  if (timerUpdateInterval) return;

  timerUpdateInterval = setInterval(() => {
    pollTimerStateHttp();
  }, 1000);

  // Initial poll
  pollTimerStateHttp();
}

/**
 * Stop timer subscription
 */
function stopTimerSubscription(): void {
  if (timerUnsubscribe) {
    timerUnsubscribe();
    timerUnsubscribe = null;
  }
  if (timerUpdateInterval) {
    clearInterval(timerUpdateInterval);
    timerUpdateInterval = null;
  }
  activeTimers = [];
  previousTimerIds.clear();
  usingSanityTimers = false;
  updateTrayTitle();
}

/**
 * Show full-screen timer alert as overlay on ALL screens
 */
function showTimerAlert(label: string): void {
  if (timerAlertWindows.length > 0) {
    timerAlertWindows[0]?.focus();
    return;
  }

  const alertHtmlPath = isDev
    ? path.join(__dirname, '..', 'assets', 'timer-alert.html')
    : path.join(resourcesPath, 'assets', 'timer-alert.html');

  // Get all displays
  const { screen } = require('electron');
  const displays = screen.getAllDisplays();

  // Show dock icon so user notices
  if (process.platform === 'darwin') {
    app.dock?.show();
    const dockIconPath = isDev
      ? path.join(__dirname, '..', 'assets', 'AppIcon.png')
      : path.join(resourcesPath, 'assets', 'AppIcon.png');
    if (fs.existsSync(dockIconPath)) {
      app.dock?.setIcon(dockIconPath);
    }
  }

  // Create a window for each display
  for (const display of displays) {
    const { x, y, width, height } = display.bounds;

    const timerPreloadPath = isDev
      ? path.join(__dirname, 'timer-preload.js')
      : path.join(resourcesPath, 'app', 'timer-preload.js');

    const alertWindow = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      closable: true,
      focusable: true,
      hasShadow: false,
      transparent: true,
      type: 'panel',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: timerPreloadPath,
      },
    });

    // Show on all workspaces and float above other windows
    alertWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    alertWindow.setAlwaysOnTop(true, 'floating');

    // Load with label as query parameter
    alertWindow.loadFile(alertHtmlPath, {
      query: { label: label }
    });

    timerAlertWindows.push(alertWindow);
  }

  // Play system alert sound (once)
  spawn('afplay', ['/System/Library/Sounds/Glass.aiff'], { stdio: 'ignore', detached: true });
}

/**
 * Dismiss all timer alert windows with fade out
 */
function dismissTimerAlert(): void {
  // Tell all windows to fade out
  for (const win of timerAlertWindows) {
    if (!win.isDestroyed()) {
      win.webContents.send('timer-fade-out');
    }
  }

  // Update UI
  updateTrayTitle();
  updateTrayMenu();

  // Close all windows after fade animation completes
  setTimeout(() => {
    for (const win of timerAlertWindows) {
      if (!win.isDestroyed()) {
        win.destroy();
      }
    }
    timerAlertWindows = [];
    if (process.platform === 'darwin') {
      app.dock?.hide();
    }
  }, 500);
}

/**
 * Cancel timer via API
 * @param timerId Optional: specific timer to cancel. If not provided, cancels all.
 */
async function cancelTimerViaApi(timerId?: string): Promise<void> {
  return new Promise((resolve) => {
    const protocol = fs.existsSync(path.join(certsPath, 'localhost+2.pem')) ? https : http;
    const timerPath = timerId ? `/timer/${timerId}` : '/timer';

    const req = protocol.request({
      hostname: 'localhost',
      port: 3847,
      path: timerPath,
      method: 'DELETE',
      rejectUnauthorized: false,
      timeout: 2000
    }, () => {
      if (timerId) {
        // Remove specific timer from local state
        activeTimers = activeTimers.filter(t => t.id !== timerId);
        previousTimerIds.delete(timerId);
      } else {
        // Clear all timers
        activeTimers = [];
        previousTimerIds.clear();
      }
      updateTrayTitle();
      updateTrayMenu();
      resolve();
    });

    req.on('error', () => resolve());
    req.on('timeout', () => {
      req.destroy();
      resolve();
    });

    req.end();
  });
}

// Start the LifeOS Studio
async function startStudio(): Promise<void> {
  if (studioProcess) {
    safeLog('Studio already running');
    return;
  }

  // Get the cope-agent project directory
  const copeAgentPath = isDev
    ? path.join(__dirname, '..', '..')
    : path.join(resourcesPath, '..');

  // Check if sanity is available
  const sanityBin = path.join(copeAgentPath, 'node_modules', '.bin', 'sanity');
  if (!fs.existsSync(sanityBin)) {
    safeError('Sanity CLI not found at:', sanityBin);
    return;
  }

  // Set up environment with Sanity credentials
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(STUDIO_PORT),
  };

  // Run sanity from project root where sanity.config.ts wrapper lives
  studioProcess = spawn(sanityBin, ['dev', '--port', String(STUDIO_PORT)], {
    cwd: copeAgentPath,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  });

  studioProcess.stdout?.on('data', (data) => {
    const output = data.toString();
    safeLog(`[Studio] ${output}`);
    // Detect when studio is ready
    if (output.includes('running at') || output.includes('localhost:')) {
      isStudioRunning = true;
      updateTrayMenu();
    }
  });

  studioProcess.stderr?.on('data', (data) => {
    safeError(`[Studio Error] ${data.toString()}`);
  });

  studioProcess.on('error', (err) => {
    safeError('Failed to start studio:', err);
    studioProcess = null;
    isStudioRunning = false;
    updateTrayMenu();
  });

  studioProcess.on('exit', (code) => {
    safeLog(`Studio exited with code ${code}`);
    studioProcess = null;
    isStudioRunning = false;
    updateTrayMenu();
  });

  // Wait for studio to be ready
  let attempts = 0;
  while (attempts < 20) { // Studio takes longer to start
    await new Promise(resolve => setTimeout(resolve, 500));
    if (await checkStudioHealth()) {
      isStudioRunning = true;
      updateTrayMenu();
      safeLog(`Studio running at http://localhost:${STUDIO_PORT}`);
      return;
    }
    attempts++;
  }

  safeLog('Studio may still be starting...');
}

// Stop the studio
function stopStudio(): void {
  if (studioProcess) {
    studioProcess.kill('SIGTERM');
    studioProcess = null;
    isStudioRunning = false;
    updateTrayMenu();
  }
}

// Launch COPE Agent dev mode in Terminal.app
function launchAgentInTerminal(): void {
  const copeAgentPath = isDev
    ? path.join(__dirname, '..', '..')
    : path.join(resourcesPath, '..');

  const script = `
    tell application "Terminal"
      activate
      do script "cd '${copeAgentPath}' && npm run dev"
    end tell
  `;

  spawn('osascript', ['-e', script], { stdio: 'ignore', detached: true });
}

// Launch "cope" CLI in iTerm
// The cope alias is expected to be available in the user's shell
function launchCopeInITerm(): void {
  const script = `
    tell application "iTerm"
      activate
      create window with default profile
      tell current session of current window
        write text "cope"
      end tell
    end tell
  `;

  spawn('osascript', ['-e', script], { stdio: 'ignore', detached: true });
}

// Open the studio in browser
async function openStudio(): Promise<void> {
  if (!isStudioRunning) {
    await startStudio();
    // Give it a moment to fully start
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  shell.openExternal(`http://localhost:${STUDIO_PORT}`);
}

// Open the debug window
function openDebugWindow(): void {
  if (debugWindow) {
    debugWindow.focus();
    return;
  }

  const debugHtmlPath = isDev
    ? path.join(__dirname, '..', 'assets', 'debug.html')
    : path.join(resourcesPath, 'assets', 'debug.html');

  const preloadPath = isDev
    ? path.join(__dirname, 'preload.js')
    : path.join(resourcesPath, 'app', 'preload.js');

  // Show dock icon so window appears in Cmd+Tab
  if (process.platform === 'darwin') {
    app.dock?.show();
    // Set dock icon if available
    const dockIconPath = isDev
      ? path.join(__dirname, '..', 'assets', 'AppIcon.png')
      : path.join(resourcesPath, 'assets', 'AppIcon.png');
    if (fs.existsSync(dockIconPath)) {
      app.dock?.setIcon(dockIconPath);
    }
  }

  debugWindow = new BrowserWindow({
    width: 800,
    height: 500,
    title: 'COPE Agent Debug',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allow self-signed certs for localhost SSE
      preload: preloadPath,
    },
    backgroundColor: '#1e1e1e',
  });

  debugWindow.loadFile(debugHtmlPath);

  debugWindow.on('closed', () => {
    debugWindow = null;
    // Hide dock icon again when debug window is closed
    if (process.platform === 'darwin') {
      app.dock?.hide();
    }
  });
}

// Update tray icon and menu
function updateTrayMenu(): void {
  if (!tray) return;

  const statusText = isServerRunning ? 'Running' : 'Stopped';
  const statusIcon = isServerRunning ? '🟢' : '⚪';

  autoLauncher.isEnabled().then((isEnabled) => {
    // Build timer menu items for all active timers
    const runningTimers = activeTimers.filter(t => t.remainingMs > 0)
      .sort((a, b) => a.endTime - b.endTime);

    const timerMenuItems: Electron.MenuItemConstructorOptions[] = runningTimers.length > 0
      ? [
          { type: 'separator' },
          {
            label: `⏱ Timers (${runningTimers.length})`,
            enabled: false
          },
          ...runningTimers.map(timer => {
            const endDate = new Date(timer.endTime);
            const endTimeStr = endDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            return {
              label: `   ${endTimeStr} - ${timer.label}`,
              submenu: [
                {
                  label: 'Cancel this timer',
                  click: () => cancelTimerViaApi(timer.id)
                }
              ] as Electron.MenuItemConstructorOptions[]
            };
          }),
          {
            label: 'Cancel All Timers',
            click: () => cancelTimerViaApi()
          },
        ]
      : [];

    const contextMenu = Menu.buildFromTemplate([
      {
        label: `COPE Agent - ${statusText}`,
        enabled: false
      },
      ...timerMenuItems,
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
      {
        label: 'View Debug Log',
        enabled: isServerRunning,
        click: () => {
          openDebugWindow();
        }
      },
      { type: 'separator' },
      {
        label: isStudioRunning ? `LifeOS Studio (port ${STUDIO_PORT})` : 'LifeOS Studio',
        submenu: [
          {
            label: isStudioRunning ? 'Open in Browser' : 'Start & Open',
            click: () => openStudio()
          },
          {
            label: 'Stop Studio',
            enabled: isStudioRunning,
            click: () => stopStudio()
          }
        ]
      },
      { type: 'separator' },
      {
        label: 'Launch Agent (Terminal)',
        click: () => launchAgentInTerminal()
      },
      {
        label: 'Launch COPE CLI (iTerm)',
        click: () => launchCopeInITerm()
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
          stopStudio();
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

// Allow self-signed certificates for localhost (needed for debug window SSE)
app.on('certificate-error', (event, _webContents, url, _error, _certificate, callback) => {
  if (new URL(url).hostname === 'localhost') {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

// Main app initialization
app.whenReady().then(async () => {
  // Allow self-signed certs for EventSource (SSE) connections
  const { session } = require('electron');
  session.defaultSession.setCertificateVerifyProc((_request: unknown, callback: (result: number) => void) => {
    callback(0); // 0 = success, accept all certs for localhost debug
  });

  // Hide dock icon on macOS (menubar apps typically don't show in dock)
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }

  createTray();

  // Start Sanity timer subscription immediately (works with remote or local timers)
  startTimerSubscription();

  // Auto-start local server (optional, for local MCP access)
  await startServer();

  // IPC handlers for debug window
  ipcMain.handle('open-studio', async () => {
    await openStudio();
    return { success: true, port: STUDIO_PORT };
  });

  ipcMain.handle('get-studio-status', () => {
    return { running: isStudioRunning, port: STUDIO_PORT };
  });

  // IPC handlers for timer alert
  ipcMain.handle('dismiss-timer-alert', () => {
    dismissTimerAlert();
    return { success: true };
  });

  // Listen for timer dismiss from any alert window
  ipcMain.on('timer-dismiss', () => {
    dismissTimerAlert();
  });
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
