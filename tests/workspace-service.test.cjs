const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { WorkspaceService, LEGACY_DIRS } = require('../electron/workspace-service.cjs');

// ── Helpers ───────────────────────────────────────────────────────

/** Create a temp directory with optional subdirectories */
function createTempDir(createSubdirs = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-test-'));
  for (const sub of createSubdirs) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }
  return dir;
}

/** Remove temp directory recursively */
function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

// ── Constructor ───────────────────────────────────────────────────

describe('WorkspaceService constructor', () => {
  it('throws on missing workspacePath', () => {
    assert.throws(() => new WorkspaceService(), /workspacePath is required/);
    assert.throws(() => new WorkspaceService(null), /workspacePath is required/);
    assert.throws(() => new WorkspaceService(123), /workspacePath is required/);
  });

  it('resolves relative path to absolute', () => {
    const ws = new WorkspaceService('.');
    assert.ok(path.isAbsolute(ws.workspacePath));
  });

  it('stores the resolved workspace path', () => {
    const tmp = createTempDir();
    try {
      const ws = new WorkspaceService(tmp);
      assert.equal(ws.workspacePath, tmp);
    } finally {
      removeDir(tmp);
    }
  });
});

// ── Path validation ───────────────────────────────────────────────

describe('Path validation', () => {
  let tmp, ws;
  before(() => {
    tmp = createTempDir();
    ws = new WorkspaceService(tmp);
  });
  after(() => removeDir(tmp));

  it('allows paths within workspace', () => {
    const r = ws.resolvePath('01-投喂区');
    assert.equal(r, path.join(tmp, '01-投喂区'));
  });

  it('allows nested paths within workspace', () => {
    const r = ws.resolvePath('04-分析任务', 'some-task', 'status.json');
    assert.equal(r, path.join(tmp, '04-分析任务', 'some-task', 'status.json'));
  });

  it('allows dot-slash relative paths', () => {
    const r = ws.resolvePath('./01-投喂区');
    assert.equal(r, path.join(tmp, '01-投喂区'));
  });

  it('blocks parent-directory traversal at root', () => {
    assert.throws(() => ws.resolvePath('..'), /Path traversal blocked/);
  });

  it('blocks deep parent-directory traversal', () => {
    assert.throws(
      () => ws.resolvePath('01-投喂区/../../../etc/passwd'),
      /Path traversal blocked/,
    );
  });

  it('blocks absolute path injection', () => {
    assert.throws(() => ws.resolvePath('/etc/passwd'), /Path traversal blocked/);
  });

  it('blocks symlink-like traversal patterns', () => {
    assert.throws(
      () => ws.resolvePath('04-分析任务/../../etc/shadow'),
      /Path traversal blocked/,
    );
  });

  it('isValidPath returns false for outside paths', () => {
    assert.equal(ws.isValidPath('/tmp'), false);
  });

  it('isValidPath returns true for workspace root', () => {
    assert.equal(ws.isValidPath(tmp), true);
  });
});

// ── Workspace creation ────────────────────────────────────────────

