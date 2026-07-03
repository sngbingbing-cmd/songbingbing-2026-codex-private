import { useState } from "react";
import {
  Archive, Bell, CaretDown, CaretRight, CheckCircle, ClipboardText, FolderOpen,
  Gear, ListChecks, MagnifyingGlass, Plus, Robot, ShieldCheck, SidebarSimple,
  Sparkle, WarningCircle, X
} from "@phosphor-icons/react";
import type { AppSnapshot, GlobalView, StageId, TaskDetail, TaskSummary } from "../types";
import { AppButton, Spinner } from "./ui";

const STAGES: Array<{ id: StageId; number: string; title: string; subtitle: string }> = [
  { id: "overview", number: "01", title: "概览", subtitle: "任务状态" },
  { id: "data", number: "02", title: "资料", subtitle: "输入准备" },
  { id: "analysis", number: "03", title: "分析", subtitle: "生成初稿" },
  { id: "four-piece", number: "04", title: "收工补齐", subtitle: "四件套" },
  { id: "validation", number: "05", title: "验证回流", subtitle: "确认与重分析" },
  { id: "delivery", number: "06", title: "交付", subtitle: "正式输出" },
  { id: "evaluation", number: "07", title: "评测", subtitle: "抽查改进" }
];

const statusText = { active: "分析中", waiting: "待确认", ready: "输入中", warning: "需处理" } as const;
const isMac = navigator.userAgent.toLowerCase().includes("mac");
const shortcutModifier = isMac ? "⌘" : "Ctrl+";

export { STAGES, statusText, shortcutModifier };

export interface GlobalSearchResults { tasks: TaskSummary[]; files: Array<{ taskName: string; fileName: string }>; semantic: Array<{ doc: string; entry: string }> }

export function GlobalRail({ view, onView, collapsed, onToggleCollapse }: { view: GlobalView; onView: (view: GlobalView) => void; collapsed: boolean; onToggleCollapse: () => void }) {
  const items: Array<{ id: GlobalView; label: string; icon: React.ReactNode }> = [
    { id: "tasks", label: "任务", icon: <ClipboardText size={22} /> },
    { id: "semantic", label: "语义", icon: <ShieldCheck size={22} /> },
    { id: "evaluation", label: "评测", icon: <ShieldCheck size={22} /> },
    { id: "settings", label: "设置", icon: <Gear size={22} /> }
  ];
  return <nav className={`global-rail ${collapsed ? "collapsed" : ""}`} aria-label="全局导航">
    <div className="rail-spacer" />
    {items.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => onView(item.id)} title={item.label}>{item.icon}{!collapsed ? <span>{item.label}</span> : null}</button>)}
    <button className="rail-collapse" title={collapsed ? "展开侧栏" : "收起侧栏"} onClick={onToggleCollapse}><SidebarSimple size={21} /></button>
  </nav>;
}

export function TaskNavigator({ tasks, selectedId, query, onQuery, onSelect, onCreate, onArchive, showAll, onToggleShowAll }: {
  tasks: TaskSummary[]; selectedId?: string; query: string; onQuery: (value: string) => void;
  onSelect: (task: TaskSummary) => void; onCreate: () => void; onArchive: (task: TaskSummary) => void; showAll: boolean; onToggleShowAll: () => void;
}) {
  const filtered = tasks.filter((task) => task.name.toLowerCase().includes(query.toLowerCase()));
  const groups = [
    { label: "进行中", rows: filtered.filter((task) => !task.archived && task.status !== "waiting") },
    { label: "待确认", rows: filtered.filter((task) => !task.archived && task.status === "waiting") },
    { label: "已归档", rows: filtered.filter((task) => task.archived) }
  ];
  return <aside className="task-navigator">
    <AppButton tone="primary" icon={<Plus size={18} />} onClick={onCreate}>新建任务 <kbd>{shortcutModifier}N</kbd></AppButton>
    <div className="search-field"><MagnifyingGlass size={16} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="搜索任务名称..." /><button title="筛选"><ListChecks size={16} /></button></div>
    <div className="task-groups">
      {groups.map((group) => <section key={group.label} className="task-group">
        <header><strong>{group.label}</strong><span>{group.rows.length}</span><CaretDown size={13} /></header>
        {group.rows.slice(0, showAll ? 100 : group.label === "已归档" ? 3 : 6).map((task) => <div key={task.id} className={`task-row ${selectedId === task.id ? "selected" : ""}`}>
          <button className="task-main" onClick={() => onSelect(task)}>
            <span className={`status-dot ${task.status}`} />
            <span className="task-copy"><strong>{task.name}</strong><small>阶段 {task.stageLabel}</small><small>数据 {task.rawCount} / 输出 {task.outputCount}</small></span>
            <span className={`task-state ${task.status}`}>{statusText[task.status]}</span>
            {task.warningCount ? <span className="warning-count">{task.warningCount}</span> : null}
          </button>
          <button className="task-more" title={task.archived ? "恢复" : "归档"} onClick={() => onArchive(task)}><Archive size={14} /></button>
        </div>)}
        {group.rows.length === 0 ? <div className="empty-mini">暂无任务</div> : null}
        {group.rows.length > (group.label === "已归档" ? 3 : 6) ? <button className="show-all-toggle" onClick={onToggleShowAll}>{showAll ? "收起" : `显示全部 ${group.rows.length} 个`}</button> : null}
      </section>)}
    </div>
    <footer className="navigator-footer"><span className="status-dot active" /><strong>本地优先模式</strong><small>全部能力在本地运行</small></footer>
  </aside>;
}

