/**
 * AI Executor — 借壳 codebuddy CLI 实现工作台内 AI 直连
 *
 * 核心流程：
 *   Electron spawn codebuddy --print --output-format stream-json
 *   → 实时捕获 stdout stream-json 事件 → 转发到渲染进程
 *   → 进程退出 → 自动写入 outputs/ + receipt.json
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');

// ── Constants ────────────────────────────────────────────────
const CODEBUDDY_PATH_MAC = '/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy';
const CODEBUDDY_PATH_WIN = 'codebuddy'; // Windows: assume in PATH or bundled
const MAX_TURNS_DEFAULT = 10;
const STREAM_JSON_SEPARATOR = '\n';

// ── macOS PATH fix (lazy, only computed when needed) ─────────
// Electron apps launched from Finder/open get a minimal PATH
// (/usr/bin:/bin:/usr/sbin:/sbin) that lacks node. codebuddy is a
// `#!/usr/bin/env node` script, so without a fix it exits 127.
let fixedPathCache = null;

/**
 * Scan ~/.workbuddy/binaries/node/versions/ for existing node directories.
 * Returns an array of paths (no version hardcoding).
 */
function globWorkbuddyNodeDirs() {
  const base = `${process.env.HOME || ''}/.workbuddy/binaries/node/versions`;
  try {
    if (!fs.existsSync(base)) return [];
    return fs.readdirSync(base, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => `${base}/${e.name}/bin`)
      .filter((d) => fs.existsSync(`${d}/node`));
  } catch {
    return [];
  }
}

function getSpawnEnv() {
  if (fixedPathCache) return { ...process.env, PATH: fixedPathCache };
  // macOS Finder/open apps get minimal PATH; augment with login shell PATH
  if (process.platform === 'darwin') {
    const { execSync } = require('child_process');
    const home = process.env.HOME || '';
    // Fallback candidate paths (no hardcoded usernames/versions)
    const fallbackPaths = [
      '/opt/homebrew/bin', '/usr/local/bin',
      `${home}/.local/bin`,
      ...globWorkbuddyNodeDirs(),
    ].filter(Boolean);

    let shellPath = '';
    try {
      // Use env -i to start zsh with a clean environment so .zprofile/.zshrc
      // can rebuild PATH from scratch. If we inherit process.env (which may
      // already have a minimal PATH from Finder), zsh's `PATH=$PATH:...`
      // lines would just append to the broken PATH.
      shellPath = execSync(
        '/usr/bin/env -i HOME="$HOME" /bin/zsh -l -c "echo $PATH"',
        { encoding: 'utf-8', timeout: 5000, env: { HOME: home } }
      ).trim();
    } catch (err) {
      log.warn(`[ai-executor] failed to read shell PATH: ${err.message}`);
    }

    // Verify the shell PATH actually contains node; if not, use fallback
    const candidatePaths = shellPath
      ? shellPath.split(':')
      : fallbackPaths;
    const hasNodeInPath = candidatePaths.some((p) => fs.existsSync(`${p}/node`));

    if (hasNodeInPath && shellPath) {
      fixedPathCache = shellPath + ':' + process.env.PATH;
      log.info(`[ai-executor] PATH fixed via login shell (${shellPath.split(':').length} entries)`);
    } else {
      // Fallback: merge known node locations with current PATH
      fixedPathCache = [...fallbackPaths, process.env.PATH].filter(Boolean).join(':');
      log.info(`[ai-executor] PATH fallback applied (shellPath had node: ${hasNodeInPath})`);
    }
  }
  return { ...process.env, PATH: fixedPathCache || process.env.PATH };
}

// ── State ────────────────────────────────────────────────────
let activePermissionMode = 'bypassPermissions';
let activeProcess = null;
let activeTaskId = null;
let collectedOutput = '';
let mainWindowRef = null;
let workspaceServiceRef = null;

// ── Public API ───────────────────────────────────────────────

function init(mainWindow, workspaceService) {
  mainWindowRef = mainWindow;
  workspaceServiceRef = workspaceService;
  log.info('[ai-executor] initialized');
}

