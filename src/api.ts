import { mockDetail, mockSnapshot } from "./mock";
import type { AppSnapshot, TaskDetail, WorkbenchApi } from "./types";

const wait = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms));
let snapshot: AppSnapshot = structuredClone(mockSnapshot);

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
  async generatePrompt(_id, kind) {
    await wait();
    return `# AI原生数据分析工作台｜${kind === "analysis" ? "首次分析" : kind === "reanalysis" ? "重分析" : kind === "evaluation" ? "AI评测" : "输出"}调度单\n\n请读取任务目录、权威语义层和领域Skill，基于现有资料执行。资料缺口只改变结论边界，不阻塞当前版本报告。`;
  },
  async writeFeedback(_id, _category, _content) { await wait(); return structuredClone(mockDetail); },
  async runEvaluation(_id) { await wait(400); return structuredClone({ ...mockDetail, evaluation: { ...mockDetail.evaluation, status: "通过", score: 86, checkedAt: new Date().toLocaleString("zh-CN") } }); },
  async checkForUpdates() { await wait(500); return { status: "current" }; },
  async installUpdate() { await wait(); }
};

export const api: WorkbenchApi = window.workbench || mockApi;
