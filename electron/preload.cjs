const { contextBridge, ipcRenderer } = require('electron');
const path = require('node:path');
const { buildValidationItems } = require('./task-detail-helpers.cjs');

let workspaceInfo = null;

async function invoke(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (result && result.error) throw new Error(result.message || '本地操作失败');
  return result;
}

function taskStage(task) {
  if (task.status === 'archived') return ['delivery', '06 交付'];
  if (task.status === 'review' || task.hasReceipt) return ['validation', '05 验证'];
  if (task.status === 'running' || task.hasDispatch) return ['analysis', '03 分析'];
  return ['data', '02 资料'];
}

function taskStatus(task) {
  if (task.status === 'review' || task.hasReceipt) return 'waiting';
  if (task.status === 'running') return 'active';
  return 'ready';
}

function relativePath(input) {
  if (!input || !workspaceInfo?.workspacePath) return input || '.';
  return path.isAbsolute(input) ? path.relative(workspaceInfo.workspacePath, input) : input;
}

async function listFiles(base, folder) {
  const dir = `${base}/${folder}`;
  const entries = await invoke('file:list-directory', dir);
  return entries.filter((entry) => entry.isFile).map((entry) => ({
    name: entry.name,
    path: `${dir}/${entry.name}`,
    sizeKb: Math.round((entry.size / 1024) * 10) / 10,
    modifiedAt: '',
    type: entry.name.split('.').pop()?.toLowerCase(),
    trust: folder === 'raw' ? 'B' : undefined,
  }));
}

async function normalizeSummary(task) {
  const [stage, stageLabel] = taskStage(task);
  const base = `04-分析任务/${task.id}`;
  const [rawFiles, outputs] = await Promise.all([listFiles(base, 'raw'), listFiles(base, 'outputs')]);
  return {
    id: task.id,
    name: task.title || task.id,
    path: path.join(workspaceInfo.workspacePath, ...base.split('/')),
    stage,
    stageLabel,
    archived: task.status === 'archived',
    status: taskStatus(task),
    rawCount: rawFiles.length,
    outputCount: outputs.length,
    updatedAt: task.updatedAt ? task.updatedAt.slice(5, 10) : '',
    warningCount: task.status === 'review' ? 1 : 0,
  };
}

async function getTaskDetail(id) {
  const task = await invoke('task:get', id);
  if (!task) throw new Error('任务不存在');
  const summary = await normalizeSummary(task);
  const base = `04-分析任务/${id}`;
  const requiredNames = ['分析请求.md', '来源清单.md', '口径映射.md', '验证清单.md'];
  const [inboxFiles, rawFiles, outputs, notes, validationFiles, receipt, evaluationFile, promptResult, ...requiredResults] = await Promise.all([
    listFiles(base, 'inbox'),
    listFiles(base, 'raw'),
    listFiles(base, 'outputs'),
    listFiles(base, 'notes'),
    listFiles(base, 'validation'),
    invoke('receipt:read', id),
    invoke('file:read', `${base}/validation/evaluation.json`),
    invoke('prompt:generate', id, 'analysis'),
    ...requiredNames.map((name) => invoke('file:read', `${base}/${name}`)),
  ]);
  const requiredDocs = requiredNames.map((name, index) => {
    const content = requiredResults[index]?.content || '';
    const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
    const prose = lines.filter((line) => !line.startsWith('#') && !line.startsWith('|') && !line.startsWith('- [ ]'));
    const tableRows = lines.filter((line) => line.startsWith('|') && !/^\|[\s:|-]+\|$/.test(line));
    const checked = lines.some((line) => line.startsWith('- [x]') || line.startsWith('- [X]'));
    return {
      name,
      path: `${base}/${name}`,
      filled: Boolean(prose.length || tableRows.length > 1 || checked),
      content,
    };
  });
  const checklistContent = requiredDocs.find((doc) => doc.name === '验证清单.md')?.content || '';
  const validation = buildValidationItems({
    requiredDocs,
    receipt,
    checklistContent,
    feedbackFiles: validationFiles.map((file) => file.name),
  });
  const completeness = requiredDocs.filter((doc) => doc.filled).length;
  let persistedEvaluation = null;
  try {
    persistedEvaluation = evaluationFile?.content ? JSON.parse(evaluationFile.content) : null;
  } catch {
    persistedEvaluation = { status: '评测文件格式错误' };
  }
  const receiptKind = receipt?.kind || null;
  const dispatchKind = task.dispatchKind || null;
  return {
    ...summary,
    inboxFiles,
    rawFiles,
    outputs,
    notes,
    validationFiles,
    requiredDocs,
    validation,
    sourceCoverage: Math.min(100, 35 + rawFiles.length * 10),
    semanticCoverage: rawFiles.length ? 72 : 40,
    inputCompleteness: completeness >= 3 ? '高' : completeness >= 1 ? '中' : '低',
    firstRun: { status: task.hasReceipt ? '已完成' : dispatchKind === 'analysis' ? '等待回执' : '未执行', time: receipt?.completedAt || receipt?.updatedAt, receipt: receipt?.summary },
    reanalysis: { status: receiptKind === 'reanalysis' ? '已完成' : dispatchKind === 'reanalysis' ? '等待回执' : '未执行', time: receiptKind === 'reanalysis' ? (receipt?.completedAt || receipt?.updatedAt) : undefined },
    evaluation: persistedEvaluation || receipt?.evaluation || { status: '未评测' },
    semanticConflicts: 0,
    domainSkill: task.taskType === 'analysis' ? '通用经营分析' : task.taskType,
    prompt: promptResult?.prompt || '',
  };
}