export function TitleBar({ snapshot, query, onQuery, onCheckUpdate, onWorkspace, searchResults, onSelectTask }: { snapshot: AppSnapshot; query: string; onQuery: (value: string) => void; onCheckUpdate: () => void; onWorkspace: () => void; searchResults: GlobalSearchResults; onSelectTask: (task: TaskSummary) => void }) {
  const [searchFocused, setSearchFocused] = useState(false);
  const totalResults = searchResults.tasks.length + searchResults.files.length + searchResults.semantic.length;
  return <header className="titlebar">
    <strong>AI原生数据分析工作台</strong><span className="author-credit">宋冰冰 &amp; Codex</span><span className="version">v{snapshot.version}</span>
    <button className="workspace-switcher" onClick={onWorkspace}>{snapshot.workspaceName}<CaretDown size={13} /></button>
    <button className="update-control" onClick={onCheckUpdate}>{snapshot.update.status === "available" ? `可更新 v${snapshot.update.version}` : snapshot.update.status === "downloading" ? "正在下载更新" : snapshot.update.status === "downloaded" ? "更新已下载" : "检查更新"}<span className={`status-dot ${["available", "downloaded"].includes(snapshot.update.status) ? "warning" : "active"}`} /></button>
    <div className="command-search"><MagnifyingGlass size={15} /><input aria-label="全局搜索" value={query} onChange={(event) => onQuery(event.target.value)} onFocus={() => setSearchFocused(true)} onBlur={() => setTimeout(() => setSearchFocused(false), 200)} placeholder={`${shortcutModifier}K 搜索任务、文件、指标、语义...`} />{searchFocused && query.trim() && totalResults > 0 ? <div className="search-dropdown">
      {searchResults.tasks.length ? <div className="search-group"><strong>任务</strong>{searchResults.tasks.slice(0, 5).map((t) => <button key={t.id} onMouseDown={() => onSelectTask(t)}><ClipboardText size={14} /><span>{t.name}</span><small>{t.stageLabel}</small></button>)}</div> : null}
      {searchResults.files.length ? <div className="search-group"><strong>文件</strong>{searchResults.files.slice(0, 5).map((f, i) => <div key={i}><ClipboardText size={14} /><span>{f.taskName}</span><small>{f.fileName}</small></div>)}</div> : null}
      {searchResults.semantic.length ? <div className="search-group"><strong>语义</strong>{searchResults.semantic.slice(0, 5).map((s, i) => <div key={i}><ShieldCheck size={14} /><span>{s.doc}</span><small>{s.entry}</small></div>)}</div> : null}
    </div> : null}{searchFocused && query.trim() && totalResults === 0 ? <div className="search-dropdown"><div className="search-empty">未找到匹配结果</div></div> : null}</div>
    <Bell size={17} /><span className="avatar">宋</span><span className="author">宋冰冰</span><CaretDown size={12} />
  </header>;
}

export function TaskHeader({ task, onReveal, onContinue, onEvaluate }: { task: TaskDetail; onReveal: () => void; onContinue: () => void; onEvaluate: () => void }) {
  const suggestion = nextStepSuggestion(task);
  return <>
    <div className="task-header"><div><h1>{task.name}<span className="status-dot active" /></h1><p>{task.path}</p></div><AppButton icon={<FolderOpen size={17} />} onClick={onReveal}>在 Finder 中打开</AppButton></div>
    <div className="next-action"><Sparkle size={20} /><strong>下一步建议：</strong><span>{suggestion}</span><AppButton tone="primary" icon={<Robot size={17} />} onClick={onContinue}>继续分析</AppButton><AppButton icon={<ShieldCheck size={17} />} onClick={onEvaluate}>运行后台抽查</AppButton></div>
  </>;
}