describe('WorkspaceService creation', () => {
  it('findOrCreateWorkspace creates from template', () => {
    const tmp = createTempDir();
    const templateDir = createTempDir(LEGACY_DIRS);
    try {
      const ws = WorkspaceService.findOrCreateWorkspace(tmp, templateDir);
      assert.ok(ws instanceof WorkspaceService);
      assert.ok(fs.existsSync(ws.workspacePath));
      // Verify structure was created
      for (const dir of LEGACY_DIRS) {
        assert.ok(fs.existsSync(path.join(ws.workspacePath, dir)), `Missing: ${dir}`);
      }
    } finally {
      removeDir(tmp);
      removeDir(templateDir);
    }
  });

  it('findOrCreateWorkspace creates manually when no template', () => {
    const tmp = createTempDir();
    try {
      const ws = WorkspaceService.findOrCreateWorkspace(tmp);
      assert.ok(ws instanceof WorkspaceService);
      for (const dir of LEGACY_DIRS) {
        assert.ok(fs.existsSync(path.join(ws.workspacePath, dir)), `Missing: ${dir}`);
      }
    } finally {
      removeDir(tmp);
    }
  });

  it('findOrCreateWorkspace detects legacy structure', () => {
    const tmp = createTempDir(['01-投喂区', '04-分析任务']);
    try {
      const ws = WorkspaceService.findOrCreateWorkspace(tmp);
      assert.ok(ws instanceof WorkspaceService);
      // Legacy detection: workspace root should be the same as tmp (has legacy dirs)
      assert.equal(ws.workspacePath, tmp);
    } finally {
      removeDir(tmp);
    }
  });

  it('findOrCreateWorkspace detects named workspace', () => {
    const tmp = createTempDir();
    const namedDir = path.join(tmp, 'AI原生数据分析工作台');
    fs.mkdirSync(path.join(namedDir, '01-投喂区'), { recursive: true });
    fs.mkdirSync(path.join(namedDir, '04-分析任务'), { recursive: true });
    try {
      const ws = WorkspaceService.findOrCreateWorkspace(tmp);
      assert.equal(ws.workspacePath, namedDir);
    } finally {
      removeDir(tmp);
    }
  });

  it('findOrCreateWorkspace throws on missing documentsPath', () => {
    assert.throws(() => WorkspaceService.findOrCreateWorkspace(), /documentsPath is required/);
    assert.throws(() => WorkspaceService.findOrCreateWorkspace(null), /documentsPath is required/);
  });
});

// ── Legacy detection ──────────────────────────────────────────────

describe('Legacy detection', () => {
  it('isValidWorkspace returns true for complete workspace', () => {
    const tmp = createTempDir(['01-投喂区', '04-分析任务']);
    try {
      assert.ok(WorkspaceService.isValidWorkspace(tmp));
    } finally {
      removeDir(tmp);
    }
  });

  it('isValidWorkspace returns false for incomplete directory', () => {
    const tmp = createTempDir(['01-投喂区']); // missing 04-分析任务
    try {
      assert.equal(WorkspaceService.isValidWorkspace(tmp), false);
    } finally {
      removeDir(tmp);
    }
  });

  it('isValidWorkspace returns false for non-existent path', () => {
    assert.equal(WorkspaceService.isValidWorkspace('/nonexistent/path'), false);
  });

  it('isValidWorkspace returns false for invalid input', () => {
    assert.equal(WorkspaceService.isValidWorkspace(null), false);
    assert.equal(WorkspaceService.isValidWorkspace(undefined), false);
  });

  it('getLegacyDirs returns the canonical list', () => {
    const dirs = WorkspaceService.getLegacyDirs();
    assert.ok(Array.isArray(dirs));
    assert.ok(dirs.includes('01-投喂区'));
    assert.ok(dirs.includes('04-分析任务'));
    assert.ok(dirs.includes('06-输出物'));
  });
});

// ── Task CRUD ─────────────────────────────────────────────────────

