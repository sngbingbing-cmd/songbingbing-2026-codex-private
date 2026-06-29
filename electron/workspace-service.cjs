const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LEGACY_DIRS = [
  '00-使用说明',
  '01-投喂区',
  '02-权威语义层',
  '03-领域分析Skills',
  '04-分析任务',
  '05-评测与验证',
  '06-输出物',
];

const TASKS_DIR = '04-分析任务';
const EXTERNAL_SOURCES_FILE = 'external-sources.json';
const EXTERNAL_INVENTORY_FILE = 'external-source-inventory.json';

class WorkspaceService {
  /**
   * @param {string} workspacePath - Absolute path to the workspace root
   */
  constructor(workspacePath) {
    if (!workspacePath || typeof workspacePath !== 'string') {
      throw new Error('workspacePath is required');
    }
    this.workspacePath = path.resolve(workspacePath);
  }

  // ── Path validation ─────────────────────────────────────────────

  /**
   * Resolve a relative path within the workspace, blocking traversal attempts.
   * Accepts multiple segments like path.join.
   * @param {...string} segments
   * @returns {string} Resolved absolute path
   * @throws {Error} If resolved path is outside workspace
   */
  resolvePath(...segments) {
    const joined = path.join(...segments);
    const resolved = path.resolve(this.workspacePath, joined);
    const normalized = path.normalize(resolved);

    if (normalized !== this.workspacePath && !normalized.startsWith(this.workspacePath + path.sep)) {
      throw new Error(`Path traversal blocked: resolved path is outside workspace`);
    }

    return normalized;
  }

  /**
   * Validate an absolute path is within workspace. Used for pre-validated external paths.
   * @param {string} absolutePath
   * @returns {boolean}
   */
  isValidPath(absolutePath) {
    const normalized = path.normalize(absolutePath);
    return (
      normalized === this.workspacePath ||
      normalized.startsWith(this.workspacePath + path.sep)
    );
  }

  // ── Workspace info ──────────────────────────────────────────────

  /**
   * Return serializable workspace info.
   * @param {object} [options]
   * @param {boolean} [options.includeFileDetails] - Include file listings in structure
   * @returns {object}
   */
  getInfo(options = {}) {
    const structure = {};
    for (const dir of LEGACY_DIRS) {
      const dirPath = path.join(this.workspacePath, dir);
      const exists = fs.existsSync(dirPath);
      structure[dir] = { exists, items: [] };
      if (exists && options.includeFileDetails) {
        try {
          const entries = fs.readdirSync(dirPath, { withFileTypes: true });
          structure[dir].items = entries
            .filter((e) => !e.name.startsWith('.'))
            .map((e) => ({
              name: e.name,
              isDirectory: e.isDirectory(),
              isFile: e.isFile(),
            }));
        } catch {
          structure[dir].items = [];
        }
      }
    }
    return {
      workspacePath: this.workspacePath,
      isLegacy: WorkspaceService._isLegacyStructure(this.workspacePath),
      structure,
    };
  }

  // ── Task CRUD ───────────────────────────────────────────────────

  /**
   * List tasks, optionally filtered by status.
   * @param {object} [filter]
   * @param {string} [filter.status] - 'pending' | 'running' | 'archived'
   * @returns {object[]}
   */
  listTasks(filter) {
    const tasksDir = this.resolvePath(TASKS_DIR);
    if (!fs.existsSync(tasksDir)) return [];

    const entries = fs.readdirSync(tasksDir, { withFileTypes: true });
    const tasks = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

      const status = this._readJson(TASKS_DIR, entry.name, 'status.json');
      if (!status) continue;

      if (filter && filter.status && status.status !== filter.status) continue;

      tasks.push({
        id: entry.name,
        title: status.title || entry.name,
        description: status.description || '',
        status: status.status || 'pending',
        taskType: status.taskType || 'analysis',
        createdAt: status.createdAt || null,
        updatedAt: status.updatedAt || null,
        hasDispatch: this._exists(TASKS_DIR, entry.name, 'dispatch.json'),
        hasReceipt: this._exists(TASKS_DIR, entry.name, 'receipt.json'),
      });
    }

