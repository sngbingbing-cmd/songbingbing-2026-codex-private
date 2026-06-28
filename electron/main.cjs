const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
} = require('electron');
const path = require('path');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');
const { WorkspaceService } = require('./workspace-service.cjs');
const { version } = require('../package.json');

// ── Logging ──────────────────────────────────────────────────────
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('App starting...');

// ── State ─────────────────────────────────────────────────────────
let mainWindow = null;
let workspaceService = null;
const IS_DEV = !app.isPackaged;
const WS_NAMESPACE = 'ws';
const WS_READY_EVENT = `${WS_NAMESPACE}:ready`;

// ── Window ────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    title: 'AI原生数据分析工作台',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 18, y: 18 } } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  if (IS_DEV) {
    mainWindow.loadURL('http://127.0.0.1:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── Serialization helper ──────────────────────────────────────────
function asResult(data) {
  return data === undefined ? null : data;
}

function asError(error) {
  return {
    error: true,
    message: error.message || 'Unknown error',
    ...(IS_DEV ? { stack: error.stack } : {}),
  };
}

// ── IPC handlers ──────────────────────────────────────────────────

/** Map of channel -> handler fn for whitelist registration */
const IPC_HANDLERS = {};

// Workspace
IPC_HANDLERS['workspace:init'] = async () => {
  if (workspaceService) return asResult(workspaceService.getInfo({ includeFileDetails: true }));

  const docsPath = path.resolve(app.getPath('documents'));
  const workspacePath = path.join(docsPath, 'AI原生数据分析工作台-应用版');
  const templatePath = IS_DEV
    ? path.join(__dirname, '..', 'workspace-template')
    : path.join(process.resourcesPath, 'workspace-template');
  const fs = require('fs');
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
    if (fs.existsSync(templatePath)) fs.cpSync(templatePath, workspacePath, { recursive: true });
  }
  workspaceService = new WorkspaceService(workspacePath);

  log.info(`Workspace initialized at: ${workspaceService.workspacePath}`);
  return asResult(workspaceService.getInfo({ includeFileDetails: true }));
};

IPC_HANDLERS['workspace:status'] = async () => {
  if (!workspaceService) return asError(new Error('Workspace not initialized'));
  return asResult(workspaceService.getInfo());
};

IPC_HANDLERS['workspace:select'] = async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    message: '选择已有的工作区目录',
  });
  if (result.canceled || result.filePaths.length === 0) {
    return asResult(null);
  }
  const selectedPath = result.filePaths[0];
  if (!WorkspaceService.isValidWorkspace(selectedPath)) {
    return asError(new Error('所选目录不是有效的工作区（缺少 01-投喂区 或 04-分析任务）'));
  }
  workspaceService = new WorkspaceService(selectedPath);
  log.info(`Workspace switched to: ${workspaceService.workspacePath}`);
  return asResult(workspaceService.getInfo({ includeFileDetails: true }));
};

// Tasks
IPC_HANDLERS['task:list'] = async (_event, filter) => {
  if (!workspaceService) return asError(new Error('Workspace not initialized'));
  return asResult(workspaceService.listTasks(filter || undefined));
};

IPC_HANDLERS['task:get'] = async (_event, taskId) => {
  if (!workspaceService) return asError(new Error('Workspace not initialized'));
  try {
    return asResult(workspaceService.getTask(taskId));
  } catch (e) {
    return asError(e);
  }
};

IPC_HANDLERS['task:create'] = async (_event, params) => {
  if (!workspaceService) return asError(new Error('Workspace not initialized'));
  try {
    return asResult(workspaceService.createTask(params || {}));
  } catch (e) {
    return asError(e);
  }
};

IPC_HANDLERS['task:update'] = async (_event, taskId, updates) => {
  if (!workspaceService) return asError(new Error('Workspace not initialized'));
  try {
    return asResult(workspaceService.updateTask(taskId, updates));
  } catch (e) {
    return asError(e);
  }
};

IPC_HANDLERS['task:archive'] = async (_event, taskId) => {
  if (!workspaceService) return asError(new Error('Workspace not initialized'));
  try {
    return asResult(workspaceService.archiveTask(taskId));
  } catch (e) {
    return asError(e);
  }
};

// Files
IPC_HANDLERS['file:select'] = async (_event, options) => {
  const props = [];
  if (options?.directories) props.push('openDirectory');
  if (options?.multi) props.push('multiSelections');
  props.push('openFile');

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: [...new Set(props)],
    ...(options?.filters ? { filters: options.filters } : {}),
  });
  if (result.canceled) return asResult([]);
  return asResult(result.filePaths);
};

IPC_HANDLERS['file:copy'] = async (_event, sourcePath, relativeDestPath) => {
  if (!workspaceService) return asError(new Error('Workspace not initialized'));
  try {
    return asResult(workspaceService.copyFile(sourcePath, relativeDestPath));
  } catch (e) {
    return asError(e);
  }
};

IPC_HANDLERS['file:sync'] = async (_event, sourcePaths, targetDir) => {
  if (!workspaceService) return asError(new Error('Workspace not initialized'));
  try {
    const results = [];
    for (const src of sourcePaths) {
      const fileName = path.basename(src);
      const dest = path.join(targetDir || '01-投喂区', fileName);
      results.push(workspaceService.copyFile(src, dest));
    }
    return asResult(results);
  } catch (e) {
    return asError(e);
  }
};