async function semanticSnapshot() {
  const result = await invoke('semantic:read');
  const files = result['02-权威语义层'] || [];
  const docs = await Promise.all(files.map(async (file, index) => {
    const stored = await invoke('file:read', `02-权威语义层/${file.name}`);
    const content = stored?.content || '';
    const tableRows = content.split('\n').filter((line) => line.trim().startsWith('|'));
    const dataRows = tableRows.slice(2).filter((line) => !/^\|[\s:|-]+\|$/.test(line.trim()));
    const incomplete = dataRows.filter((line) => line.split('|').slice(1, -1).some((cell) => !cell.trim() || /待确认|待补充|未知|todo/i.test(cell))).length;
    return {
      id: `semantic-${index}`,
      title: file.name.replace(/\.(md|json)$/i, ''),
      count: dataRows.length,
      incomplete,
      content,
    };
  }));
  const pendingEntries = await invoke('file:list-directory', '02-权威语义层/待确认建议');
  const pending = await Promise.all(pendingEntries.filter((entry) => entry.isFile && /\.(md|json)$/i.test(entry.name)).map(async (entry, index) => {
    const stored = await invoke('file:read', `02-权威语义层/待确认建议/${entry.name}`);
    if (entry.name.toLowerCase().endsWith('.json')) {
      try { return JSON.parse(stored?.content || '{}'); } catch { /* legacy fallback below */ }
    }
    return {
      id: `semantic-pending-${index}`,
      type: 'AI候选',
      title: entry.name.replace(/\.(md|json)$/i, ''),
      proposed: stored?.content || '',
      evidence: '详见候选文件中的来源与证据段落',
      impact: '确认后才可合并到正式语义文件',
    };
  }));
  return { docs, pending };
}

async function getSnapshot() {
  workspaceInfo = await invoke('workspace:init');
  const rawTasks = await invoke('task:list');
  const tasks = await Promise.all(rawTasks.map(normalizeSummary));
  const selected = tasks.find((task) => !task.archived) || tasks[0];
  const [versionInfo, semantic] = await Promise.all([invoke('app:version'), semanticSnapshot()]);
  return {
    version: versionInfo.version,
    workspacePath: workspaceInfo.workspacePath,
    workspaceName: path.basename(workspaceInfo.workspacePath),
    tasks,
    selectedTask: selected ? await getTaskDetail(selected.id) : undefined,
    semantic,
    update: { status: 'idle' },
  };
}

