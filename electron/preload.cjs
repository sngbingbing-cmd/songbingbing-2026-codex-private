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
  const [inboxFiles, rawFiles, outputs, notes, validationFiles, receipt, evaluationFile, skillAssoc, ...requiredResults] = await Promise.all([
    listFiles(base, 'inbox'),
    listFiles(base, 'raw'),
    listFiles(base, 'outputs'),
    listFiles(base, 'notes'),
    listFiles(base, 'validation'),
    invoke('receipt:read', id),
    invoke('file:read', `${base}/validation/evaluation.json`),
    invoke('skill:get-task', id),
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
    sourceCoverage: (() => {
      // Real source coverage: 60% from required docs fill + 40% from raw data presence
      const filledCount = requiredDocs.filter((doc) => doc.filled).length;
      const docScore = requiredDocs.length ? (filledCount / requiredDocs.length) * 60 : 0;
      const rawScore = rawFiles.length > 0 ? 40 : 10;
      return Math.round(docScore + rawScore);
    })(),
    semanticCoverage: 0, // correctly computed in getSnapshot from semantic layer data
    inputCompleteness: completeness >= 3 ? '高' : completeness >= 1 ? '中' : '低',
    firstRun: { status: task.hasReceipt ? '已完成' : dispatchKind === 'analysis' ? '等待回执' : '未执行', time: receipt?.completedAt || receipt?.updatedAt, receipt: receipt?.summary },
    reanalysis: { status: receiptKind === 'reanalysis' ? '已完成' : dispatchKind === 'reanalysis' ? '等待回执' : '未执行', time: receiptKind === 'reanalysis' ? (receipt?.completedAt || receipt?.updatedAt) : undefined },
    evaluation: persistedEvaluation || receipt?.evaluation || { status: '未评测' },
    semanticConflicts: 0,
    domainSkill: task.taskType === 'analysis' ? '通用经营分析' : task.taskType,
    skillId: skillAssoc?.skillId || null,
    prompt: '',
  };
}