function checkInstallation() {
  const platform = process.platform;
  const cliPath = platform === 'darwin' ? CODEBUDDY_PATH_MAC : CODEBUDDY_PATH_WIN;

  if (platform === 'darwin') {
    const appExists = fs.existsSync('/Applications/WorkBuddy.app');
    const cliExists = fs.existsSync(cliPath);
    return {
      installed: appExists && cliExists,
      cliPath,
      platform,
      appPath: appExists ? '/Applications/WorkBuddy.app' : null,
    };
  }

  try {
    spawn('where', ['codebuddy'], { timeout: 5000 });
    return { installed: true, cliPath: 'codebuddy', platform };
  } catch {
    return { installed: false, cliPath: null, platform };
  }
}

function execute(taskId, prompt, options = {}) {
  if (activeProcess) {
    log.warn('[ai-executor] already running, cancelling previous');
    cancel();
  }

  const installInfo = checkInstallation();
  if (!installInfo.installed) {
    sendToRenderer('ai:on-error', { taskId, error: 'WorkBuddy 未安装，无法使用 AI 直连功能。请安装 WorkBuddy 后重试。' });
    return { started: false, taskId };
  }

  const cliPath = installInfo.cliPath;
  const maxTurns = options.maxTurns || MAX_TURNS_DEFAULT;
  const permissionMode = options.permissionMode || 'bypassPermissions';
  activePermissionMode = permissionMode;
  const model = options.model || 'auto';
  const kind = options.kind || 'analysis';

  const workspacePath = workspaceServiceRef ? workspaceServiceRef.workspacePath : '';
  const addDirs = [workspacePath];

  const args = [
    '--print',
    '--output-format', 'stream-json',
    '--max-turns', String(maxTurns),
    '--permission-mode', permissionMode,
    '--model', model,
  ];

  for (const dir of addDirs) {
    if (dir) args.push('--add-dir', dir);
  }

  const taskDir = workspaceServiceRef
    ? workspaceServiceRef.resolvePath('04-分析任务', taskId)
    : '';
  if (taskDir && fs.existsSync(taskDir)) {
    args.push('--add-dir', taskDir);
  }

  activeTaskId = taskId;
  collectedOutput = '';

  log.info(`[ai-executor] spawning: ${cliPath} ${args.join(' ')}`);

  // Diagnostic: verify node is reachable in the fixed PATH
  const fixedEnv = getSpawnEnv();
  const hasNode = (fixedEnv.PATH || '').split(':').some((p) => fs.existsSync(`${p}/node`));
  log.info(`[ai-executor] spawn env PATH has node: ${hasNode}`);
  if (!hasNode) {
    log.warn('[ai-executor] node not found in PATH after fix — codebuddy will likely fail with exit 127');
  }

  try {
    activeProcess = spawn(cliPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: fixedEnv,
    });

    activeProcess.stdin.write(prompt);
    activeProcess.stdin.end();

    let buffer = '';
    activeProcess.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(STREAM_JSON_SEPARATOR);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          handleStreamEvent(taskId, event);
        } catch (parseErr) {
          sendToRenderer('ai:on-event', { taskId, type: 'raw_text', content: line });
          collectedOutput += line + '\n';
        }
      }
    });

    let stderrBuffer = '';
    activeProcess.stderr.on('data', (chunk) => { stderrBuffer += chunk.toString(); });

    activeProcess.on('close', (code) => {
      log.info(`[ai-executor] process exited with code ${code}`);
      const wasCancelled = activeProcess === null;
      if (!wasCancelled && code === 0) {
        saveResults(taskId, collectedOutput, false, kind);
        sendToRenderer('ai:on-complete', { taskId, outputLength: collectedOutput.length, exitCode: code });
      } else if (!wasCancelled) {
        sendToRenderer('ai:on-error', { taskId, error: `AI 执行异常退出（code ${code}）`, stderr: stderrBuffer.slice(0, 500) });
        if (collectedOutput.trim()) saveResults(taskId, collectedOutput, true, kind);
      }
      activeProcess = null;
      activeTaskId = null;
    });

    activeProcess.on('error', (err) => {
      log.error(`[ai-executor] spawn error: ${err.message}`);
      sendToRenderer('ai:on-error', { taskId, error: `无法启动 AI 引擎：${err.message}` });
      activeProcess = null;
      activeTaskId = null;
    });

    sendToRenderer('ai:on-event', { taskId, type: 'system', subtype: 'started', content: 'AI 引擎已启动，正在执行分析...' });
    return { started: true, taskId };
  } catch (err) {
    log.error(`[ai-executor] execute failed: ${err.message}`);
    sendToRenderer('ai:on-error', { taskId, error: `启动 AI 执行失败：${err.message}` });
    activeProcess = null;
    activeTaskId = null;
    return { started: false, taskId };
  }
}