describe('Task CRUD', () => {
  let tmp, ws;
  before(() => {
    tmp = createTempDir(LEGACY_DIRS);
    ws = new WorkspaceService(tmp);
  });
  after(() => removeDir(tmp));

  it('listTasks returns empty array initially', () => {
    const tasks = ws.listTasks();
    assert.ok(Array.isArray(tasks));
    assert.equal(tasks.length, 0);
  });

  it('createTask creates a task with correct structure', () => {
    const task = ws.createTask({
      title: '测试任务',
      description: '用于单元测试',
      taskType: 'analysis',
    });

    assert.ok(task.id);
    assert.equal(task.title, '测试任务');
    assert.equal(task.description, '用于单元测试');
    assert.equal(task.taskType, 'analysis');
    assert.equal(task.status, 'pending');
    assert.ok(task.createdAt);
    assert.ok(task.updatedAt);

    // Verify files on disk
    const taskDir = path.join(tmp, '04-分析任务', task.id);
    assert.ok(fs.existsSync(taskDir));
    assert.ok(fs.existsSync(path.join(taskDir, 'status.json')));

    // Verify JSON content
    const status = JSON.parse(fs.readFileSync(path.join(taskDir, 'status.json'), 'utf-8'));
    assert.equal(status.title, '测试任务');
    assert.equal(status.status, 'pending');
  });

  it('listTasks returns created task', () => {
    const tasks = ws.listTasks();
    assert.ok(tasks.length >= 1);
    const task = tasks.find((t) => t.title === '测试任务');
    assert.ok(task);
    assert.equal(task.status, 'pending');
  });

  it('getTask returns full task detail', () => {
    // Create a task first
    const created = ws.createTask({ title: '详细任务' });
    const task = ws.getTask(created.id);

    assert.ok(task);
    assert.equal(task.id, created.id);
    assert.equal(task.title, '详细任务');
    assert.equal(task.status, 'pending');
    assert.equal(task.hasDispatch, false);
    assert.equal(task.hasReceipt, false);
  });

  it('getTask returns null for non-existent task', () => {
    assert.equal(ws.getTask('nonexistent-id'), null);
  });

  it('getTask returns null for invalid task ID', () => {
    assert.equal(ws.getTask(null), null);
    assert.equal(ws.getTask(''), null);
  });

  it('listTasks filters by status', () => {
    const pending = ws.listTasks({ status: 'pending' });
    const archived = ws.listTasks({ status: 'archived' });

    assert.ok(pending.length > 0);
    assert.equal(archived.length, 0);
  });

  it('updateTask updates allowed fields', () => {
    const created = ws.createTask({ title: '更新测试' });

    const updated = ws.updateTask(created.id, {
      title: '已更新的任务',
      description: '新描述',
      status: 'running',
    });

    assert.equal(updated.title, '已更新的任务');
    assert.equal(updated.description, '新描述');
    assert.equal(updated.status, 'running');

    // Verify on disk
    const status = JSON.parse(
      fs.readFileSync(path.join(tmp, '04-分析任务', created.id, 'status.json'), 'utf-8'),
    );
    assert.equal(status.title, '已更新的任务');
  });

  it('updateTask rejects non-allowed fields', () => {
    const created = ws.createTask({ title: '字段过滤测试' });

    const updated = ws.updateTask(created.id, {
      title: '允许的标题',
      secret: 'should-not-be-saved',
    });

    assert.equal(updated.title, '允许的标题');
    // secret should not be in the returned object
    assert.equal(updated.secret, undefined);
  });

  it('archiveTask marks task as archived', () => {
    const created = ws.createTask({ title: '归档测试' });

    const archived = ws.archiveTask(created.id);
    assert.equal(archived.status, 'archived');
    assert.ok(archived.archivedAt);

    // Archived task should appear in unfiltered list
    const tasks = ws.listTasks();
    const found = tasks.find((t) => t.id === created.id);
    assert.ok(found);
    assert.equal(found.status, 'archived');

    // Archived task should NOT appear in pending filter
    const pending = ws.listTasks({ status: 'pending' });
    assert.equal(pending.find((t) => t.id === created.id), undefined);
  });

  it('updateTask throws on non-existent task', () => {
    assert.throws(() => ws.updateTask('no-such-task', { title: 'x' }), /Task not found/);
  });

  it('archiveTask throws on non-existent task', () => {
    assert.throws(() => ws.archiveTask('no-such-task'), /Task not found/);
  });
});

// ── File operations ───────────────────────────────────────────────