    return tasks.sort((a, b) => {
      if (!a.createdAt) return 1;
      if (!b.createdAt) return -1;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }

  /**
   * Get single task with full detail.
   * @param {string} taskId
   * @returns {object|null}
   */
  getTask(taskId) {
    if (!taskId || typeof taskId !== 'string') return null;

    const taskDir = this.resolvePath(TASKS_DIR, taskId);
    if (!fs.existsSync(taskDir)) return null;

    const status = this._readJson(TASKS_DIR, taskId, 'status.json') || {};
    const dispatch = this._readJson(TASKS_DIR, taskId, 'dispatch.json');
    const receipt = this._readJson(TASKS_DIR, taskId, 'receipt.json');

    return {
      id: taskId,
      title: status.title || taskId,
      description: status.description || '',
      status: status.status || 'pending',
      taskType: status.taskType || 'analysis',
      createdAt: status.createdAt || null,
      updatedAt: status.updatedAt || null,
      archivedAt: status.archivedAt || null,
      context: status.context || '',
      hasDispatch: !!dispatch,
      hasReceipt: !!receipt,
      dispatchKind: dispatch?.kind || null,
      dispatchSummary: dispatch
        ? dispatch.title || (dispatch.prompt ? dispatch.prompt.substring(0, 120) : null)
        : null,
      receiptSummary: receipt
        ? receipt.conclusion || receipt.summary || null
        : null,
    };
  }

  /**
   * Create a new task.
   * @param {object} params
   * @param {string} [params.title]
   * @param {string} [params.description]
   * @param {string} [params.taskType]
   * @param {string} [params.context]
   * @returns {object} Created task
   */
  createTask(params = {}) {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const safeTitle = String(params.title || '未命名任务')
      .trim()
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, '_')
      .slice(0, 64);
    let id = `${date}_${safeTitle}`;
    if (fs.existsSync(this.resolvePath(TASKS_DIR, id))) {
      id = `${id}_${crypto.randomUUID().slice(0, 8)}`;
    }
    const now = new Date().toISOString();
    const tasksDir = this.resolvePath(TASKS_DIR, id);
    fs.mkdirSync(tasksDir, { recursive: true });

    const status = {
      title: params.title || '未命名任务',
      description: params.description || '',
      taskType: params.taskType || 'analysis',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      context: params.context || '',
    };

    this._writeJson(status, TASKS_DIR, id, 'status.json');

    for (const dir of ['inbox', 'raw', 'working', 'notes', 'outputs', 'validation']) {
      fs.mkdirSync(this.resolvePath(TASKS_DIR, id, dir), { recursive: true });
    }
    const starterDocs = {
      '分析请求.md': `# 分析请求\n\n## 要回答的问题\n\n## 报告接收方\n\n## 时间范围\n`,
      '来源清单.md': '# 来源清单\n\n| 文件 | 来源 | 截止时间 | 可信级别 |\n|---|---|---|---|\n',
      '口径映射.md': '# 口径映射\n\n| 指标或实体 | 当前口径 | 权威来源 | 待确认 |\n|---|---|---|---|\n',
      '验证清单.md': '# 验证清单\n\n- [ ] 关键结论有来源\n- [ ] 数据截止时间已标注\n- [ ] 口径冲突已披露\n',
    };
    for (const [name, content] of Object.entries(starterDocs)) {
      fs.writeFileSync(this.resolvePath(TASKS_DIR, id, name), content, 'utf-8');
    }

    return { id, ...status };
  }

  /**
   * Update task fields (whitelist-controlled).
   * @param {string} taskId
   * @param {object} updates
   * @returns {object} Updated task
   */
  updateTask(taskId, updates) {
    const status = this._readJson(TASKS_DIR, taskId, 'status.json');
    if (!status) throw new Error(`Task not found: ${taskId}`);

    const allowed = ['title', 'description', 'status', 'taskType', 'context'];
    for (const key of Object.keys(updates || {})) {
      if (allowed.includes(key)) {
        status[key] = updates[key];
      }
    }
    status.updatedAt = new Date().toISOString();

    this._writeJson(status, TASKS_DIR, taskId, 'status.json');
    return { id: taskId, ...status };
  }

  /**
   * Archive a task (soft-delete by status).
   * @param {string} taskId
   * @returns {object} Archived task
   */
  archiveTask(taskId) {
    const status = this._readJson(TASKS_DIR, taskId, 'status.json');
    if (!status) throw new Error(`Task not found: ${taskId}`);

    const now = new Date().toISOString();
    status.status = 'archived';
    status.updatedAt = now;
    status.archivedAt = now;

    this._writeJson(status, TASKS_DIR, taskId, 'status.json');
    return { id: taskId, ...status };
  }

  // ── Dispatch & Receipt ──────────────────────────────────────────

  /**
   * Read structured AI execution receipt for a task.
   * @param {string} taskId
   * @returns {object|null}
   */
  readReceipt(taskId) {
    return this._readJson(TASKS_DIR, taskId, 'receipt.json');
  }