IPC_HANDLERS['task:sync-inputs'] = async (_event, taskId) => {
  if (!workspaceService) return asError(new Error('Workspace not initialized'));
  try {
    const fs = require('fs');
    const inbox = workspaceService.resolvePath('04-分析任务', taskId, 'inbox');
    const raw = workspaceService.resolvePath('04-分析任务', taskId, 'raw');
    fs.mkdirSync(raw, { recursive: true });
    if (!fs.existsSync(inbox)) return asResult([]);
    const copied = [];
    for (const entry of fs.readdirSync(inbox, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name.startsWith('.')) continue;
      fs.copyFileSync(path.join(inbox, entry.name), path.join(raw, entry.name));
      copied.push(entry.name);
    }
    return asResult(copied);
  } catch (e) {
    return asError(e);
  }
};

IPC_HANDLERS['file:read'] = async (_event, relativePath) => {
  if (!workspaceService) return asError(new Error('Workspace not initialized'));
  try {
    return asResult(workspaceService.readFile(relativePath));
  } catch (e) {
    return asError(e);
  }
};

IPC_HANDLERS['file:save'] = async (_event, relativePath, content) => {
  if (!workspaceService) return asError(new Error('Workspace not initialized'));
  try {
    return asResult(workspaceService.saveFile(relativePath, content));
  } catch (e) {
    return asError(e);
  }
};

IPC_HANDLERS['file:open-finder'] = async (_event, relativePath) => {
  if (!workspaceService) return asError(new Error('Workspace not initialized'));
  try {
    const resolved = workspaceService.resolvePath(relativePath || '.');
    const stat = require('fs').statSync(resolved);
    if (stat.isDirectory()) await shell.openPath(resolved);
    else shell.showItemInFolder(resolved);
    return asResult({ ok: true });
  } catch (e) {
    return asError(e);
  }
};

IPC_HANDLERS['file:list-directory'] = async (_event, relativePath) => {
  if (!workspaceService) return asError(new Error('Workspace not initialized'));
  try {
    return asResult(workspaceService.listDirectory(relativePath));
  } catch (e) {
    return asError(e);
  }
};

// Semantic
IPC_HANDLERS['semantic:read'] = async (_event, category) => {
  if (!workspaceService) return asError(new Error('Workspace not initialized'));
  try {
    return asResult(workspaceService.semanticRead(category || undefined));
  } catch (e) {
    return asError(e);
  }
};

// Dispatch & Receipt
IPC_HANDLERS['dispatch:write'] = async (_event, taskId, dispatchData) => {
  if (!workspaceService) return asError(new Error('Workspace not initialized'));
  try {
    return asResult(workspaceService.writeDispatch(taskId, dispatchData));
  } catch (e) {
    return asError(e);
  }
};

IPC_HANDLERS['receipt:read'] = async (_event, taskId) => {
  if (!workspaceService) return asError(new Error('Workspace not initialized'));
  try {
    return asResult(workspaceService.readReceipt(taskId));
  } catch (e) {
    return asError(e);
  }
};

IPC_HANDLERS['receipt:write'] = async (_event, taskId, receiptData) => {
  if (!workspaceService) return asError(new Error('Workspace not initialized'));
  try {
    return asResult(workspaceService.writeReceipt(taskId, receiptData));
  } catch (e) {
    return asError(e);
  }
};

// Prompt
IPC_HANDLERS['prompt:generate'] = async (_event, taskId, kind) => {
  if (!workspaceService) return asError(new Error('Workspace not initialized'));
  try {
    return asResult(workspaceService.generatePrompt(taskId, kind));
  } catch (e) {
    return asError(e);
  }
};

// Update
IPC_HANDLERS['update:check'] = async () => {
  if (IS_DEV || require('../package.json').repository.url.includes('YOUR_GITHUB_USER')) {
    return asResult({ available: false, configured: false });
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    if (result && result.updateInfo) {
      return asResult({
        available: true,
        version: result.updateInfo.version,
        releaseDate: result.updateInfo.releaseDate,
        releaseNotes: result.updateInfo.releaseNotes,
      });
    }
    return asResult({ available: false });
  } catch {
    return asResult({ available: false });
  }
};

IPC_HANDLERS['update:install'] = async () => {
  if (IS_DEV) return asResult({ installed: false });
  autoUpdater.quitAndInstall();
  return asResult({ installed: true });
};

IPC_HANDLERS['app:version'] = async () => {
  return asResult({ version });
};

// ── Registration ──────────────────────────────────────────────────

function registerIpcHandlers() {
  for (const [channel, handler] of Object.entries(IPC_HANDLERS)) {
    ipcMain.handle(channel, handler);
  }
  log.info(`Registered ${Object.keys(IPC_HANDLERS).length} IPC handlers`);
}

// ── Auto-updater ──────────────────────────────────────────────────

function setupAutoUpdater() {
  if (IS_DEV) {
    log.info('Skipping auto-updater in dev mode');
    return;
  }

  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-available', (info) => {
    log.info(`Update available: ${info.version}`);
    if (mainWindow) {
      mainWindow.webContents.send(WS_READY_EVENT, {
        type: 'update-available',
        version: info.version,
      });
    }
  });

  autoUpdater.on('update-downloaded', () => {
    log.info('Update downloaded, will install on quit');
    if (mainWindow) {
      mainWindow.webContents.send(WS_READY_EVENT, { type: 'update-downloaded' });
    }
    autoUpdater.quitAndInstall();
  });

  autoUpdater.on('error', (err) => {
    log.error(`Auto-updater error: ${err.message}`);
  });
}

// ── App lifecycle ─────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  registerIpcHandlers();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  log.info('App quitting');
});