function cancel() {
  if (!activeProcess) return { cancelled: false };
  log.info('[ai-executor] cancelling execution');
  try {
    activeProcess.kill('SIGTERM');
    setTimeout(() => { if (activeProcess) { try { activeProcess.kill('SIGKILL'); } catch {} activeProcess = null; } }, 3000);
  } catch { activeProcess = null; }
  const taskId = activeTaskId;
  activeProcess = null;
  activeTaskId = null;
  sendToRenderer('ai:on-event', { taskId, type: 'system', subtype: 'cancelled', content: 'AI 执行已取消' });
  return { cancelled: true, taskId };
}

// ── Internal helpers ─────────────────────────────────────────
function handleStreamEvent(taskId, event) {
  const type = event.type || 'unknown';
  const content = extractContent(event);
  sendToRenderer('ai:on-event', { taskId, type, subtype: event.subtype || null, content, toolName: event.tool_name || event.tool_use?.name || null });
  if (type === 'assistant' || type === 'text' || type === 'result') {
    if (content) collectedOutput += content + '\n';
  }
}

function extractContent(event) {
  let raw = null;
  if (event.content) raw = event.content;
  else if (event.message) raw = event.message;
  else if (event.text) raw = event.text;
  else if (event.result) { raw = typeof event.result === 'string' ? event.result : event.result.content; }
  else if (event.tool_result?.content) { raw = event.tool_result.content; }
  else if (event.tool_use) return `🔧 使用工具：${event.tool_use.name || event.tool_name || 'unknown'}`;
  else return JSON.stringify(event).slice(0, 200);

  // codebuddy stream-json: assistant content is often an array of
  // { type: "text", text: "..." } blocks (Claude API format), not a plain
  // string. Returning a non-string here crashes the React renderer (white
  // screen) because React cannot render arbitrary objects.
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    return raw.map((block) => {
      if (typeof block === 'string') return block;
      if (block?.text) return block.text;
      if (block?.content) return typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
      return JSON.stringify(block);
    }).join('');
  }
  if (raw && typeof raw === 'object') {
    if (raw.text) return String(raw.text);
    if (raw.content) return typeof raw.content === 'string' ? raw.content : JSON.stringify(raw.content);
    return JSON.stringify(raw);
  }
  return String(raw);
}

function sendToRenderer(channel, data) {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) mainWindowRef.webContents.send(channel, data);
}

function saveResults(taskId, output, isPartial = false, kind = 'analysis') {
  if (!workspaceServiceRef) { log.error('[ai-executor] no workspaceService, cannot save results'); return; }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const kindLabel = kind === 'reanalysis' ? '重分析' : '首次分析';
  const outputFileName = `${taskId}_${isPartial ? 'partial' : kindLabel}_${timestamp}.md`;
  const outputRelPath = `04-分析任务/${taskId}/outputs/${outputFileName}`;
  try {
    workspaceServiceRef.saveFile(outputRelPath, collectedOutput);
    log.info(`[ai-executor] saved output: ${outputRelPath}`);
    const receiptData = { kind, source: 'ai-executor-codebuddy', status: isPartial ? 'partial' : 'completed', summary: `AI 直连${kindLabel}执行${isPartial ? '（部分输出）' : ''}，输出 ${collectedOutput.length} 字符`, outputFile: outputRelPath, completedAt: new Date().toISOString(), engineInfo: { type: 'codebuddy-cli', version: 'v2.103.3', maxTurns: MAX_TURNS_DEFAULT, permissionMode: activePermissionMode } };
    workspaceServiceRef.writeReceipt(taskId, receiptData);
    log.info(`[ai-executor] saved receipt for task ${taskId}`);
    const dispatchData = { kind, title: `${taskId} AI直连${kindLabel}`, prompt: '(调度单已通过 stdin 传入 codebuddy CLI)', status: isPartial ? 'partial_receipt' : 'completed_receipt', executedVia: 'ai-executor', createdAt: new Date().toISOString() };
    workspaceServiceRef.writeDispatch(taskId, dispatchData);
    log.info(`[ai-executor] saved dispatch record for task ${taskId}`);
  } catch (err) { log.error(`[ai-executor] save results failed: ${err.message}`); }
}

module.exports = { init, checkInstallation, execute, cancel };