async function semanticSnapshot() {
  const result = await invoke('semantic:read');
  const files = result['02-权威语义层'] || [];
  const docs = await Promise.all(files.map(async (file, index) => {
    const stored = await invoke('file:read', `02-权威语义层/${file.name}`);
    const content = stored?.content || '';
    const tableRows = content.split('\n').filter((line) => line.trim().startsWith('|'));
    const sepLine = tableRows[1] || '';
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
  const selectedTask = selected ? await getTaskDetail(selected.id) : undefined;
  // Compute real semantic coverage from semantic layer data
  if (selectedTask && semantic) {
    const totalEntries = semantic.docs.reduce((sum, doc) => sum + doc.count, 0);
    const incompleteEntries = semantic.docs.reduce((sum, doc) => sum + doc.incomplete, 0);
    selectedTask.semanticCoverage = totalEntries > 0
      ? Math.round(((totalEntries - incompleteEntries) / totalEntries) * 100)
      : 0;
  }
  return {
    version: versionInfo.version,
    workspacePath: workspaceInfo.workspacePath,
    workspaceName: path.basename(workspaceInfo.workspacePath),
    tasks,
    selectedTask,
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
  async createTask(name, skillId) {
    const task = await invoke('task:create', { title: name, taskType: 'analysis', skillId });
    if (skillId) await invoke('skill:set-task', task.id, skillId);
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
  async approveSemanticCandidates(ids, confirmedBy) {
    for (const id of ids) await invoke('semantic:approve-candidate', id, confirmedBy);
    return semanticSnapshot();
  },
  async rejectSemanticCandidate(id, reason) {
    await invoke('semantic:reject-candidate', id, reason);
    return semanticSnapshot();
  },
  async rejectSemanticCandidates(ids, reason) {
    for (const id of ids) await invoke('semantic:reject-candidate', id, reason);
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
    // ── Real evaluation: score from validation items, docs, outputs, receipt ──
    const detail = await getTaskDetail(id);
    const checks = [];

    // 1. Required docs completeness (30 points)
    const filledDocs = detail.requiredDocs.filter((d) => d.filled).length;
    const totalDocs = detail.requiredDocs.length || 4;
    const docScore = Math.round((filledDocs / totalDocs) * 30);
    checks.push({ id: 'docs', title: '必填文档完整度', status: filledDocs === totalDocs ? 'pass' : 'warn', detail: `${filledDocs}/${totalDocs} 已填写`, score: docScore, max: 30 });

    // 2. Validation items resolved (40 points)
    const totalValidation = detail.validation.length;
    const resolvedValidation = detail.validation.filter((v) => v.status === 'resolved').length;
    const validationScore = totalValidation === 0 ? 40 : Math.round((resolvedValidation / totalValidation) * 40);
    checks.push({ id: 'validation', title: '验证项处理', status: resolvedValidation === totalValidation ? 'pass' : 'warn', detail: totalValidation === 0 ? '无待验证项' : `${resolvedValidation}/${totalValidation} 已处理`, score: validationScore, max: 40 });

    // 3. Output files exist (20 points)
    const outputScore = detail.outputs.length > 0 ? 20 : 0;
    checks.push({ id: 'outputs', title: '输出物生成', status: outputScore > 0 ? 'pass' : 'fail', detail: `${detail.outputs.length} 个输出文件`, score: outputScore, max: 20 });

    // 4. Receipt / dispatch completed (10 points)
    const hasReceipt = detail.firstRun.status === '已完成';
    const receiptScore = hasReceipt ? 10 : 0;
    checks.push({ id: 'receipt', title: '分析回执', status: hasReceipt ? 'pass' : 'fail', detail: detail.firstRun.status, score: receiptScore, max: 10 });

    const totalScore = docScore + validationScore + outputScore + receiptScore;
    const status = totalScore >= 80 ? '通过' : totalScore >= 60 ? '有条件通过' : '不通过';
    const checkedAt = new Date().toLocaleString('zh-CN');
    const evaluation = { status, score: totalScore, checkedAt, checks };

    await invoke('file:save', `04-分析任务/${id}/validation/evaluation.json`, JSON.stringify(evaluation, null, 2));
    return { ...detail, evaluation };
  },
  // Skill
  async listSkills() {
    return invoke('skill:list');
  },
  async getSkill(skillId) {
    return invoke('skill:get', skillId);
  },
  async saveSkill(skill) {
    return invoke('skill:save', skill);
  },
  async deleteSkill(skillId) {
    return invoke('skill:delete', skillId);
  },
  async setTaskSkill(taskId, skillId) {
    await invoke('skill:set-task', taskId, skillId);
    return getTaskDetail(taskId);
  },
  async precipitateSkill(taskId, skillDraft) {
    const detail = await getTaskDetail(taskId);
    const safeName = (skillDraft.name || 'skill').replace(/[\\/:*?"<>|]/g, '-');
    const skillId = `${safeName}-${Date.now().toString(36)}`;
    const skill = {
      id: skillId,
      name: skillDraft.name,
      description: skillDraft.description || '',
      domain: skillDraft.domain || '通用',
      version: '1.0',
      content: `# ${skillDraft.name}\n\n## 沉淀来源\n- 任务：${detail.name}（${detail.id}）\n- 沉淀时间：${new Date().toISOString()}\n\n## 分析框架（从本次分析中提炼）\n\n> 请在下方补充分析框架、关键规则和可复用方法。\n\n## 验证规则\n\n> 请补充校验规则和常见陷阱。\n\n## 输出标准\n\n> 请补充报告格式和输出要求。`,
      sourceTaskId: taskId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const saved = await invoke('skill:save', skill);
    // Associate this skill with the task
    await invoke('skill:set-task', taskId, skillId);
    return saved;
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
