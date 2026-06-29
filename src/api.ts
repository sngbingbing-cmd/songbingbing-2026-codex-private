import { mockDetail, mockExternalSources, mockSnapshot } from "./mock";
import type { AppSnapshot, ExternalSourceInfo, TaskDetail, WorkbenchApi } from "./types";

const wait = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms));
let snapshot: AppSnapshot = structuredClone(mockSnapshot);
let externalSources: ExternalSourceInfo[] = structuredClone(mockExternalSources);

const mockApi: WorkbenchApi = {
  async getSnapshot() { await wait(); return structuredClone(snapshot); },
  async selectWorkspace() { await wait(); return structuredClone(snapshot); },
  async createTask(name) {
    await wait();
    const id = `${new Date().toISOString().slice(0, 10).replaceAll("-", "")}_${name}`;
    const task: TaskDetail = { ...structuredClone(mockDetail), id, name: id, path: `${snapshot.workspacePath}/04-分析任务/${id}`, stage: "data", stageLabel: "02 资料", rawCount: 0, outputCount: 0, rawFiles: [], outputs: [], validation: [] };
    snapshot.tasks.unshift(task);
    snapshot.selectedTask = task;
    return task;
  },
  async getTask(id) { await wait(); return structuredClone(id === mockDetail.id ? mockDetail : { ...mockDetail, ...(snapshot.tasks.find((task) => task.id === id) || {}) }); },
  async archiveTask(id, archived) { await wait(); snapshot.tasks = snapshot.tasks.map((task) => task.id === id ? { ...task, archived } : task); },
  async pickFiles(_id, _zone) { await wait(); return structuredClone(mockDetail); },
  async syncFiles(_id) { await wait(); return structuredClone(mockDetail); },
  async readFile(path) { await wait(); return mockDetail.requiredDocs.find((doc) => doc.path === path)?.content || "# 文件预览\n\n当前为浏览器演示数据。"; },
  async saveFile(_path, _content) { await wait(); },
  async revealPath(_path) { await wait(); },
  async generatePrompt(_id, kind, draft) {
    await wait();
    const taskRoot = `${snapshot.workspacePath}/04-分析任务/${_id}`;
    return `# AI原生数据分析工作台｜${kind === "analysis" ? "首次分析" : kind === "reanalysis" ? "重分析" : kind === "four-piece" ? "四件套补齐" : kind === "evaluation" ? "AI评测" : "输出"}调度单\n\n## 0. 路径锚点（最高优先级）\n- 当前工作区唯一根目录: ${snapshot.workspacePath}\n- 当前任务唯一根目录: ${taskRoot}\n- 本次执行类型: ${kind}\n\n${draft ? `## 用户分析指令\n${draft.goal}\n${draft.thinking}\n${draft.verification}\n\n` : ""}不得使用当前终端目录或其他同名任务替代上述绝对路径。\n正式输出只能写入: ${taskRoot}/outputs\n执行回执写入: ${taskRoot}/receipt.json`;
  },
  async generateSemanticPrompt() {
    await wait();
    return `# 权威语义维护调度单\n\n正式语义只读。仅将AI候选写入：${snapshot.workspacePath}/02-权威语义层/待确认建议`;
  },
  async createSemanticCandidate(input) {
    await wait();
    snapshot.semantic.pending.push({ id: `semantic-${Date.now()}`, type: input.type || "metric", title: input.title || "未命名候选", proposed: input.proposed || "", evidence: input.evidence || "", impact: input.impact || "" });
    return structuredClone(snapshot.semantic);
  },
  async updateSemanticCandidate(id, patch) { await wait(); snapshot.semantic.pending = snapshot.semantic.pending.map((item) => item.id === id ? { ...item, ...patch } : item); return structuredClone(snapshot.semantic); },
  async approveSemanticCandidate(id, _confirmedBy) { await wait(); snapshot.semantic.pending = snapshot.semantic.pending.filter((item) => item.id !== id); return structuredClone(snapshot.semantic); },
  async rejectSemanticCandidate(id, _reason) { await wait(); snapshot.semantic.pending = snapshot.semantic.pending.filter((item) => item.id !== id); return structuredClone(snapshot.semantic); },
  async uploadSemanticMaterials() { await wait(); return 2; },
  async generateWordReport(_id) {
    await wait(500);
    return { outputPath: `${snapshot.workspacePath}/04-分析任务/${_id}/outputs/示例经营分析.docx`, outputName: "示例经营分析.docx", sourcePath: `${snapshot.workspacePath}/04-分析任务/${_id}/outputs/示例经营分析.md`, task: structuredClone(mockDetail) };
  },
  async dispatchPrompt(_id, kind, draft) { await wait(); return mockApi.generatePrompt(_id, kind, draft); },
  async writeFeedback(_id, _category, _content) { await wait(); return structuredClone(mockDetail); },
  async runEvaluation(_id) { await wait(400); return structuredClone({ ...mockDetail, evaluation: { ...mockDetail.evaluation, status: "通过", score: 86, checkedAt: new Date().toLocaleString("zh-CN") } }); },
  async checkForUpdates() { await wait(500); return { status: "current" }; },
  async downloadUpdate() { await wait(900); return { downloaded: true }; },
  async installUpdate() { await wait(); },
  async getExternalSources(_id) { await wait(); return structuredClone(externalSources); },
  async linkExternalSource(_id, sourcePath, label) {
    await wait();
    const source = { path: sourcePath, label: label || sourcePath.split("/").pop() || "external", lastScannedAt: new Date().toISOString(), totalFiles: 42, totalSizeKb: 15600, topLevelItems: [{ name: "成员一-岗位职责", isDirectory: true }, { name: "成员二-专项材料", isDirectory: true }, { name: "readme.md", isDirectory: false }], anomalies: [], scanStatus: "ok" as const };
    externalSources = [...externalSources.filter((item) => item.path !== sourcePath), source];
    return structuredClone(source);
  },
  async refreshExternalSource(_id, sourcePath) {
    await wait(400);
    const current = externalSources.find((item) => item.path === sourcePath);
    const refreshed = { ...(current || { path: sourcePath, label: sourcePath.split("/").pop() || "external", totalFiles: 0, totalSizeKb: 0, topLevelItems: [], anomalies: [], scanStatus: "ok" as const }), lastScannedAt: new Date().toISOString() };
    externalSources = externalSources.map((item) => item.path === sourcePath ? refreshed : item);
    return structuredClone(refreshed);
  },
  async unlinkExternalSource(_id, sourcePath) { await wait(); externalSources = externalSources.filter((item) => item.path !== sourcePath); return { ok: true }; },
  async revealExternalSource(_id, _sourcePath) { await wait(); },
  async pickDirectory() { await wait(); return "/Users/demo/Desktop/19人上半年材料"; },
};

export const api: WorkbenchApi = window.workbench || mockApi;