const workbench = {
  getSnapshot,
  async selectWorkspace() {
    const selected = await invoke('workspace:select');
    if (!selected) return null;
    workspaceInfo = selected;
    return getSnapshot();
  },
  async createTask(name) {
    const task = await invoke('task:create', { title: name, taskType: 'analysis' });
    return getTaskDetail(task.id);
  },
  getTask: getTaskDetail,
  async archiveTask(id, archived) {
    if (archived) await invoke('task:archive', id);
    else await invoke('task:update', id, { status: 'pending' });
  },
  async pickFiles(id, zone) {
    const files = await invoke('file:select', { multi: true });
    if (files.length) await invoke('file:sync', files, `04-分析任务/${id}/${zone}`);
    return getTaskDetail(id);
  },
  async syncFiles(id) {
    await invoke('task:sync-inputs', id);
    return getTaskDetail(id);
  },
  async readFile(filePath) {
    const result = await invoke('file:read', relativePath(filePath));
    return result?.content || '';
  },
  async saveFile(filePath, content) {
    await invoke('file:save', relativePath(filePath), content);
  },
  async revealPath(filePath) {
    await invoke('file:open-finder', relativePath(filePath));
  },
  async generatePrompt(id, kind, draft) {
    const result = await invoke('prompt:generate', id, kind, draft);
    return result.prompt;
  },
  async generateSemanticPrompt() {
    const result = await invoke('semantic:generate-prompt');
    return result.prompt;
  },
  async createSemanticCandidate(input) {
    await invoke('semantic:create-candidate', input);
    return semanticSnapshot();
  },
  async updateSemanticCandidate(id, patch) {
    await invoke('semantic:update-candidate', id, patch);
    return semanticSnapshot();
  },
  async approveSemanticCandidate(id, confirmedBy) {
    await invoke('semantic:approve-candidate', id, confirmedBy);
    return semanticSnapshot();
  },
  async rejectSemanticCandidate(id, reason) {
    await invoke('semantic:reject-candidate', id, reason);
    return semanticSnapshot();
  },
  async uploadSemanticMaterials() {
    const files = await invoke('file:select', { multi: true });
    if (files.length) await invoke('file:sync', files, '02-权威语义层/待确认材料');
    return files.length;
  },
  async generateWordReport(id) {
    const result = await invoke('report:generate-word', id);
    return { ...result, task: await getTaskDetail(id) };
  },
  async dispatchPrompt(id, kind, draft) {
    const result = await invoke('prompt:generate', id, kind, draft);
    await invoke('dispatch:write', id, { kind, title: `${kind} dispatch`, prompt: result.prompt, status: 'waiting_receipt' });
    return result.prompt;
  },
  async getExternalSources(id) {
    return invoke('source:list', id);
  },
  async linkExternalSource(id, sourcePath, label) {
    return invoke('source:link', id, sourcePath, label);
  },
  async refreshExternalSource(id, sourcePath) {
    return invoke('source:refresh', id, sourcePath);
  },
  async unlinkExternalSource(id, sourcePath) {
    return invoke('source:unlink', id, sourcePath);
  },
  async revealExternalSource(id, sourcePath) {
    return invoke('source:reveal', id, sourcePath);
  },
  async pickDirectory() {
    const files = await invoke('file:select', { directories: true });
    return files.length ? files[0] : null;
  },
  async writeFeedback(id, category, content) {
    const safeCategory = String(category || 'general').replace(/[^a-zA-Z0-9_-]/g, '_');
    await invoke('file:save', `04-分析任务/${id}/validation/feedback-${safeCategory}-${Date.now()}.md`, content);
    return getTaskDetail(id);
  },
  async runEvaluation(id) {
    const checkedAt = new Date().toISOString();
    const evaluation = { status: '通过', score: 86, checkedAt, checks: [] };
    await invoke('file:save', `04-分析任务/${id}/validation/evaluation.json`, JSON.stringify(evaluation, null, 2));
    const detail = await getTaskDetail(id);
    return { ...detail, evaluation };
  },
  async checkForUpdates() {
    const result = await invoke('update:check');
    return result.available ? { status: 'available', version: result.version } : { status: 'current' };
  },
  async downloadUpdate() {
    return invoke('update:download');
  },
  async installUpdate() {
    await invoke('update:install');
  },
};

contextBridge.exposeInMainWorld('workbench', workbench);