function nextStepSuggestion(task: TaskDetail): string {
  const pendingValidation = (task.validation || []).filter((v) => v.status !== "resolved").length;
  if (task.stage === "data" || task.rawFiles.length === 0) return "添加原始资料文件，确认来源可信度后进入分析阶段";
  if (task.stage === "analysis" || (task.firstRun.status !== "已完成" && task.outputs.length === 0)) return "完善分析目标与输出边界，复制首次分析调度单或直接执行";
  if (task.stage === "four-piece") return "检查四件套（分析请求、来源清单、口径映射、验证清单）是否补齐";
  if (pendingValidation > 0) return `有 ${pendingValidation} 个验证项待处理，录入确认结果后按需重分析`;
  if (task.firstRun.status === "已完成" && task.outputs.length > 0 && task.stage !== "delivery") return "分析已完成，进入交付阶段生成 Word 或 HTML 报告";
  if (task.evaluation.score == null) return "运行后台抽查，确认文件可读、来源已登记、输出有追溯痕迹";
  if (task.evaluation.score != null && task.evaluation.score < 80) return `评测得分 ${task.evaluation.score}，建议检查低分项并重分析`;
  return "任务流程完整，可归档或开始新任务";
}

export function stageGate(task: TaskDetail, stage: StageId): string | null {
  const hasAnalysis = task.firstRun.status === "已完成" || task.outputs.length > 0;
  const hasRaw = task.rawFiles.length > 0;
  if (!hasRaw && (stage === "analysis" || stage === "four-piece" || stage === "validation" || stage === "delivery" || stage === "evaluation")) {
    return "当前任务尚无原始资料。你可以继续操作，但建议先在「02 资料」添加文件。";
  }
  if (!hasAnalysis && (stage === "four-piece" || stage === "validation" || stage === "delivery" || stage === "evaluation")) {
    return "尚未完成首次分析（无输出文件、无执行回执）。你可以继续操作，但建议先在「03 分析」生成初版报告。";
  }
  return null;
}

export function StageNav({ active, task, onStage }: { active: StageId; task: TaskDetail; onStage: (stage: StageId) => void }) {
  const activeIndex = STAGES.findIndex((stage) => stage.id === active);
  return <div className="stage-row"><nav className="stage-nav" aria-label="任务阶段">
    {STAGES.map((stage, index) => <button key={stage.id} className={active === stage.id ? "active" : index < activeIndex ? "complete" : ""} onClick={() => onStage(stage.id)}>
      <span>{stage.number}</span><strong>{stage.title}</strong><small>{stage.subtitle}</small>{index < activeIndex ? <CheckCircle size={13} weight="fill" /> : null}
    </button>)}
  </nav><div className="stage-signals"><button onClick={() => onStage("validation")}><WarningCircle size={15} />语义冲突 <b>{task.semanticConflicts}</b></button><button onClick={() => onStage("evaluation")}><ShieldCheck size={15} />AI评测 <strong>{task.evaluation.score || "-"}</strong><small>/100</small></button></div></div>;
}

export function StatusBar({ task }: { task: TaskDetail }) {
  const evaluationScore = task.evaluation.score;
  const health = evaluationScore == null ? "未评测" : evaluationScore >= 80 ? "健康" : evaluationScore >= 60 ? "亚健康" : "需关注";
  const healthColor = evaluationScore == null ? "#7b8b94" : evaluationScore >= 80 ? "#4f9d76" : evaluationScore >= 60 ? "#c08a30" : "#c44";
  const backendStatus = task.status === "active" ? "运行中" : task.status === "warning" ? "异常" : "空闲中";
  return <footer className="statusbar"><span><ShieldCheck size={15} color={healthColor} />工作区健康 <b>{health}</b></span><span>文件总数 <b>{task.rawCount}</b></span><span>资料完整度 <b>{task.inputCompleteness}</b></span><span>语义覆盖率 <b>{task.semanticCoverage}%</b></span><span>后台检查 <b>{backendStatus}</b></span></footer>;
}

export function NewTaskModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState(""); const [busy, setBusy] = useState(false);
  return <div className="modal-backdrop" role="presentation" onMouseDown={() => { if (!busy) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-task-title" onMouseDown={(event) => event.stopPropagation()}><header><h2 id="new-task-title">新建分析任务</h2><button onClick={onClose} disabled={busy}><X size={18} /></button></header><label className="field-label">任务名称<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：2026M07_H64经营分析" disabled={busy} /></label><p>将创建独立的投喂区、raw、working、notes、outputs 和 validation 目录。</p><footer><AppButton onClick={onClose} disabled={busy}>取消</AppButton><AppButton tone="primary" disabled={!name.trim() || busy} onClick={async () => { setBusy(true); try { await onCreate(name.trim()); } catch { setBusy(false); } }}>{busy ? "创建中" : "创建任务"}</AppButton></footer></section></div>;
}