describe('File operations', () => {
  let tmp, ws;
  before(() => {
    tmp = createTempDir(LEGACY_DIRS);
    ws = new WorkspaceService(tmp);
  });
  after(() => removeDir(tmp));

  it('saveFile writes content to workspace', () => {
    const result = ws.saveFile('01-投喂区/test.txt', 'hello world');
    assert.ok(result.ok);
    assert.equal(result.path, '01-投喂区/test.txt');

    const content = fs.readFileSync(path.join(tmp, '01-投喂区', 'test.txt'), 'utf-8');
    assert.equal(content, 'hello world');
  });

  it('readFile reads file from workspace', () => {
    const result = ws.readFile('01-投喂区/test.txt');
    assert.ok(result);
    assert.equal(result.content, 'hello world');
    assert.ok(result.size > 0);
    assert.ok(result.modifiedAt);
  });

  it('readFile returns null for missing file', () => {
    assert.equal(ws.readFile('01-投喂区/nonexistent.txt'), null);
  });

  it('readFile blocks traversal attempts', () => {
    assert.throws(() => ws.readFile('../../../etc/passwd'), /Path traversal blocked/);
  });

  it('saveFile blocks traversal attempts', () => {
    assert.throws(
      () => ws.saveFile('../../outside.txt', 'content'),
      /Path traversal blocked/,
    );
  });

  it('copyFile copies external file into workspace', () => {
    const externalFile = path.join(tmp, 'external-source.txt');
    fs.writeFileSync(externalFile, 'from outside', 'utf-8');

    const result = ws.copyFile(externalFile, '01-投喂区/copied.txt');
    assert.ok(result.ok);
    assert.equal(result.path, '01-投喂区/copied.txt');

    const content = fs.readFileSync(path.join(tmp, '01-投喂区', 'copied.txt'), 'utf-8');
    assert.equal(content, 'from outside');
  });

  it('copyFile throws on missing source', () => {
    assert.throws(() => ws.copyFile('/nonexistent/path', '01-投喂区/x.txt'), /not found/);
  });

  it('listDirectory returns directory contents', () => {
    const items = ws.listDirectory('01-投喂区');
    assert.ok(Array.isArray(items));
    // Should find files we created
    const testFile = items.find((i) => i.name === 'test.txt');
    assert.ok(testFile);
    assert.equal(testFile.isFile, true);
    assert.equal(testFile.isDirectory, false);
  });

  it('listDirectory returns empty array for missing dir', () => {
    const items = ws.listDirectory('nonexistent');
    assert.ok(Array.isArray(items));
    assert.equal(items.length, 0);
  });

  it('saveFile throws on non-string content', () => {
    assert.throws(() => ws.saveFile('test.json', 123), /content must be a string/);
  });
});

// ── Dispatch & Receipt ────────────────────────────────────────────

describe('Dispatch and Receipt', () => {
  let tmp, ws, taskId;
  before(() => {
    tmp = createTempDir(LEGACY_DIRS);
    ws = new WorkspaceService(tmp);
    const task = ws.createTask({ title: 'AI分析任务' });
    taskId = task.id;
  });
  after(() => removeDir(tmp));

  it('writeDispatch writes dispatch.json and sets status to running', () => {
    const result = ws.writeDispatch(taskId, {
      prompt: '分析这份数据',
      model: 'claude-opus-4',
    });
    assert.ok(result.ok);

    // Verify dispatch.json on disk
    const dispatchPath = path.join(tmp, '04-分析任务', taskId, 'dispatch.json');
    assert.ok(fs.existsSync(dispatchPath));
    const dispatch = JSON.parse(fs.readFileSync(dispatchPath, 'utf-8'));
    assert.equal(dispatch.prompt, '分析这份数据');
    assert.equal(dispatch.model, 'claude-opus-4');
    assert.ok(dispatch.createdAt);

    // Verify status changed to running
    const status = JSON.parse(
      fs.readFileSync(path.join(tmp, '04-分析任务', taskId, 'status.json'), 'utf-8'),
    );
    assert.equal(status.status, 'running');
  });

  it('writeReceipt writes receipt.json and sets status to review', () => {
    const result = ws.writeReceipt(taskId, {
      conclusion: '数据正常',
      summary: '分析完成',
      confidence: 0.85,
    });
    assert.ok(result.ok);

    const receiptPath = path.join(tmp, '04-分析任务', taskId, 'receipt.json');
    assert.ok(fs.existsSync(receiptPath));
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf-8'));
    assert.equal(receipt.conclusion, '数据正常');
    assert.ok(receipt.updatedAt);

    // Verify status changed to review
    const status = JSON.parse(
      fs.readFileSync(path.join(tmp, '04-分析任务', taskId, 'status.json'), 'utf-8'),
    );
    assert.equal(status.status, 'review');
  });

  it('writeDispatch throws on non-existent task', () => {
    assert.throws(
      () => ws.writeDispatch('bad-id', { prompt: 'test' }),
      /Task not found/,
    );
  });

  it('writeReceipt throws on non-existent task', () => {
    assert.throws(
      () => ws.writeReceipt('bad-id', { conclusion: 'test' }),
      /Task not found/,
    );
  });

  it('readReceipt returns the receipt data', () => {
    const receipt = ws.readReceipt(taskId);
    assert.ok(receipt);
    assert.equal(receipt.conclusion, '数据正常');
  });

  it('readReceipt returns null for task without receipt', () => {
    const newTask = ws.createTask({ title: '无回执' });
    assert.equal(ws.readReceipt(newTask.id), null);
  });

  it('getTask reports hasDispatch and hasReceipt correctly', () => {
    const task = ws.getTask(taskId);
    assert.ok(task.hasDispatch);
    assert.ok(task.hasReceipt);
  });
});