  /**
   * Write AI dispatch note for a task and move status to 'running'.
   * @param {string} taskId
   * @param {object} dispatchData
   * @returns {object}
   */
  writeDispatch(taskId, dispatchData) {
    const taskDir = this.resolvePath(TASKS_DIR, taskId);
    if (!fs.existsSync(taskDir)) throw new Error(`Task not found: ${taskId}`);

    this._writeJson(
      { ...dispatchData, createdAt: new Date().toISOString() },
      TASKS_DIR,
      taskId,
      'dispatch.json',
    );

    const status = this._readJson(TASKS_DIR, taskId, 'status.json');
    if (status && status.status !== 'archived') {
      status.status = 'running';
      status.updatedAt = new Date().toISOString();
      this._writeJson(status, TASKS_DIR, taskId, 'status.json');
    }

    return { ok: true };
  }

  /**
   * Write a structured receipt (AI execution result) for a task.
   * @param {string} taskId
   * @param {object} receiptData
   * @returns {object}
   */
  writeReceipt(taskId, receiptData) {
    const taskDir = this.resolvePath(TASKS_DIR, taskId);
    if (!fs.existsSync(taskDir)) throw new Error(`Task not found: ${taskId}`);

    const existing = this._readJson(TASKS_DIR, taskId, 'receipt.json');

    this._writeJson(
      { ...receiptData, updatedAt: new Date().toISOString() },
      TASKS_DIR,
      taskId,
      'receipt.json',
    );

    // Update status to 'review' since AI execution completed
    const status = this._readJson(TASKS_DIR, taskId, 'status.json');
    if (status && status.status !== 'archived') {
      status.status = 'review';
      status.updatedAt = new Date().toISOString();
      this._writeJson(status, TASKS_DIR, taskId, 'status.json');
    }

    return { ok: true };
  }

  // ── File operations ─────────────────────────────────────────────

  /**
   * Read a file from the workspace.
   * @param {string} relativePath
   * @returns {object|null} { content, path, size, modifiedAt } or null
   */
  readFile(relativePath) {
    const resolved = this.resolvePath(relativePath);
    if (!fs.existsSync(resolved)) return null;

    const content = fs.readFileSync(resolved, 'utf-8');
    const stat = fs.statSync(resolved);
    return { content, path: relativePath, size: stat.size, modifiedAt: stat.mtime.toISOString() };
  }

  /**
   * Save content to a file within the workspace.
   * @param {string} relativePath
   * @param {string} content
   * @returns {object} { path, size, ok }
   */
  saveFile(relativePath, content) {
    if (typeof content !== 'string') throw new Error('content must be a string');

    const resolved = this.resolvePath(relativePath);
    const dir = path.dirname(resolved);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(resolved, content, 'utf-8');

    const stat = fs.statSync(resolved);
    return { path: relativePath, size: stat.size, ok: true };
  }

  /**
   * Copy an external file into the workspace.
   * @param {string} sourcePath - Absolute path of source file
   * @param {string} relativeDestPath - Relative destination within workspace
   * @returns {object} { path, size, ok }
   */
  copyFile(sourcePath, relativeDestPath) {
    const src = path.resolve(sourcePath);
    if (!fs.existsSync(src)) throw new Error(`Source file not found: ${sourcePath}`);

    const dest = this.resolvePath(relativeDestPath);
    const dir = path.dirname(dest);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(src, dest);

    const stat = fs.statSync(dest);
    return { path: relativeDestPath, size: stat.size, ok: true };
  }

