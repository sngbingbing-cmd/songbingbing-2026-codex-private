import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowClockwise, Bell, Check, UploadSimple, WarningCircle } from "@phosphor-icons/react";
import { api, isMockMode } from "./api";
import { parseMarkdownTable } from "./semantic-table-utils";
import type { AppSnapshot, DomainSkill, GlobalView, StageId, TaskDetail, TaskSummary, ToastTone } from "./types";
import { GlobalRail, NewTaskModal, stageGate, StageNav, StatusBar, TaskHeader, TaskNavigator, TitleBar } from "./components/navigation";
import type { GlobalSearchResults } from "./components/navigation";
import { SemanticCenter } from "./components/semantic-center";
import { AnalysisStage, DataStage, DeliveryStage, EvaluationStage, ExternalSourcesModule, FourPieceStage, OverviewStage, ValidationStage } from "./components/stages";
import { AppButton, Spinner } from "./components/ui";

function SettingsView({ snapshot, onSelectWorkspace, onUpdate, onDownload, onInstall }: { snapshot: AppSnapshot; onSelectWorkspace: () => void; onUpdate: () => void; onDownload: () => void; onInstall: () => void }) {
  const update = snapshot.update;
  const updateMessage = update.status === "checking" ? "正在检查 GitHub Releases…" : update.status === "available" ? `发现新版本 v${update.version}，尚未下载。` : update.status === "downloading" ? `正在下载 v${update.version}，请保持应用打开。` : update.status === "downloaded" ? `v${update.version} 已下载，可以重启安装。` : update.status === "current" ? "当前已是最新版本。" : update.status === "error" ? "更新失败，请重试或下载安装包。" : "通过 GitHub Releases 获取新版本。";
  return <main className="global-content settings"><header className="global-content-head"><div><h1>设置</h1><p>本机工作区、版本升级和应用信息。</p></div></header><section className="settings-section"><h2>工作区</h2><div className="setting-row"><div><strong>当前工作区</strong><p>{snapshot.workspacePath}</p></div><AppButton onClick={onSelectWorkspace}>选择目录</AppButton></div></section><section className="settings-section"><h2>软件更新</h2><div className="setting-row"><div><strong>当前版本 v{snapshot.version}</strong><p>{updateMessage}</p></div><div className="inline-actions">{update.status === "available" ? <AppButton tone="primary" icon={<UploadSimple size={16} />} onClick={onDownload}>下载更新</AppButton> : null}{update.status === "downloaded" ? <AppButton tone="primary" icon={<ArrowClockwise size={16} />} onClick={onInstall}>重启并安装</AppButton> : null}<AppButton disabled={["checking", "downloading", "installing"].includes(update.status)} icon={update.status === "checking" ? <Spinner /> : <ArrowClockwise size={16} />} onClick={onUpdate}>检查更新</AppButton></div></div><div className="update-steps"><span className={["available", "downloading", "downloaded", "installing"].includes(update.status) ? "done" : ""}>1 发现版本</span><span className={["downloaded", "installing"].includes(update.status) ? "done" : update.status === "downloading" ? "active" : ""}>2 下载</span><span className={update.status === "installing" ? "active" : ""}>3 重启安装</span></div></section><section className="settings-section"><h2>关于</h2><p>AI原生数据分析工作台 · 作者 宋冰冰 & Codex</p><p>本地优先。业务数据不会随应用源代码公开。</p></section></main>;
}

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [stage, setStage] = useState<StageId>("analysis");
  const [view, setView] = useState<GlobalView>("tasks");
  const [query, setQuery] = useState("");
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [skills, setSkills] = useState<DomainSkill[]>([]);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string, tone: ToastTone = "success") => {
    setToast({ message, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  useEffect(() => { api.getSnapshot().then((data) => { setSnapshot(data); setTask(data.selectedTask || null); if (data.selectedTask) setStage(data.selectedTask.stage); }); }, []);
  useEffect(() => { api.listSkills().then(setSkills).catch(() => {}); }, []);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") { event.preventDefault(); setNewTaskOpen(true); } if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); document.querySelector<HTMLInputElement>(".command-search input")?.focus(); } }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, []);

  const activeTask = task;
  const taskIds = useMemo(() => new Set(snapshot?.tasks.map((item) => item.id) || []), [snapshot]);

  const changeStage = useCallback((next: StageId) => {
    setStage(next);
    if (activeTask?.id) { api.updateTaskStage(activeTask.id, next).catch(() => {}); }
  }, [activeTask?.id]);

  const selectTask = async (summary: TaskSummary) => { const detail = await api.getTask(summary.id); setTask(detail); setStage(detail.stage); setView("tasks"); };
  const refreshTask = (detail: TaskDetail) => { setTask(detail); setSnapshot((current) => current ? { ...current, selectedTask: detail, tasks: current.tasks.map((item) => item.id === detail.id ? { ...item, ...detail } : item) } : current); };
  useEffect(() => { if (!task?.id || view !== "tasks") return; let cancelled = false; api.getTask(task.id).then((detail) => { if (!cancelled) refreshTask(detail); }); return () => { cancelled = true; }; }, [stage, view, task?.id]);
  const createTask = async (name: string) => { const detail = await api.createTask(name); setSnapshot((current) => current ? { ...current, selectedTask: detail, tasks: [detail, ...current.tasks.filter((item) => item.id !== detail.id)] } : current); setTask(detail); setStage("data"); setView("tasks"); setNewTaskOpen(false); notify("任务已创建"); };
  const archiveTask = async (summary: TaskSummary) => { await api.archiveTask(summary.id, !summary.archived); setSnapshot((current) => current ? { ...current, tasks: current.tasks.map((item) => item.id === summary.id ? { ...item, archived: !summary.archived } : item) } : current); notify(summary.archived ? "任务已恢复" : "任务已归档"); };
  const checkUpdate = async () => { setSnapshot((current) => current ? { ...current, update: { status: "checking" } } : current); const result = await api.checkForUpdates(); setSnapshot((current) => current ? { ...current, update: { status: result.status as AppSnapshot["update"]["status"], version: result.version } } : current); notify(result.status === "available" ? `发现新版本 ${result.version}` : "当前已是最新版本"); };
  const downloadUpdate = async () => { const version = snapshot?.update.version; setSnapshot((current) => current ? { ...current, update: { status: "downloading", version } } : current); try { await api.downloadUpdate(); setSnapshot((current) => current ? { ...current, update: { status: "downloaded", version } } : current); notify("更新已下载，可以重启安装"); } catch { setSnapshot((current) => current ? { ...current, update: { status: "error", version } } : current); notify("更新下载失败", "error"); } };
  const installUpdate = async () => { setSnapshot((current) => current ? { ...current, update: { ...current.update, status: "installing" } } : current); notify("应用将退出并安装更新", "info"); await api.installUpdate(); };

  const setTaskSkill = async (skillId: string | null) => {
    if (!activeTask) return;
    const updated = await api.setTaskSkill(activeTask.id, skillId);
    refreshTask(updated);
    notify(skillId ? 'Skill已关联' : '已取消Skill关联');
  };

  if (!snapshot || !activeTask) return <div className="app-loading"><Spinner /><strong>正在打开本地工作区</strong></div>;

  const q = query.trim().toLowerCase();
  const searchResults: GlobalSearchResults = q ? {
    tasks: snapshot.tasks.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 10),
    files: activeTask ? [
      ...activeTask.rawFiles.map((f) => ({ taskName: activeTask.name, fileName: f.name })),
      ...activeTask.outputs.map((f) => ({ taskName: activeTask.name, fileName: f.name })),
    ].filter((f) => f.fileName.toLowerCase().includes(q)).slice(0, 10) : [],
    semantic: snapshot.semantic.docs.flatMap((doc) => {
      const items = parseMarkdownTable(doc.content).items;
      const firstCol = parseMarkdownTable(doc.content).colNames[0];
      return items.filter((item) => (item.row[firstCol] || '').toLowerCase().includes(q)).map((item) => ({ doc: doc.title, entry: item.row[firstCol] || '' }));
    }).slice(0, 10),
  } : { tasks: [], files: [], semantic: [] };

  let content: React.ReactNode;
  if (view === "semantic") content = <SemanticCenter snapshot={snapshot} onBack={() => setView("tasks")} onSemanticChange={(semantic) => setSnapshot((current) => current ? { ...current, semantic } : current)} onRefresh={async () => { const next = await api.getSnapshot(); setSnapshot(next); if (next.selectedTask?.id === activeTask.id) setTask(next.selectedTask); notify("语义中心已刷新"); }} notify={notify} />;
  else if (view === "settings") content = <SettingsView snapshot={snapshot} onSelectWorkspace={async () => { const next = await api.selectWorkspace(); if (next) { setSnapshot(next); setTask(next.selectedTask || null); notify("工作区已切换"); } }} onUpdate={checkUpdate} onDownload={downloadUpdate} onInstall={installUpdate} />;
  else {
    const stageContent = stage === "overview" ? <OverviewStage task={activeTask} setStage={changeStage} />
      : stage === "data" ? <DataStage task={activeTask} refresh={refreshTask} notify={notify} />
      : stage === "analysis" ? <AnalysisStage task={activeTask} refresh={refreshTask} notify={notify} skills={skills} onSetSkill={setTaskSkill} />
      : stage === "four-piece" ? <FourPieceStage task={activeTask} refresh={refreshTask} notify={notify} />
      : stage === "validation" ? <ValidationStage task={activeTask} refresh={refreshTask} notify={notify} />
      : stage === "delivery" ? <DeliveryStage task={activeTask} refresh={refreshTask} notify={notify} />
      : <EvaluationStage task={activeTask} refresh={refreshTask} notify={notify} />;
    const gateNotice = stageGate(activeTask, stage);
    content = <main className="task-workspace"><TaskHeader task={activeTask} onReveal={() => api.revealPath(activeTask.path)} onContinue={() => changeStage("analysis")} onEvaluate={() => changeStage("evaluation")} /><StageNav active={stage} task={activeTask} onStage={changeStage} />{gateNotice ? <div className="stage-gate-notice"><WarningCircle size={16} />{gateNotice}</div> : null}{stageContent}</main>;
  }

  const navigateGlobal = (next: GlobalView) => {
    if (next === "evaluation") { setView("tasks"); changeStage("evaluation"); return; }
    setView(next);
  };

  const selectWorkspace = async () => { const next = await api.selectWorkspace(); if (next) { setSnapshot(next); setTask(next.selectedTask || null); notify("工作区已切换"); } };

  return <div className="app-shell">{isMockMode ? <div className="mock-banner">演示模式 · 未连接 Electron 桌面环境，数据为模拟值，不可保存</div> : null}<TitleBar snapshot={snapshot} query={query} onQuery={setQuery} onCheckUpdate={checkUpdate} onWorkspace={selectWorkspace} searchResults={searchResults} onSelectTask={selectTask} /><div className="app-body"><GlobalRail view={view} onView={navigateGlobal} collapsed={railCollapsed} onToggleCollapse={() => setRailCollapsed(!railCollapsed)} /><TaskNavigator tasks={snapshot.tasks.filter((item) => taskIds.has(item.id))} selectedId={activeTask.id} query={query} onQuery={setQuery} onSelect={selectTask} onCreate={() => setNewTaskOpen(true)} onArchive={archiveTask} showAll={showAllTasks} onToggleShowAll={() => setShowAllTasks(!showAllTasks)} />{content}</div>{view === "tasks" ? <StatusBar task={activeTask} /> : null}{toast ? <div className={`toast toast-${toast.tone}`}>{toast.tone === "error" ? <WarningCircle size={16} /> : toast.tone === "info" ? <Bell size={16} /> : <Check size={16} />}{toast.message}</div> : null}{newTaskOpen ? <NewTaskModal onClose={() => setNewTaskOpen(false)} onCreate={createTask} /> : null}</div>;
}