// ── Semantic read ─────────────────────────────────────────────────

describe('Semantic read', () => {
  let tmp, ws;
  before(() => {
    tmp = createTempDir(LEGACY_DIRS);
    ws = new WorkspaceService(tmp);

    // Put some semantic files
    fs.writeFileSync(path.join(tmp, '02-权威语义层', 'rule-001.json'), '{}', 'utf-8');
    fs.writeFileSync(path.join(tmp, '02-权威语义层', 'note.md'), '# note', 'utf-8');
    fs.writeFileSync(path.join(tmp, '05-评测与验证', 'check.json'), '{}', 'utf-8');
    // Non-semantic file that should be ignored
    fs.writeFileSync(path.join(tmp, '01-投喂区', 'data.csv'), 'a,b,c', 'utf-8');
  });
  after(() => removeDir(tmp));

  it('semanticRead returns all semantic categories', () => {
    const result = ws.semanticRead();
    assert.ok(result['02-权威语义层']);
    assert.ok(result['05-评测与验证']);
  });

  it('semanticRead returns only .json and .md files', () => {
    const result = ws.semanticRead();
    const items = result['02-权威语义层'];
    assert.ok(items.length >= 2); // rule-001.json and note.md
  });

  it('semanticRead filters by category', () => {
    const result = ws.semanticRead('02-权威语义层');
    assert.ok(result['02-权威语义层']);
    assert.equal(result['05-评测与验证'], undefined);
  });

  it('semanticRead includes size and modifiedAt', () => {
    const result = ws.semanticRead('02-权威语义层');
    const item = result['02-权威语义层'].find((i) => i.name === 'rule-001.json');
    assert.ok(item);
    assert.equal(typeof item.size, 'number');
    assert.ok(item.modifiedAt);
  });
});

// ── Prompt generation ─────────────────────────────────────────────

describe('Prompt generation', () => {
  let tmp, ws, taskId;
  before(() => {
    tmp = createTempDir(LEGACY_DIRS);
    ws = new WorkspaceService(tmp);
    const task = ws.createTask({
      title: 'Prompt测试',
      description: '用于测试prompt生成',
      taskType: 'analysis',
      context: '用户说需要分析销售数据',
    });
    taskId = task.id;
  });
  after(() => removeDir(tmp));

  it('generatePrompt returns structured prompt', () => {
    const result = ws.generatePrompt(taskId);
    assert.ok(result.id);
    assert.equal(result.id, taskId);
    assert.ok(result.prompt);
    assert.ok(result.prompt.includes('Prompt测试'));
    assert.ok(result.prompt.includes('用于测试prompt生成'));
    assert.ok(result.prompt.includes('用户说需要分析销售数据'));
    assert.ok(result.createdAt);
  });

  it('generatePrompt throws on non-existent task', () => {
    assert.throws(() => ws.generatePrompt('bad-id'), /Task not found/);
  });
});

// ── Workspace info ────────────────────────────────────────────────

describe('Workspace info', () => {
  let tmp, ws;
  before(() => {
    tmp = createTempDir(LEGACY_DIRS);
    ws = new WorkspaceService(tmp);
  });
  after(() => removeDir(tmp));

  it('getInfo returns serializable structure', () => {
    const info = ws.getInfo();
    assert.ok(info.workspacePath);
    assert.equal(typeof info.isLegacy, 'boolean');
    assert.ok(info.structure);

    // Check all legacy dirs are present
    for (const dir of LEGACY_DIRS) {
      assert.ok(dir in info.structure, `Missing info for: ${dir}`);
    }
  });

  it('getInfo includes file details when requested', () => {
    fs.writeFileSync(path.join(tmp, '01-投喂区', 'data.csv'), 'x,y', 'utf-8');
    const info = ws.getInfo({ includeFileDetails: true });
    const feedingItems = info.structure['01-投喂区'].items;
    const csv = feedingItems.find((i) => i.name === 'data.csv');
    assert.ok(csv);
    assert.equal(csv.isFile, true);
  });
});