  /**
   * List directory contents.
   * @param {string} relativePath - Defaults to workspace root
   * @returns {object[]}
   */
  listDirectory(relativePath) {
    const resolved = this.resolvePath(relativePath || '.');
    if (!fs.existsSync(resolved)) return [];

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith('.'))
      .map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        isFile: e.isFile(),
        size: e.isFile() ? fs.statSync(path.join(resolved, e.name)).size : 0,
      }));
  }

  // ── Semantic read ───────────────────────────────────────────────

  /**
   * Read items from semantic categories (权威语义层, 评测与验证).
   * @param {string} [category] - Optional filter by dir name
   * @returns {object}
   */
  semanticRead(category) {
    const validCategories = ['02-权威语义层', '05-评测与验证'];
    const dirs = category
      ? [category]
      : validCategories;

    const result = {};
    for (const dir of dirs) {
      const dirPath = this.resolvePath(dir);
      if (!fs.existsSync(dirPath)) {
        result[dir] = [];
        continue;
      }

      const files = fs.readdirSync(dirPath, { withFileTypes: true });
      result[dir] = files
        .filter((f) => f.isFile() && (f.name.endsWith('.json') || f.name.endsWith('.md')))
        .map((f) => {
          const stat = fs.statSync(path.join(dirPath, f.name));
          return { name: f.name, size: stat.size, modifiedAt: stat.mtime.toISOString() };
        });
    }

    return result;
  }

  // ── External source management ────────────────────────────────────

  /**
   * Get all external source references for a task.
   * @param {string} taskId
   * @returns {object[]}
   */
  getExternalSources(taskId) {
    this._requireTask(taskId);
    const data = this._readJson(TASKS_DIR, taskId, EXTERNAL_SOURCES_FILE);
    return data && Array.isArray(data.sources) ? data.sources : [];
  }

  /**
   * Return the persisted recursive file inventory for a linked source.
   * @param {string} taskId
   * @param {string} sourcePath
   * @returns {object|null}
   */
  getExternalSourceInventory(taskId, sourcePath) {
    this._requireTask(taskId);
    const resolved = path.resolve(sourcePath);
    const data = this._readJson(TASKS_DIR, taskId, EXTERNAL_INVENTORY_FILE);
    const inventories = data && Array.isArray(data.sources) ? data.sources : [];
    return inventories.find((item) => item.path === resolved) || null;
  }

  _requireTask(taskId) {
    if (!this.getTask(taskId)) throw new Error(`Task not found: ${taskId}`);
  }

  _getExternalInventories(taskId) {
    const data = this._readJson(TASKS_DIR, taskId, EXTERNAL_INVENTORY_FILE);
    return data && Array.isArray(data.sources) ? data.sources : [];
  }

  _writeExternalState(taskId, sources, inventories) {
    this._writeJson({ sources, version: '1.1' }, TASKS_DIR, taskId, EXTERNAL_SOURCES_FILE);
    this._writeJson({ sources: inventories, version: '1.1' }, TASKS_DIR, taskId, EXTERNAL_INVENTORY_FILE);
  }

  /**
   * Associate (link) an external directory to a task. Scans it recursively
   * but does NOT copy or modify any files in the external directory.
   * @param {string} taskId
   * @param {string} sourcePath - Absolute path to external directory
   * @param {string} [label] - Optional display label
   * @returns {object} The linked source record
   */
  linkExternalSource(taskId, sourcePath, label) {
    this._requireTask(taskId);
    const resolved = path.resolve(sourcePath);
    if (!fs.existsSync(resolved)) throw new Error(`目录不存在: ${sourcePath}`);
    if (!fs.statSync(resolved).isDirectory()) throw new Error(`路径不是目录: ${sourcePath}`);

    // Prevent linking workspace itself or subdirectories
    const normalized = path.normalize(resolved);
    const wsNormalized = path.normalize(this.workspacePath);
    if (normalized === wsNormalized || normalized.startsWith(wsNormalized + path.sep)) {
      throw new Error('不能关联工作区内部的目录');
    }

    const sources = this.getExternalSources(taskId);
    const inventories = this._getExternalInventories(taskId);
    if (sources.some((s) => s.path === resolved)) {
      throw new Error('该目录已关联');
    }

    const scanResult = this._scanExternalDirectory(resolved);
    const source = {
      path: resolved,
      label: label || path.basename(resolved),
      lastScannedAt: new Date().toISOString(),
      totalFiles: scanResult.totalFiles,
      totalSizeKb: scanResult.totalSizeKb,
      topLevelItems: scanResult.topLevelItems,
      anomalies: scanResult.anomalies,
      scanStatus: scanResult.anomalies.length > 0 ? 'has_anomalies' : 'ok',
    };

    sources.push(source);
    inventories.push({
      path: resolved,
      label: source.label,
      lastScannedAt: source.lastScannedAt,
      files: scanResult.files,
      anomalies: scanResult.anomalies,
    });
    this._writeExternalState(taskId, sources, inventories);
    return source;
  }

  /**
   * Re-scan an associated external directory and update its metadata.
   * @param {string} taskId
   * @param {string} sourcePath - Absolute path of the linked directory
   * @returns {object} Updated source record
   */
  refreshExternalSource(taskId, sourcePath) {
    this._requireTask(taskId);
    const resolved = path.resolve(sourcePath);
    const sources = this.getExternalSources(taskId);
    const inventories = this._getExternalInventories(taskId);
    const index = sources.findIndex((s) => s.path === resolved);
    if (index === -1) throw new Error('未关联的目录');

    const scanResult = this._scanExternalDirectory(resolved);

    sources[index] = {
      ...sources[index],
      lastScannedAt: new Date().toISOString(),
      totalFiles: scanResult.totalFiles,
      totalSizeKb: scanResult.totalSizeKb,
      topLevelItems: scanResult.topLevelItems,
      anomalies: scanResult.anomalies,
      scanStatus: scanResult.anomalies.length > 0 ? 'has_anomalies' : 'ok',
    };

    const inventory = {
      path: resolved,
      label: sources[index].label,
      lastScannedAt: sources[index].lastScannedAt,
      files: scanResult.files,
      anomalies: scanResult.anomalies,
    };
    const inventoryIndex = inventories.findIndex((item) => item.path === resolved);
    if (inventoryIndex === -1) inventories.push(inventory);
    else inventories[inventoryIndex] = inventory;
    this._writeExternalState(taskId, sources, inventories);
    return sources[index];
  }

  /**
   * Remove an external directory reference. Does NOT delete the directory.
   * @param {string} taskId
   * @param {string} sourcePath - Absolute path of the linked directory
   * @returns {object} { ok, removed }
   */
  unlinkExternalSource(taskId, sourcePath) {
    this._requireTask(taskId);
    const resolved = path.resolve(sourcePath);
    const sources = this.getExternalSources(taskId);
    const filtered = sources.filter((s) => s.path !== resolved);
    if (filtered.length === sources.length) throw new Error('未关联的目录');

    const inventories = this._getExternalInventories(taskId).filter((item) => item.path !== resolved);
    this._writeExternalState(taskId, filtered, inventories);
    return { ok: true, removed: true };
  }

  /**
   * Validate a renderer request before revealing a linked external directory.
   * @param {string} taskId
   * @param {string} sourcePath
   * @returns {string}
   */
  resolveLinkedExternalSource(taskId, sourcePath) {
    this._requireTask(taskId);
    const resolved = path.resolve(sourcePath);
    if (!this.getExternalSources(taskId).some((source) => source.path === resolved)) {
      throw new Error('未关联的目录');
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new Error('关联目录当前不可用');
    }
    return resolved;
  }

  /**
   * Recursively scan an external directory.
   * Records anomalies per-file but does not abort the entire scan.
   * @param {string} dirPath - Absolute path to scan
   * @returns {object} { totalFiles, totalSizeKb, topLevelItems, anomalies, files }
   * @private
   */
  _scanExternalDirectory(dirPath) {
    const resolved = path.resolve(dirPath);
    const topLevelItems = [];
    const anomalies = [];
    const files = [];

    // Read top-level entries
    let rootEntries;
    try {
      rootEntries = fs.readdirSync(resolved, { withFileTypes: true });
    } catch (e) {
      // Root directory itself is unreadable
      return {
        totalFiles: 0,
        totalSizeKb: 0,
        topLevelItems: [],
        anomalies: [`根目录: ${e.message}`],
        files: [],
      };
    }

    for (const entry of rootEntries) {
      if (entry.name.startsWith('.')) continue;
      topLevelItems.push({ name: entry.name, isDirectory: entry.isDirectory() });
    }

    // Iterative depth-first traversal
    let totalFiles = 0;
    let totalSizeKb = 0;
    const stack = [{ absolute: resolved, relative: '' }];

    while (stack.length > 0) {
      const current = stack.pop();

      let entries;
      try {
        entries = fs.readdirSync(current.absolute, { withFileTypes: true });
      } catch (e) {
        anomalies.push(current.relative || '根目录');
        continue;
      }

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;

        const relativePath = current.relative
          ? `${current.relative}/${entry.name}`
          : entry.name;

        if (entry.isDirectory()) {
          stack.push({ absolute: path.join(current.absolute, entry.name), relative: relativePath });
        } else if (entry.isFile()) {
          totalFiles++;
          try {
            const stat = fs.statSync(path.join(current.absolute, entry.name));
            totalSizeKb += stat.size / 1024;
            files.push({
              relativePath,
              size: stat.size,
              modifiedAt: stat.mtime.toISOString(),
            });
          } catch (e) {
            anomalies.push(`${relativePath}: ${e.message}`);
          }
        }
      }
    }

    totalSizeKb = Math.round(totalSizeKb * 10) / 10;
    files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'zh-CN'));
    return { totalFiles, totalSizeKb, topLevelItems, anomalies, files };
  }

  // ── Prompt generation ───────────────────────────────────────────

  /**
   * Generate an AI dispatch prompt for a task.
   * @param {string} taskId
   * @returns {object}
   */
  generatePrompt(taskId, kind = 'analysis', draft = {}) {
    const task = this.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const supportedKinds = new Set(['analysis', 'reanalysis', 'evaluation', 'html', 'skill']);
    if (!supportedKinds.has(kind)) throw new Error(`Unsupported prompt kind: ${kind}`);

    const taskRoot = this.resolvePath(TASKS_DIR, taskId);
    const rawPath = path.join(taskRoot, 'raw');
    const workingPath = path.join(taskRoot, 'working');
    const notesPath = path.join(taskRoot, 'notes');
    const outputsPath = path.join(taskRoot, 'outputs');
    const validationPath = path.join(taskRoot, 'validation');
    const receiptPath = path.join(taskRoot, 'receipt.json');
    const safeTitle = (task.title || task.id).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
    const kindConfig = {
      analysis: { label: '首次分析', output: path.join(outputsPath, `${safeTitle}_首次分析.md`) },
      reanalysis: { label: '重分析', output: path.join(outputsPath, `${safeTitle}_重分析.md`) },
      evaluation: { label: 'AI评测', output: path.join(validationPath, 'AI评测.md') },
      html: { label: 'HTML报告', output: path.join(outputsPath, `${safeTitle}.html`) },
      skill: { label: 'Skill候选沉淀', output: path.join(notesPath, `${safeTitle}_Skill候选.md`) },
    }[kind];

    const fourPiecePaths = ['分析请求.md', '来源清单.md', '口径映射.md', '验证清单.md']
      .map((name) => path.join(taskRoot, name));
    const semanticPaths = ['指标口径表.md', '实体字典.md', '数据源登记表.md']
      .map((name) => path.join(this.workspacePath, '02-权威语义层', name));
    const receiptExample = JSON.stringify({
      kind,
      status: 'completed',
      summary: '用一段话说明本次执行完成了什么以及主要结论',
      outputFiles: [kindConfig.output],
      dataSources: ['填写实际读取的绝对路径或来源文件'],
      confidence: 'high|medium|low',
      unresolved: ['仍需人工确认的问题；没有则为空数组'],
      completedAt: 'ISO-8601时间',
    }, null, 2);
    const writableLines = kind === 'evaluation'
      ? [`- 临时检查文件: ${workingPath}`, `- 评测结果: ${validationPath}`]
      : kind === 'html'
        ? [`- 临时转换文件: ${workingPath}`, `- HTML正式输出: ${outputsPath}`, `- 转换待确认项: ${validationPath}`, `- 最新执行回执: ${receiptPath}`]
        : kind === 'skill'
          ? [`- 临时提炼文件: ${workingPath}`, `- Skill候选与证据: ${notesPath}`, `- 待确认项: ${validationPath}`, `- 最新执行回执: ${receiptPath}`]
          : [
              `- 中间文件: ${workingPath}`,
              `- 证据与过程记录: ${notesPath}`,
              `- 正式输出: ${outputsPath}`,
              `- 验证结果: ${validationPath}`,
              `- 四件套: ${fourPiecePaths.join('；')}`,
              `- 最新执行回执: ${receiptPath}`,
            ];

    const executionSteps = this._buildPromptExecutionSteps({
      kind,
      taskRoot,
      outputsPath,
      validationPath,
      kindConfig,
      fourPiecePaths,
      receiptPath,
      receiptExample,
    });
    const userInstructions = [
      draft?.goal ? `### 分析目标与范围\n${String(draft.goal).trim()}` : '',
      draft?.thinking ? `### 分析思路与创造力引导\n${String(draft.thinking).trim()}` : '',
      draft?.verification ? `### 校验与验证要求\n${String(draft.verification).trim()}` : '',
    ].filter(Boolean);

    const prompt = [
      `# AI原生数据分析工作台｜${kindConfig.label}调度单`,
      ``,
      `## 0. 路径锚点（最高优先级）`,
      `- 当前工作区唯一根目录: ${this.workspacePath}`,
      `- 当前任务唯一根目录: ${taskRoot}`,
      `- 任务ID: ${task.id}`,
      `- 任务标题: ${task.title}`,
      `- 本次执行类型: ${kind}`,
      ``,
      `无论当前终端位于哪里、已有Skill默认指向哪里，均以上述绝对路径为准。`,
      `不得按任务名在磁盘中搜索其他同名目录，不得读取或写入其他工作台中的同名任务。`,
      `如果上述任务根目录不存在，立即停止并报告“任务路径不存在”，不得自行创建替代目录。`,
      ``,
      `## 1. 路径与权限边界`,
      `### 可读取`,
      `- 任务原始资料: ${rawPath}`,
      `- 任务四件套:`,
      ...fourPiecePaths.map((item) => `  - ${item}`),
      `- 权威语义层:`,
      ...semanticPaths.map((item) => `  - ${item}`),
      `- 领域Skills目录: ${path.join(this.workspacePath, '03-领域分析Skills')}`,
      `- 既有输出（重分析、评测、HTML或Skill沉淀时读取）: ${outputsPath}`,
      `- 人工反馈与验证资料: ${validationPath}`,
      ``,
      `### 可写入`,
      ...writableLines,
      ``,
      `禁止修改外部资料目录、工作区正式权威语义层及当前任务之外的任何文件。语义改进只能写成候选建议，等待人工确认。`,
      ...this._buildExternalSourcesPrompt(taskId),
      ``,
      `## 2. 任务基本信息`,
      `- 任务ID: ${task.id}`,
      `- 标题: ${task.title}`,
      `- 类型: ${task.taskType}`,
      `- 描述: ${task.description || '（无描述）'}`,
      `- 上下文: ${task.context || '（无补充上下文）'}`,
      ``,
      ...(userInstructions.length ? ['## 3. 用户在工作台填写的分析指令', ...userInstructions, ''] : []),
      `## ${userInstructions.length ? '4' : '3'}. 执行原则`,
      `- 基于当前已有资料始终产出可用版本，资料缺口只改变结论边界，不阻塞报告`,
      `- 优先读取权威语义层，同时主动发现异常、反例、冲突与新的解释`,
      `- 区分事实、推断和建议；每个关键结论标注来源、截止时间与可信度`,
      `- 对高风险判断进行交叉校验，不确定内容进入验证清单`,
      `- 不因四件套尚未补齐而拒绝分析；先基于现有资料形成报告，再记录缺口`,
      ``,
      `## ${userInstructions.length ? '5' : '4'}. 本次执行步骤与交付`,
      ...executionSteps,
      ``,
      `## ${userInstructions.length ? '6' : '5'}. 完成判定`,
      `只有当要求的输出文件和状态文件实际写入上述绝对路径后，才算完成。`,
      `最终回复必须逐项列出实际写入的绝对路径；不得只在聊天中给出分析结果。`,
    ].join('\n');

    return { id: taskId, prompt, createdAt: new Date().toISOString() };
  }

  _buildPromptExecutionSteps({ kind, taskRoot, outputsPath, validationPath, kindConfig, fourPiecePaths, receiptPath, receiptExample }) {
    if (kind === 'evaluation') {
      const evaluationJsonPath = path.join(validationPath, 'evaluation.json');
      return [
        `1. 读取 ${outputsPath} 中的正式输出，并回查原始资料、来源清单、口径映射和验证清单。`,
        `2. 抽查事实、数字、口径、推理、反证、来源追溯和行动可执行性。`,
        `3. 将完整评测报告写入: ${kindConfig.output}`,
        `4. 将机器可读结果写入: ${evaluationJsonPath}`,
        `5. evaluation.json 至少包含 status、score、checkedAt、checks；score 为 0-100 数字，checks 为数组。`,
        `6. AI评测不得修改原报告，只能提出问题和改进建议。`,
      ];
    }

    if (kind === 'html') {
      return [
        `1. 读取 ${outputsPath} 中最新且内容完整的Markdown报告。`,
        `2. 生成可离线打开、无外部依赖的单文件HTML，写入: ${kindConfig.output}`,
        `3. 不改变原报告结论；发现冲突时写入 ${path.join(validationPath, 'HTML转换待确认.md')}。`,
        `4. 将以下JSON写入 ${receiptPath}，按实际结果替换占位内容：`,
        '```json', receiptExample, '```',
      ];
    }

    if (kind === 'skill') {
      return [
        `1. 读取任务资料、四件套、验证记录和正式输出，提炼可复用但不含业务敏感数据的方法。`,
        `2. 将候选Skill写入: ${kindConfig.output}`,
        `3. 不得直接修改 ${path.join(this.workspacePath, '03-领域分析Skills')} 或任何全局Skill；候选内容必须等待人工确认。`,
        `4. 将以下JSON写入 ${receiptPath}，按实际结果替换占位内容：`,
        '```json', receiptExample, '```',
      ];
    }

    const isReanalysis = kind === 'reanalysis';
    return [
      `1. ${isReanalysis ? `先读取 ${outputsPath} 中既有报告以及 ${validationPath} 中新增反馈，再重新分析。` : '读取任务raw、外部只读来源、四件套、权威语义和相关领域Skill。'}`,
      `2. 将正式报告写入: ${kindConfig.output}`,
      `3. 报告至少包含：执行摘要、事实与来源、关键判断、反证与不确定性、风险、行动建议、待验证项。`,
      `4. 根据实际分析刷新四件套：`,
      ...fourPiecePaths.map((item) => `   - ${item}`),
      `5. 将证据索引或计算说明写入 ${path.join(taskRoot, 'notes')}；临时文件写入 ${path.join(taskRoot, 'working')}。`,
      `6. 将以下JSON写入 ${receiptPath}，按实际结果替换占位内容：`,
      '```json', receiptExample, '```',
      `7. 不要把正式输出复制到工作区根目录的 06-输出物；当前任务的 outputs 是唯一正式输出位置。`,
    ];
  }

  /**
   * Build external sources prompt lines for a task.
   * @param {string} taskId
   * @returns {string[]}
   * @private
   */
  _buildExternalSourcesPrompt(taskId) {
    const sources = this.getExternalSources(taskId);
    if (sources.length === 0) return [];

    const lines = [
      '',
      '## 外部资料目录（只读）',
      '以下外部目录已关联到本任务。AI Agent 须递归读取全部文件，但不得修改或写入任何内容到这些目录。',
    ];
    for (const source of sources) {
      lines.push(`### ${source.label}`);
      lines.push(`- 绝对路径: ${source.path}`);
      lines.push(`- 文件总数: ${source.totalFiles}`);
      lines.push(`- 总大小: ${source.totalSizeKb} KB`);
      lines.push(`- 扫描时间: ${source.lastScannedAt}`);
      lines.push(`- 只读边界: AI Agent 不得修改或写入此目录`);
      lines.push(`- 读取要求: 须递归读取所有文件，保留相对路径`);
      if (source.topLevelItems.length > 0) {
        const dirs = source.topLevelItems.filter((i) => i.isDirectory).map((i) => i.name);
        const files = source.topLevelItems.filter((i) => !i.isDirectory).map((i) => i.name);
        if (dirs.length) lines.push(`- 子目录: ${dirs.join('、')}`);
        if (files.length) lines.push(`- 顶层文件: ${files.join('、')}`);
      }
      if (source.anomalies.length > 0) {
        lines.push(`- 扫描异常（${source.anomalies.length} 项）:`);
        for (const anomaly of source.anomalies) {
          lines.push(`  - ${anomaly}`);
        }
      }
    }
    return lines;
  }

  // ── Static factory / detection ──────────────────────────────────

  /**
   * Find an existing workspace in documents path, or create a new one
   * from the template directory.
   * @param {string} documentsPath - User's Documents directory
   * @param {string} [templatePath] - Path to workspace-template to copy
   * @returns {WorkspaceService}
   */
  static findOrCreateWorkspace(documentsPath, templatePath) {
    if (!documentsPath || typeof documentsPath !== 'string') {
      throw new Error('documentsPath is required');
    }

    const docsResolved = path.resolve(documentsPath);

    // 1. Check for legacy workspace (directories in Documents root)
    const legacyFound = LEGACY_DIRS.some((d) =>
      fs.existsSync(path.join(docsResolved, d)),
    );
    if (legacyFound) {
      return new WorkspaceService(docsResolved);
    }

    // 2. Check for already-initialized named workspace
    const namedPath = path.join(docsResolved, 'AI原生数据分析工作台');
    if (
      fs.existsSync(namedPath) &&
      fs.existsSync(path.join(namedPath, '01-投喂区'))
    ) {
      return new WorkspaceService(namedPath);
    }

    // 3. Create new workspace
    const workspacePath = namedPath;
    fs.mkdirSync(workspacePath, { recursive: true });

    if (templatePath) {
      const resolvedTemplate = path.resolve(templatePath);
      if (fs.existsSync(resolvedTemplate)) {
        fs.cpSync(resolvedTemplate, workspacePath, { recursive: true });
        return new WorkspaceService(workspacePath);
      }
    }

    // Fallback: create structure manually
    for (const dir of LEGACY_DIRS) {
      fs.mkdirSync(path.join(workspacePath, dir), { recursive: true });
    }

    return new WorkspaceService(workspacePath);
  }

  /**
   * Check if a given path has legacy workspace structure
   * (at least one known directory in its children).
   * @param {string} dirPath
   * @returns {boolean}
   */
  static _isLegacyStructure(dirPath) {
    if (!dirPath || !fs.existsSync(dirPath)) return false;
    return LEGACY_DIRS.some((d) => fs.existsSync(path.join(dirPath, d)));
  }

  /**
   * Check if a directory is a valid workspace (has required subdirectories).
   * @param {string} dirPath
   * @returns {boolean}
   */
  static isValidWorkspace(dirPath) {
    if (!dirPath || typeof dirPath !== 'string') return false;
    const resolved = path.resolve(dirPath);
    if (!fs.existsSync(resolved)) return false;
    return (
      fs.existsSync(path.join(resolved, '01-投喂区')) &&
      fs.existsSync(path.join(resolved, '04-分析任务'))
    );
  }

  /**
   * Return the recognized legacy directory names.
   * @returns {string[]}
   */
  static getLegacyDirs() {
    return [...LEGACY_DIRS];
  }

  // ── Internal helpers ────────────────────────────────────────────

  /** @private */
  _exists(...segments) {
    try {
      return fs.existsSync(this.resolvePath(...segments));
    } catch {
      return false;
    }
  }

  /** @private */
  _readJson(...segments) {
    try {
      const p = this.resolvePath(...segments);
      if (!fs.existsSync(p)) return null;
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch {
      return null;
    }
  }

  /** @private */
  _writeJson(data, ...segments) {
    const p = this.resolvePath(...segments);
    const dir = path.dirname(p);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
  }
}

module.exports = { WorkspaceService, LEGACY_DIRS };