// ── Serializable returns ──────────────────────────────────────────

describe('Serializable returns', () => {
  let tmp, ws;
  before(() => {
    tmp = createTempDir(LEGACY_DIRS);
    ws = new WorkspaceService(tmp);
  });
  after(() => removeDir(tmp));

  it('listTasks returns plain objects', () => {
    ws.createTask({ title: '可序列化测试' });
    const tasks = ws.listTasks();
    for (const t of tasks) {
      assert.ok(typeof t === 'object' && t !== null);
      assert.ok(!(t instanceof Error));
      // All values should be serializable
      assert.doesNotThrow(() => JSON.stringify(t));
    }
  });

  it('getTask returns plain object', () => {
    const task = ws.listTasks()[0];
    const detail = ws.getTask(task.id);
    assert.doesNotThrow(() => JSON.stringify(detail));
  });

  it('createTask returns plain object', () => {
    const task = ws.createTask({ title: '序列化' });
    assert.doesNotThrow(() => JSON.stringify(task));
  });

  it('getInfo returns plain object', () => {
    const info = ws.getInfo();
    assert.doesNotThrow(() => JSON.stringify(info));
  });

  it('file operations return plain objects', () => {
    ws.saveFile('test.txt', 'content');
    const read = ws.readFile('test.txt');
    assert.doesNotThrow(() => JSON.stringify(read));
  });

  it('all returns have no undefined values', () => {
    const info = ws.getInfo();
    assert.equal(JSON.stringify(info).includes('undefined'), false);
  });
});

// ── getInfo isLegacy ──────────────────────────────────────────────

describe('Legacy structure in getInfo', () => {
  it('returns isLegacy=true when legacy dirs exist at root', () => {
    const tmp = createTempDir(['01-投喂区', '04-分析任务']);
    try {
      const ws = new WorkspaceService(tmp);
      assert.ok(ws.getInfo().isLegacy);
    } finally {
      removeDir(tmp);
    }
  });

  it('returns isLegacy=false for named workspace dir', () => {
    const tmp = createTempDir();
    const named = path.join(tmp, 'AI原生数据分析工作台');
    fs.mkdirSync(named, { recursive: true });
    try {
      const ws = new WorkspaceService(named);
      assert.equal(ws.getInfo().isLegacy, false);
    } finally {
      removeDir(tmp);
    }
  });
});

// ── Edge cases ────────────────────────────────────────────────────

describe('Edge cases', () => {
  let tmp, ws;
  before(() => {
    tmp = createTempDir(LEGACY_DIRS);
    ws = new WorkspaceService(tmp);
  });
  after(() => removeDir(tmp));

  it('handles task with Chinese characters in title', () => {
    const task = ws.createTask({
      title: '数据分析报告-2024-Q4-销售趋势与客户分群',
      description: '基于2024年Q4销售数据，分析各产品线表现、客户分群特征及渠道效率',
      taskType: 'analysis',
    });
    assert.ok(task.id);
    assert.equal(task.title, '数据分析报告-2024-Q4-销售趋势与客户分群');

    const fetched = ws.getTask(task.id);
    assert.equal(fetched.title, '数据分析报告-2024-Q4-销售趋势与客户分群');
  });

  it('_isLegacyStructure returns false for empty directory', () => {
    const empty = createTempDir();
    try {
      assert.equal(WorkspaceService._isLegacyStructure(empty), false);
    } finally {
      removeDir(empty);
    }
  });

  it('_isLegacyStructure returns false for non-existent directory', () => {
    assert.equal(WorkspaceService._isLegacyStructure('/nonexistent'), false);
  });

  it('listDirectory returns empty for missing directory', () => {
    assert.deepEqual(ws.listDirectory('nonexistent-dir'), []);
  });

  it('readFile returns null for missing file', () => {
    assert.equal(ws.readFile('nonexistent/file.txt'), null);
  });

  it('resolvePath normalizes mixed path separators', () => {
    const r = ws.resolvePath('01-投喂区//sub/./file.txt');
    assert.equal(r, path.join(tmp, '01-投喂区', 'sub', 'file.txt'));
  });
});
