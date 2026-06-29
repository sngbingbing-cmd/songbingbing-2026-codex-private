import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive, ArrowClockwise, Bell, BookOpenText, CaretDown, CaretRight, Check,
  CheckCircle, ClipboardText, ClockCounterClockwise, Copy, Database, File, FileCsv,
  FileDoc, FileMd, Files, Folder, FolderOpen, Gear, HardDrives, ListChecks, MagnifyingGlass,
  Plus, Robot, ShieldCheck, SidebarSimple, Sparkle, SquaresFour, UploadSimple,
  WarningCircle, X
} from "@phosphor-icons/react";
import { api } from "./api";
import type { AppSnapshot, ExternalSourceInfo, FileEntry, GlobalView, PromptDraft, SemanticCandidate, SemanticSnapshot, StageId, TaskDetail, TaskSummary } from "./types";

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

function IconForFile({ file }: { file: FileEntry }) {
  const props = { size: 20, weight: "duotone" as const };
  if (file.type === "xlsx" || file.type === "csv") return <FileCsv {...props} color="#2d9b65" />;
  if (file.type === "docx") return <FileDoc {...props} color="#5c78aa" />;
  if (file.type === "md") return <FileMd {...props} color="#54789b" />;
  return <File {...props} />;
}

function Spinner() { return <span className="spinner" aria-label="加载中" />; }

function AppButton({ children, icon, tone = "default", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode; tone?: "default" | "primary" | "ghost" | "danger" }) {
  return <button className={`button button-${tone}`} {...props}>{icon}{children}</button>;
}

function GlobalRail({ view, onView }: { view: GlobalView; onView: (view: GlobalView) => void }) {
  const items: Array<{ id: GlobalView; label: string; icon: React.ReactNode }> = [
    { id: "tasks", label: "任务", icon: <ClipboardText size={22} /> },
    { id: "semantic", label: "语义", icon: <BookOpenText size={22} /> },
    { id: "evaluation", label: "评测", icon: <ShieldCheck size={22} /> },
    { id: "settings", label: "设置", icon: <Gear size={22} /> }
  ];
  return <nav className="global-rail" aria-label="全局导航">
    <div className="rail-spacer" />
    {items.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => onView(item.id)} title={item.label}>{item.icon}<span>{item.label}</span></button>)}
    <button className="rail-collapse" title="收起侧栏"><SidebarSimple size={21} /></button>
  </nav>;
}

function TaskNavigator({ tasks, selectedId, query, onQuery, onSelect, onCreate, onArchive }: {
  tasks: TaskSummary[]; selectedId?: string; query: string; onQuery: (value: string) => void;
  onSelect: (task: TaskSummary) => void; onCreate: () => void; onArchive: (task: TaskSummary) => void;
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
        {group.rows.slice(0, group.label === "已归档" ? 3 : 6).map((task) => <div key={task.id} className={`task-row ${selectedId === task.id ? "selected" : ""}`}>
          <button className="task-main" onClick={() => onSelect(task)}>
            <span className={`status-dot ${task.status}`} />
            <span className="task-copy"><strong>{task.name}</strong><small>阶段 {task.stageLabel}</small><small>数据 {task.rawCount} / 输出 {task.outputCount}</small></span>
            <span className={`task-state ${task.status}`}>{statusText[task.status]}</span>
            {task.warningCount ? <span className="warning-count">{task.warningCount}</span> : null}
          </button>
          <button className="task-more" title={task.archived ? "恢复" : "归档"} onClick={() => onArchive(task)}><Archive size={14} /></button>
        </div>)}
        {group.rows.length === 0 ? <div className="empty-mini">暂无任务</div> : null}
      </section>)}
    </div>
    <footer className="navigator-footer"><span className="status-dot active" /><strong>本地优先模式</strong><small>全部能力在本地运行</small></footer>
  </aside>;
}

function TitleBar({ snapshot, query, onQuery, onCheckUpdate, onWorkspace }: { snapshot: AppSnapshot; query: string; onQuery: (value: string) => void; onCheckUpdate: () => void; onWorkspace: () => void }) {
  return <header className="titlebar">
    <strong>AI原生数据分析工作台</strong><span className="author-credit">宋冰冰 &amp; Codex</span><span className="version">v{snapshot.version}</span>
    <button className="workspace-switcher" onClick={onWorkspace}>{snapshot.workspaceName}<CaretDown size={13} /></button>
    <button className="update-control" onClick={onCheckUpdate}>{snapshot.update.status === "available" ? `可更新 v${snapshot.update.version}` : snapshot.update.status === "downloading" ? "正在下载更新" : snapshot.update.status === "downloaded" ? "更新已下载" : "检查更新"}<span className={`status-dot ${["available", "downloaded"].includes(snapshot.update.status) ? "warning" : "active"}`} /></button>
    <div className="command-search"><MagnifyingGlass size={15} /><input aria-label="全局搜索" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={`${shortcutModifier}K 搜索任务、文件、指标、语义...`} /></div>
    <Bell size={17} /><span className="avatar">宋</span><span className="author">宋冰冰</span><CaretDown size={12} />
  </header>;
}

function TaskHeader({ task, onReveal, onContinue, onEvaluate }: { task: TaskDetail; onReveal: () => void; onContinue: () => void; onEvaluate: () => void }) {
  return <>
    <div className="task-header"><div><h1>{task.name}<span className="status-dot active" /></h1><p>{task.path}</p></div><AppButton icon={<FolderOpen size={17} />} onClick={onReveal}>在 Finder 中打开</AppButton></div>
    <div className="next-action"><Sparkle size={20} /><strong>下一步建议：</strong><span>完善分析目标与输出边界，然后复制首次分析调度单</span><AppButton tone="primary" icon={<Robot size={17} />} onClick={onContinue}>继续分析</AppButton><AppButton icon={<ShieldCheck size={17} />} onClick={onEvaluate}>运行后台抽查</AppButton></div>
  </>;
}

function StageNav({ active, task, onStage }: { active: StageId; task: TaskDetail; onStage: (stage: StageId) => void }) {
  const activeIndex = STAGES.findIndex((stage) => stage.id === active);
  return <div className="stage-row"><nav className="stage-nav" aria-label="任务阶段">
    {STAGES.map((stage, index) => <button key={stage.id} className={active === stage.id ? "active" : index < activeIndex ? "complete" : ""} onClick={() => onStage(stage.id)}>
      <span>{stage.number}</span><strong>{stage.title}</strong><small>{stage.subtitle}</small>{index < activeIndex ? <CheckCircle size={13} weight="fill" /> : null}
    </button>)}
  </nav><div className="stage-signals"><button onClick={() => onStage("validation")}><WarningCircle size={15} />语义冲突 <b>{task.semanticConflicts}</b></button><button onClick={() => onStage("evaluation")}><ShieldCheck size={15} />AI评测 <strong>{task.evaluation.score || "-"}</strong><small>/100</small></button></div></div>;
}

function ContextPane({ task, onPick }: { task: TaskDetail; onPick: () => void }) {
  const [tab, setTab] = useState<"files" | "semantic" | "skill">("files");
  return <section className="context-pane pane">
    <h2>输入与上下文</h2>
    <div className="segmented"><button className={tab === "files" ? "active" : ""} onClick={() => setTab("files")}>文件</button><button className={tab === "semantic" ? "active" : ""} onClick={() => setTab("semantic")}>语义</button><button className={tab === "skill" ? "active" : ""} onClick={() => setTab("skill")}>Skill</button></div>
    {tab === "files" ? <>
      <div className="pane-section-title"><strong>原始文件 ({task.rawFiles.length})</strong><AppButton tone="ghost" icon={<Plus size={14} />} onClick={onPick}>添加</AppButton></div>
      <div className="file-list">{task.rawFiles.map((file, index) => <button key={file.path} className={`file-row ${index === 0 ? "selected" : ""}`}><IconForFile file={file} /><span><strong>{file.name}</strong><small>{file.sizeKb} KB · {file.modifiedAt}</small></span><em>{file.trust || "-"}</em></button>)}</div>
      <div className="context-summary"><header><strong>源可信度</strong><span><ShieldCheck size={14} /> 高可信</span></header><p>{task.rawFiles.length} 个文件来自本地上传，未检测到冲突或完整性异常。</p></div>
      <div className="context-summary"><header><strong>语义定义</strong><AppButton tone="ghost">管理</AppButton></header><p>已加载当前工作区的指标口径、实体字典和数据源登记。</p></div>
      <div className="context-summary"><header><strong>领域（Skill）</strong><AppButton tone="ghost">切换</AppButton></header><p><b>{task.domainSkill}</b><br />已加载领域规则、分析模板与校验逻辑。</p></div>
      <button className="dropzone" onClick={onPick}><UploadSimple size={25} /><strong>拖拽文件到此处，或点击添加</strong><span>支持 .md .xlsx .csv .txt</span></button>
    </> : tab === "semantic" ? <div className="context-tab-content"><BookOpenText size={28} /><h3>当前语义上下文</h3><p>读取工作区正式语义；没有正式条目时，AI仍可分析并提出待确认候选。</p><AppButton>打开语义中心</AppButton></div> : <div className="context-tab-content"><Robot size={28} /><h3>{task.domainSkill}</h3><p>覆盖输入识别、口径约束、分析框架、验证规则与输出标准。</p><AppButton>查看 Skill</AppButton></div>}
  </section>;
}

function AnalysisEditor({ task, promptPreview, previewSource, onCopy, onDispatch, onSave }: { task: TaskDetail; promptPreview: string; previewSource: "copy" | "dispatch" | null; onCopy: (draft: PromptDraft) => void; onDispatch: (draft: PromptDraft) => void; onSave: (draft: PromptDraft) => void }) {
  const [goal, setGoal] = useState("基于提供的资料，完成示例经营单元的首次分析，形成初版报告、关键结论、证据和待验证问题。");
  const [thinking, setThinking] = useState("从结构、趋势、异常、对比四个维度展开；主动寻找反例与替代解释；结合历史口径变化，关注指标一致性与可比性。");
  const [verification, setVerification] = useState("严格使用资料所载口径与单位；无法判断的内容明确标注并提出补充；关键结论必须注明来源文件与行/列。");
  const draft = (): PromptDraft => ({ goal, thinking, verification });
  return <section className="editor-pane pane">
    <header className="editor-head"><div><h2>首次分析调度单</h2><p>生成时间：2026-06-24 10:21　任务：{task.name}</p></div><div><AppButton tone="ghost">模板</AppButton><AppButton tone="ghost">清空</AppButton><AppButton tone="ghost" icon={<Copy size={14} />} onClick={() => onCopy(draft())}>复制</AppButton><AppButton tone="ghost" onClick={() => onSave(draft())}>保存草稿</AppButton></div></header>
    <div className="editor-scroll">
      <PromptSection number="1" title="必须补充"><div className="mini-table"><span>序号</span><span>补充项</span><span>当前状态</span><span>影响</span><span>建议返回格式</span><i>--</i><i>--</i><i>--</i><i>--</i><i>--</i></div></PromptSection>
      <div className="prompt-variables"><header><strong>Prompt 变量</strong><AppButton tone="ghost">管理</AppButton></header><div><span><b>任务ID</b>{task.name}</span><span><b>领域</b>通用经营分析</span><span><b>报告期间</b>202606</span><span><b>输出粒度</b>万元</span><span><b>单位风险阈值</b>未设置</span><button>+ 添加变量</button></div></div>
      <PromptSection number="2" title="分析目标与范围"><textarea value={goal} onChange={(event) => setGoal(event.target.value)} /></PromptSection>
      <PromptSection number="3" title="分析思路（AI 创造力引导）"><textarea value={thinking} onChange={(event) => setThinking(event.target.value)} /></PromptSection>
      <PromptSection number="4" title="校验与验证要求"><textarea value={verification} onChange={(event) => setVerification(event.target.value)} /></PromptSection>
      <PromptSection number="5" title="03 分析输出（四件套在 04 收工补齐）"><div className="output-checks"><label><input type="checkbox" defaultChecked />Markdown 初版报告</label><label><input type="checkbox" defaultChecked />关键结论与证据</label><label><input type="checkbox" defaultChecked />待验证问题</label><label><input type="checkbox" defaultChecked />执行回执</label></div></PromptSection>
    </div>
    <div className="dispatch-difference"><div><strong>两个按钮使用同一份提示词</strong><span>复制调度单：只复制，不改变任务状态。</span></div><div><span>开始外部分析：复制提示词，同时登记为“等待外部 Agent 回执”。</span></div></div>
    {promptPreview ? <section className="analysis-prompt-preview"><header><div><strong>调度单预览</strong><span>{previewSource === "dispatch" ? "已登记外部分析，等待回执" : "仅预览并复制，尚未登记执行"}</span></div><AppButton icon={<Copy size={14} />} onClick={async () => navigator.clipboard.writeText(promptPreview)}>再次复制</AppButton></header><pre>{promptPreview}</pre></section> : null}
    <footer className="editor-actions"><AppButton icon={<Copy size={16} />} onClick={() => onCopy(draft())}>复制调度单并预览</AppButton><AppButton tone="primary" icon={<Robot size={17} />} onClick={() => onDispatch(draft())}>开始外部分析并预览</AppButton></footer>
  </section>;
}

function PromptSection({ number, title, children }: { number: string; title: string; children: React.ReactNode }) { return <section className="prompt-section"><h3>{number}. {title}</h3>{children}</section>; }

function ReceiptPane({ task, onReveal, onRefresh }: { task: TaskDetail; onReveal: () => void; onRefresh: () => void }) {
  const pendingCount = (task.validation || []).filter((item: any) => item.status !== "resolved").length;
  const resolvedCount = (task.validation || []).filter((item: any) => item.status === "resolved").length;
  return <section className="receipt-pane pane"><h2>执行与回执</h2>
    <div className="receipt-block"><header><strong>执行状态</strong><button onClick={onRefresh} title="刷新回执"><ArrowClockwise size={14} /></button></header>
      <div className="receipt-row"><CheckCircle size={15} color="#5ca97c" /><span>首次分析</span><b>{task.firstRun.status}</b></div>
      <div className="receipt-row"><ClockCounterClockwise size={15} color="#7b8b94" /><span>重分析</span><b>{task.reanalysis.status}</b></div>
      <div className="receipt-row"><Files size={15} color="#7b8b94" /><span>正式输出</span><b>{task.outputs.length}</b></div>
    </div>
    <div className="receipt-block"><header><strong>最近回执</strong></header><p>{task.firstRun.receipt || "暂无回执记录"}</p></div>
    <div className="receipt-block"><header><strong>验证项（系统自动刷新）</strong><button>查看全部</button></header><p>待处理 {pendingCount} / 已解决 {resolvedCount}</p></div>
    <div className="receipt-block output-preview"><header><strong>输出预览（执行后生成）</strong></header><p>{task.outputs.length ? `最近输出：${task.outputs[0].name}` : "暂无输出内容，执行后可在此预览结果摘要。"}</p></div>
    <AppButton icon={<FolderOpen size={16} />} onClick={onReveal}>打开输出目录</AppButton>
  </section>;
}

function AnalysisStage({ task, notify, refresh }: { task: TaskDetail; notify: (message: string) => void; refresh: (task: TaskDetail) => void }) {
  const [promptPreview, setPromptPreview] = useState(""); const [previewSource, setPreviewSource] = useState<"copy" | "dispatch" | null>(null);
  const copyPrompt = async (draft: PromptDraft) => { const prompt = await api.generatePrompt(task.id, "analysis", draft); setPromptPreview(prompt); setPreviewSource("copy"); try { await navigator.clipboard.writeText(prompt); notify("首次分析调度单已复制并显示预览"); } catch { notify("已显示调度单预览，可点击预览区再次复制"); } };
  const dispatchPrompt = async (draft: PromptDraft) => { const prompt = await api.dispatchPrompt(task.id, "analysis", draft); setPromptPreview(prompt); setPreviewSource("dispatch"); refresh(await api.getTask(task.id)); try { await navigator.clipboard.writeText(prompt); notify("调度单已复制并登记执行，等待外部 Agent 回执"); } catch { notify("已登记执行并显示预览，请从预览区复制调度单"); } };
  const refreshReceipt = async () => { refresh(await api.getTask(task.id)); notify("执行状态已刷新"); };
  const saveDraft = async (draft: PromptDraft) => { await api.saveFile(`${task.path}/notes/prompt-draft.json`, JSON.stringify(draft, null, 2)); notify("调度单草稿已保存"); };
  return <div className="analysis-canvas"><ContextPane task={task} onPick={async () => refresh(await api.pickFiles(task.id, "raw"))} /><div className="resize-handle" /><AnalysisEditor task={task} promptPreview={promptPreview} previewSource={previewSource} onCopy={copyPrompt} onDispatch={dispatchPrompt} onSave={saveDraft} /><div className="resize-handle" /><ReceiptPane task={task} onReveal={() => api.revealPath(`${task.path}/outputs`)} onRefresh={refreshReceipt} /></div>;
}

function OverviewStage({ task, setStage }: { task: TaskDetail; setStage: (stage: StageId) => void }) {
  const pCount = (task.validation || []).filter((item: any) => item.status !== "resolved").length;
  const rCount = (task.validation || []).filter((item: any) => item.status === "resolved").length;
  return <div className="overview-grid"><section className="work-section span-two"><header><div><h2>下一步队列</h2><span>按阻塞优先</span></div><b>{pCount} 项待处理 / {rCount} 项已处理</b></header>{task.validation.map((item) => <div className="action-row" key={item.id}><span className={`tag ${item.status === 'resolved' ? 'ok' : 'warning'}`}>{item.status === 'resolved' ? '已处理' : '验证'}</span><div><strong>{item.title}</strong><small>{item.description}</small></div><b>{item.status === 'resolved' ? '中' : '高'}</b>{item.status !== 'resolved' ? <button onClick={() => setStage("validation")}>去处理</button> : <span style={{color:'#888',fontSize:'9px'}}>已确认</span>}</div>)}</section>
    <section className="work-section"><header><h2>语义冲突（全局共识）</h2><b>{task.semanticConflicts}</b></header><div className="metric-line"><span>口径映射不一致</span><em>高</em></div><div className="metric-line"><span>指标命名冲突</span><em>中</em></div></section>
    <section className="work-section span-two"><header><h2>输入就绪度</h2><span>最近 2026-06-24 10:12</span></header>{["结构化数据", "补充口径", "业务确认", "行动进度"].map((item, index) => <div className="readiness-row" key={item}><CheckCircle size={15} color={index < 2 ? "#4f9d76" : "#c08a30"} /><strong>{item}</strong><span>{index < 2 ? "已就绪" : "部分缺失"}</span><button onClick={() => setStage(index < 2 ? "data" : "validation")}>{index < 2 ? "查看" : "去补齐"}</button></div>)}</section>
    <section className="work-section score-section"><header><h2>AI评测（抽查得分）</h2></header><strong className="score">{task.evaluation.score}<small>/100</small></strong><p>事实性 82　准确性 76<br />一致性 72　可执行性 82</p><button onClick={() => setStage("evaluation")}>查看详细评测</button></section>
    <section className="work-section span-two"><header><h2>最近一次AI执行回执</h2><span className="tag ok">成功</span></header><p>执行阶段：验证与回流（第二次执行）　耗时：3分12秒　模型：外部主责Agent</p></section>
    <section className="work-section"><header><h2>来源覆盖度</h2></header><Progress label="结构化来源覆盖" value={task.sourceCoverage} /><Progress label="语义口径覆盖" value={task.semanticCoverage} /></section></div>;
}

function Progress({ label, value }: { label: string; value: number }) { return <div className="progress-row"><span>{label}</span><i><b style={{ width: `${value}%` }} /></i><strong>{value}%</strong></div>; }

function ExternalSourcesModule({ taskId, notify }: { taskId: string; notify: (m: string) => void }) {
  const [sources, setSources] = useState<ExternalSourceInfo[]>([]);
  const [processingPaths, setProcessingPaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const loadSources = useCallback(async () => { setLoading(true); setSources(await api.getExternalSources(taskId)); setLoading(false); }, [taskId]);
  useEffect(() => { loadSources(); }, [loadSources]);

  const handleLink = async () => {
    const dir = await api.pickDirectory();
    if (!dir) return;
    try {
      await api.linkExternalSource(taskId, dir);
      notify("外部目录已关联");
      await loadSources();
    } catch (e: any) {
      notify(e.message || "关联失败");
    }
  };

  const handleRefresh = async (path: string) => {
    setProcessingPaths((prev) => new Set(prev).add(path));
    try {
      await api.refreshExternalSource(taskId, path);
      notify("目录已刷新");
      await loadSources();
    } catch (e: any) {
      notify(e.message || "刷新失败");
    }
    setProcessingPaths((prev) => { const next = new Set(prev); next.delete(path); return next; });
  };

  const handleUnlink = async (path: string) => {
    if (!window.confirm("解除关联不会删除原始目录。确认解除？")) return;
    try {
      await api.unlinkExternalSource(taskId, path);
      notify("已解除关联");
      await loadSources();
    } catch (e: any) {
      notify(e.message || "解除关联失败");
    }
  };

  const trunc = (p: string, max = 50) => p.length <= max ? p : p.slice(0, 22) + "…" + p.slice(-26);
  const scanTime = (value: string) => new Date(value).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  });

  if (loading) return <section className="work-section external-sources-section external-sources-loading"><Spinner /><span>正在读取关联目录</span></section>;

  return <section className="work-section external-sources-section">
    <header><div><h2>外部资料目录</h2><span>{sources.length} 个关联目录</span></div><AppButton tone="primary" icon={<Folder size={16} />} onClick={handleLink}>关联目录</AppButton></header>
    {sources.length === 0 ? <div className="external-sources-empty">
      <Folder size={28} /><strong>尚未关联外部资料目录</strong><span>关联后可通过 AI 调度提示词让外部 Agent 递归读取</span>
    </div> : <div className="external-sources-list">
      {sources.map((source) => <div key={source.path} className="external-source-row">
        <div className="external-source-info">
          <div className="external-source-path"><FolderOpen size={18} /><span title={source.path}>{trunc(source.path)}</span></div>
          <div className="external-source-meta">
            <span title="顶层目录">{source.topLevelItems.filter((i) => i.isDirectory).length} 个顶层目录</span><span>{source.totalFiles} 个文件</span>
            <span>{source.totalSizeKb >= 1024 ? (source.totalSizeKb / 1024).toFixed(1) + " MB" : source.totalSizeKb + " KB"}</span>
            {source.anomalies.length > 0 ? <span className="anomaly-badge" title={source.anomalies.join("\n")}><WarningCircle size={14} />{source.anomalies.length} 个异常</span> : <span className="scan-ok">扫描正常</span>}
          </div>
          <div className="external-source-dirs">
            <span>目录: {source.topLevelItems.filter((i) => i.isDirectory).slice(0, 4).map((i) => i.name).join("、")}{source.topLevelItems.filter((i) => i.isDirectory).length > 4 ? ` 等 ${source.topLevelItems.filter((i) => i.isDirectory).length} 个` : ""}</span>
          </div>
          <div className="external-source-scan"><span>扫描于 {scanTime(source.lastScannedAt)}</span></div>
        </div>
        <div className="external-source-actions">
          <button className="source-action-btn" title="重新扫描" onClick={() => handleRefresh(source.path)} disabled={processingPaths.has(source.path)}>{processingPaths.has(source.path) ? <Spinner /> : <ArrowClockwise size={16} />}</button>
          <button className="source-action-btn" title="在 Finder 中显示" onClick={() => api.revealExternalSource(taskId, source.path)}><MagnifyingGlass size={16} /></button>
          <button className="source-action-btn danger" title="解除关联" onClick={() => handleUnlink(source.path)}><X size={16} /></button>
        </div>
      </div>)}
    </div>}
  </section>;
}

function DataStage({ task, refresh, notify }: { task: TaskDetail; refresh: (task: TaskDetail) => void; notify: (m: string) => void }) {
  return <div className="data-stage-wrapper">
    <div className="two-column-stage"><section className="work-section"><header><div><h2>文件投喂</h2><span>进入投喂区后再同步至正式 raw</span></div><AppButton tone="primary" icon={<Plus size={16} />} onClick={async () => refresh(await api.pickFiles(task.id, "inbox"))}>选择文件</AppButton></header><button className="large-dropzone" onClick={async () => refresh(await api.pickFiles(task.id, "inbox"))}><UploadSimple size={32} /><strong>拖拽或点击选择文件</strong><span>支持 Excel、Word、PDF、PPT、Markdown、CSV</span></button></section>
    <section className="work-section"><header><div><h2>输入状态</h2><span>资料完整度 {task.inputCompleteness}</span></div><AppButton icon={<ArrowClockwise size={16} />} onClick={async () => { refresh(await api.syncFiles(task.id)); notify("已同步到 raw"); }}>同步到 raw</AppButton></header><div className="file-table"><div className="file-table-head"><span>文件名</span><span>区域</span><span>可信度</span><span>更新时间</span></div>{task.rawFiles.map((file) => <div key={file.path}><span><IconForFile file={file} />{file.name}</span><span>raw</span><span>{file.trust}</span><span>{file.modifiedAt}</span></div>)}</div></section></div>
    <ExternalSourcesModule taskId={task.id} notify={notify} />
  </div>;
}

function FourPieceStage({ task, refresh, notify }: { task: TaskDetail; refresh: (task: TaskDetail) => void; notify: (m: string) => void }) {
  const [mode, setMode] = useState<"manual" | "ai">("manual");
  const [selected, setSelected] = useState(task.requiredDocs[0]); const [content, setContent] = useState(selected?.content || ""); const [savedContent, setSavedContent] = useState(selected?.content || "");
  const [promptPreview, setPromptPreview] = useState("");
  const choose = async (doc: typeof selected) => { const value = doc.content || await api.readFile(doc.path); setSelected(doc); setContent(value); setSavedContent(value); setPromptPreview(""); };
  const previewCompletion = async (scope: string) => { const prompt = await api.generatePrompt(task.id, "four-piece", { goal: scope, thinking: "基于现有资料、初版报告和验证记录补齐，不编造缺失事实。", verification: "无法确认的内容写入待验证项，正式保存前由人工复核。" }); setPromptPreview(prompt); };
  const save = async () => { if (!selected) return; await api.saveFile(selected.path, content); const next = await api.getTask(task.id); refresh(next); const updated = next.requiredDocs.find((doc) => doc.path === selected.path); if (updated) setSelected(updated); setSavedContent(content); notify(`${selected.name} 已手工保存，仍可继续修改`); };
  return <div className="four-piece-stage">
    <section className="closeout-guide"><div><span>03 已生成初版分析</span><CaretRight size={14} /><strong>04 收工补齐四件套</strong><CaretRight size={14} /><span>05 验证并决定是否重分析</span></div><p>本步骤只整理分析依据和验证要求，不重新生成分析报告。</p></section>
    <div className="completion-mode" role="tablist" aria-label="四件套补齐方式"><button className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}><ClipboardText size={18} /><span><strong>手工补齐</strong><small>在工作区内选择文件、录入并保存</small></span></button><button className={mode === "ai" ? "active" : ""} onClick={() => setMode("ai")}><Robot size={18} /><span><strong>AI 辅助补齐</strong><small>复制明确范围的调度单，交给外部 Agent</small></span></button></div>
    <div className="document-workspace"><aside><div className="four-piece-head"><div><h2>选择要补齐的文件</h2><small>{task.requiredDocs.filter((doc) => doc.filled).length}/4 已有内容</small></div>{mode === "ai" ? <AppButton icon={<Robot size={15} />} onClick={() => previewCompletion("检查并补齐全部四件套")}>AI补齐全部</AppButton> : null}</div>{task.requiredDocs.map((doc) => <label className={selected?.path === doc.path ? "doc-choice active" : "doc-choice"} key={doc.path}><input type="radio" name="four-piece-doc" checked={selected?.path === doc.path} onChange={() => choose(doc)} /><FileMd size={18} /><span><strong>{doc.name}</strong><small>{doc.filled ? "已有内容，可继续修改" : "尚未补齐"}</small></span><CaretRight size={14} /></label>)}</aside>
      {mode === "manual" ? <section className="document-editor"><header><div><h2>手工录入：{selected?.name}</h2><p>{content !== savedContent ? "有未保存修改" : "内容已与磁盘同步"}</p></div><div className="inline-actions"><AppButton icon={<UploadSimple size={15} />} onClick={async () => { refresh(await api.pickFiles(task.id, "notes/four-piece-support")); notify("佐证文件已上传到 notes/four-piece-support"); }}>上传佐证</AppButton><AppButton disabled={content === savedContent} onClick={() => { setContent(savedContent); notify("已撤回本次未保存修改"); }}>撤回修改</AppButton><AppButton tone="primary" disabled={content === savedContent} onClick={save}>保存本文件</AppButton></div></header><label className="manual-entry"><span>手工录入工作区</span><textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="在这里补充内容。表格和勾选项可以直接按 Markdown 格式录入。" /></label></section>
      : <section className="ai-completion-panel"><header><div><h2>AI 提示词预览</h2><p>先选择补齐当前或全部，再检查提示词并复制。</p></div><div className="inline-actions"><AppButton icon={<Robot size={15} />} onClick={() => selected && previewCompletion(`只检查并补齐 ${selected.name}；其他四件套文件不得修改`)}>AI补齐当前</AppButton><AppButton disabled={!promptPreview} tone="primary" icon={<Copy size={15} />} onClick={async () => { await navigator.clipboard.writeText(promptPreview); notify("AI补齐调度单已复制"); }}>复制调度单</AppButton></div></header><div className="ai-scope"><span>当前选择</span><strong>{selected?.name}</strong><small>“AI补齐当前”只允许修改此文件；“AI补齐全部”会检查四个文件。</small></div><pre className={promptPreview ? "prompt-preview" : "prompt-preview empty"}>{promptPreview || "点击“AI补齐当前”或左侧“AI补齐全部”后，在这里预览完整调度单。"}</pre><small className="ai-refresh-note">外部 Agent 执行完成后，切回手工补齐检查并修改结果。</small></section>}
    </div>
  </div>;
}

function ValidationStage({ task, refresh, notify }: { task: TaskDetail; refresh: (task: TaskDetail) => void; notify: (m: string) => void }) {
  const pending = task.validation.filter((item) => item.status !== "resolved");
  const resolved = task.validation.filter((item) => item.status === "resolved");
  const [selectedId, setSelectedId] = useState(pending[0]?.id || "general"); const [feedback, setFeedback] = useState("");
  const selected = task.validation.find((item) => item.id === selectedId);
  useEffect(() => { if (selectedId !== "general" && !task.validation.some((item) => item.id === selectedId && item.status !== "resolved")) setSelectedId(pending[0]?.id || "general"); }, [task.validation, selectedId]);
  const dispatch = async () => { const prompt = await api.dispatchPrompt(task.id, "reanalysis"); await navigator.clipboard.writeText(prompt); refresh(await api.getTask(task.id)); notify("重分析调度单已复制，外部 Agent 将读取验证补充后重做报告"); };
  const submit = async () => { if (!feedback.trim()) return; const question = selected?.title || "通用补充"; const body = `# 人工确认与补充\n\n## 对应问题\n${question}\n\n## 用户补充\n${feedback.trim()}\n`; refresh(await api.writeFeedback(task.id, selected?.id || "general", body)); setFeedback(""); notify("补充已写入，下一次重分析会自动读取"); };
  return <div className="validation-stage"><section className="closeout-guide"><div><span>03 初版分析</span><CaretRight size={14} /><span>04 四件套已收工</span><CaretRight size={14} /><strong>05 人工验证与回流</strong></div><p>先记录确认结果；只有结论需要改变时才发起重分析。</p></section><div className="validation-workspace"><section className="validation-queue"><header><h2>第一步：选择验证项</h2><span>待处理 {pending.length} / 已处理 {resolved.length}</span></header>{pending.map((item) => <button className={selected?.id === item.id ? "active" : ""} key={item.id} onClick={() => setSelectedId(item.id)}><WarningCircle size={17} /><span><strong>{item.title}</strong><small>{item.source}</small></span><CaretRight size={15} /></button>)}{resolved.map((item) => <button className={selected?.id === item.id ? "active resolved" : "resolved"} key={item.id} onClick={() => setSelectedId(item.id)}><CheckCircle size={17} color="#4f9d76" /><span><strong>{item.title}</strong><small style={{color:'#4f9d76'}}>已处理 · {item.source}</small></span><CaretRight size={15} /></button>)}{!pending.length && !resolved.length ? <div className="queue-empty"><CheckCircle size={24} /><strong>暂无待确认问题</strong><span>仍可录入新的业务确认。</span></div> : null}<button className={selectedId === "general" ? "active general-feedback" : "general-feedback"} onClick={() => setSelectedId("general")}><Plus size={17} /><span><strong>其他补充</strong><small>新增事实、口径或行动进展</small></span><CaretRight size={15} /></button></section><section className="validation-detail"><header><div><h2>第二步：录入人工确认</h2><p>{selected?.title || "补充新信息"}</p></div></header>{selected ? <><div className="detail-block"><span>问题说明</span><p>{selected.description}</p></div><div className="detail-block"><span>证据位置</span><p>{selected.source || "未记录"}</p></div></> : <div className="detail-block"><span>适用场景</span><p>补充首次分析未覆盖的新事实、指标口径、业务确认或行动进展。</p></div>}<label className="field-label">确认结果<textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="填写确认的事实、口径、原因或行动进展。提交后保存到 validation 目录。" /></label><div className="detail-actions"><AppButton icon={<UploadSimple size={16} />} onClick={async () => { refresh(await api.pickFiles(task.id, "validation")); notify("附件已加入验证区"); }}>上传附件</AppButton><AppButton tone="primary" disabled={!feedback.trim()} onClick={submit}>保存确认结果</AppButton></div><div className="reanalysis-gate"><div><strong>第三步（按需）：重分析</strong><span>只有新增事实会改变报告结论时才执行。</span></div><AppButton icon={<Robot size={15} />} onClick={dispatch}>生成重分析调度单</AppButton></div></section><ReceiptPane task={task} onReveal={() => api.revealPath(`${task.path}/outputs`)} onRefresh={async () => refresh(await api.getTask(task.id))} /></div></div>;
}

function DeliveryStage({ task, refresh, notify }: { task: TaskDetail; refresh: (task: TaskDetail) => void; notify: (m: string) => void }) {
  const [wordBusy, setWordBusy] = useState(false);
  const [preview, setPreview] = useState<{ name: string; content: string } | null>(null);
  const generate = async (kind: "html" | "skill") => { const prompt = await api.generatePrompt(task.id, kind); await navigator.clipboard.writeText(prompt); notify(kind === "html" ? "HTML报告调度单已复制" : "Skill沉淀调度单已复制"); };
  const generateWord = async () => { setWordBusy(true); try { const result = await api.generateWordReport(task.id); refresh(result.task); notify(`Word 已生成：${result.outputName}`); await api.revealPath(result.outputPath); } catch (error: any) { notify(error.message || "Word 生成失败"); } finally { setWordBusy(false); } };
  const openOutput = async (file: FileEntry) => { if (file.type === "md") { setPreview({ name: file.name, content: await api.readFile(file.path) }); } else await api.revealPath(file.path); };
  return <div className="delivery-stage"><div className="delivery-layout"><section className="work-section"><header><div><h2>正式输出</h2><span>{task.outputs.length} 个文件</span></div><div className="inline-actions"><AppButton icon={<ArrowClockwise size={16} />} onClick={async () => refresh(await api.getTask(task.id))}>刷新</AppButton><AppButton icon={<FolderOpen size={16} />} onClick={() => api.revealPath(`${task.path}/outputs`)}>打开目录</AppButton></div></header><div className="output-list">{task.outputs.map((file) => <button key={file.path} onClick={() => openOutput(file)}><IconForFile file={file} /><span><strong>{file.name}</strong><small>{file.type === "md" ? "点击应用内预览" : "点击在系统中打开"} · {file.sizeKb} KB</small></span><CaretRight size={15} /></button>)}{!task.outputs.length ? <div className="output-empty">目录中暂无正式输出。请先在 03 完成分析并生成 Markdown 报告。</div> : null}</div></section><section className="work-section"><header><div><h2>交付工具</h2><span>应用内转换会直接写入 outputs</span></div></header><button className="command-row" onClick={generateWord} disabled={wordBusy}><FileDoc size={21} />{wordBusy ? <span><strong>正在生成 Word…</strong><small>读取最新 Markdown 正式报告</small></span> : <span><strong>直接生成 Word 报告</strong><small>从 outputs 中最新的 .md 报告生成 .docx</small></span>}<CaretRight size={15} /></button><button className="command-row" onClick={() => generate("html")}><SquaresFour size={21} /><span><strong>生成 HTML 报告调度单</strong><small>复制调度单，交给外部 Agent 生成</small></span><CaretRight size={15} /></button><button className="command-row" onClick={() => generate("skill")}><Robot size={21} /><span><strong>沉淀领域 Skill</strong><small>复制调度单，提炼可复用方法</small></span><CaretRight size={15} /></button></section></div>{preview ? <section className="markdown-preview"><header><div><h2>Markdown 输出预览</h2><span>{preview.name}</span></div><AppButton onClick={() => setPreview(null)}>关闭预览</AppButton></header><article>{preview.content}</article></section> : null}</div>;
}

function EvaluationStage({ task, refresh, notify }: { task: TaskDetail; refresh: (task: TaskDetail) => void; notify: (m: string) => void }) {
  const [running, setRunning] = useState(false); const run = async () => { setRunning(true); refresh(await api.runEvaluation(task.id)); setRunning(false); notify("后台抽查已完成"); };
  const copy = async () => { const prompt = await api.generatePrompt(task.id, "evaluation"); await navigator.clipboard.writeText(prompt); notify("AI评测调度单已复制"); };
  return <div className="evaluation-layout"><section className="work-section span-two"><header><div><h2>后台数据抽查</h2><span>检查文件、来源登记和输出追溯痕迹</span></div><AppButton tone="primary" icon={running ? <Spinner /> : <ShieldCheck size={16} />} onClick={run} disabled={running}>{running ? "抽查中" : "运行后台抽查"}</AppButton></header>{["正式输入", "文件抽样", "来源登记", "正式输出", "输出追溯痕迹"].map((item) => <div className="check-row" key={item}><CheckCircle size={17} color="#4c9d78" /><strong>{item}</strong><span>通过</span></div>)}</section><section className="work-section score-section"><header><h2>AI评测</h2></header><strong className="score">{task.evaluation.score || "-"}<small>/100</small></strong><p>{task.evaluation.status}<br />{task.evaluation.checkedAt}</p><AppButton onClick={copy}>生成AI评测调度单</AppButton></section><section className="work-section span-three"><header><div><h2>评测边界</h2><span>两层检查分工明确</span></div></header><div className="boundary-grid"><div><HardDrives size={24} /><strong>后台抽查</strong><p>判断文件能否读取、来源是否登记、输出是否留下追溯痕迹。</p></div><div><Robot size={24} /><strong>AI评测</strong><p>抽查数字、口径、推理、反证和结论边界。</p></div><div><WarningCircle size={24} /><strong>人工确认</strong><p>文件可读不等于业务结论正确，最终规则仍需人确认。</p></div></div></section></div>;
}

function SemanticProposalEditor({ item, onChange, notify, selected, onToggle }: { item: SemanticCandidate; onChange: (semantic: SemanticSnapshot) => void; notify: (m: string) => void; selected: boolean; onToggle: (id: string) => void }) {
  const [draft, setDraft] = useState(item); const [confirmedBy, setConfirmedBy] = useState("宋冰冰"); const [reason, setReason] = useState("");
  useEffect(() => setDraft(item), [item]);
  const save = async () => { onChange(await api.updateSemanticCandidate(item.id, draft)); notify("候选修改已保存"); };
  const approve = async () => { await save(); onChange(await api.approveSemanticCandidate(item.id, confirmedBy)); notify("已人工确认并写入正式语义表"); };
  const reject = async () => { onChange(await api.rejectSemanticCandidate(item.id, reason)); notify("候选已退回并保留记录"); };
  return <article className="semantic-review-card" style={{ opacity: selected ? 1 : 0.7 }}><header><label className="semantic-checkbox"><input type="checkbox" checked={selected} onChange={() => onToggle(item.id)} /><span className="checkmark" /></label><span>{item.typeLabel || ({ metric: "指标口径", entity: "实体定义", source: "数据源" } as Record<string, string>)[item.type] || item.type}</span><strong>{item.title}</strong></header><label>语义名称<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label>建议定义<textarea value={draft.proposed} onChange={(event) => setDraft({ ...draft, proposed: event.target.value })} /></label><label>证据与来源<textarea value={draft.evidence} onChange={(event) => setDraft({ ...draft, evidence: event.target.value })} /></label><label>适用范围与影响<textarea value={draft.impact} onChange={(event) => setDraft({ ...draft, impact: event.target.value })} /></label><div className="semantic-review-actions"><AppButton onClick={save}>保存修改</AppButton><label>确认人<input value={confirmedBy} onChange={(event) => setConfirmedBy(event.target.value)} /></label><AppButton tone="primary" onClick={approve}>人工确认并发布</AppButton></div><div className="semantic-reject"><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="填写退回原因" /><AppButton tone="danger" disabled={!reason.trim()} onClick={reject}>退回候选</AppButton></div></article>;
}

function SemanticCenter({ snapshot, onBack, onRefresh, onSemanticChange, notify }: { snapshot: AppSnapshot; onBack: () => void; onRefresh: () => Promise<void>; onSemanticChange: (semantic: SemanticSnapshot) => void; notify: (m: string) => void }) {
  const [selectedId, setSelectedId] = useState(snapshot.semantic.docs[0]?.id || "");
  const [tab, setTab] = useState<"intake" | "review" | "formal">("intake");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [incompleteTab, setIncompleteTab] = useState(false);
  const [form, setForm] = useState<Partial<SemanticCandidate>>({ type: "metric", title: "", proposed: "", evidence: "", impact: "" });
  const [promptPreview, setPromptPreview] = useState("");
  const selected = snapshot.semantic.docs.find((doc) => doc.id === selectedId);
  const createCandidate = async () => { const next = await api.createSemanticCandidate(form); onSemanticChange(next); setForm({ type: form.type || "metric", title: "", proposed: "", evidence: "", impact: "" }); setTab("review"); notify("人工录入已进入待确认候选"); };
  const previewMaintenancePrompt = async () => { setPromptPreview(await api.generateSemanticPrompt()); };
  return <main className="global-content">
    <header className="global-content-head"><div><h1>权威语义中心</h1><p>人工或材料进入候选区，AI负责整理，只有人工确认后才能写入正式语义。</p></div><div className="inline-actions"><AppButton icon={<ArrowClockwise size={16} />} onClick={onRefresh}>刷新</AppButton><AppButton onClick={onBack}>返回任务</AppButton></div></header>
    <section className="semantic-flow"><span>1 人工录入 / 上传材料</span><CaretRight size={14} /><span>2 AI 整理候选</span><CaretRight size={14} /><span>3 人工修改与确认</span><CaretRight size={14} /><strong>4 发布正式语义</strong></section>
    <div className="semantic-summary"><div><span>正式条目</span><strong>{snapshot.semantic.docs.reduce((sum, doc) => sum + doc.count, 0)}</strong></div><div><span>待确认</span><strong>{snapshot.semantic.pending.length}</strong></div><div><span>待完善字段</span><strong onClick={() => { setTab("formal"); setIncompleteTab(true); }} style={{cursor: 'pointer', textDecoration: 'underline dotted'}} title="点击查看缺失项">{snapshot.semantic.docs.reduce((sum, doc) => sum + doc.incomplete, 0)}</strong></div></div>
    <nav className="semantic-tabs"><button className={tab === "intake" ? "active" : ""} onClick={() => setTab("intake")}>录入与材料</button><button className={tab === "review" ? "active" : ""} onClick={() => setTab("review")}>候选确认 ({snapshot.semantic.pending.length})</button><button className={tab === "formal" ? "active" : ""} onClick={() => setTab("formal")}>正式语义</button></nav>
    {tab === "intake" ? <section className="semantic-intake"><div className="semantic-form"><header><div><h2>人工录入候选</h2><span>录入后仍需在“候选确认”中人工发布</span></div></header><label>语义类型<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="metric">指标口径</option><option value="entity">实体定义</option><option value="source">数据源</option></select></label><label>语义名称<input value={form.title || ""} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="例如：物业费收缴率" /></label><label>建议定义<textarea value={form.proposed || ""} onChange={(event) => setForm({ ...form, proposed: event.target.value })} placeholder="填写定义、计算方式或数据源说明" /></label><label>证据与来源<textarea value={form.evidence || ""} onChange={(event) => setForm({ ...form, evidence: event.target.value })} placeholder="文件、制度、责任人或任务路径" /></label><label>适用范围与影响<textarea value={form.impact || ""} onChange={(event) => setForm({ ...form, impact: event.target.value })} /></label><AppButton tone="primary" disabled={!form.title?.trim() || !form.proposed?.trim()} onClick={createCandidate}>保存为待确认候选</AppButton></div><div className="semantic-ai-intake"><header><div><h2>上传材料，由 AI 整理</h2><span>支持制度、口径表、说明文档和历史任务材料</span></div><AppButton icon={<UploadSimple size={16} />} onClick={async () => { const count = await api.uploadSemanticMaterials(); notify(count ? `已上传 ${count} 个材料文件` : "未选择文件"); }}>上传文件</AppButton></header><AppButton icon={<Robot size={16} />} onClick={previewMaintenancePrompt}>生成 AI 维护提示词</AppButton><pre className={promptPreview ? "prompt-preview" : "prompt-preview empty"}>{promptPreview || "上传材料后生成提示词。AI只能把整理结果写入待确认建议，不能修改正式语义。"}</pre><AppButton disabled={!promptPreview} tone="primary" icon={<Copy size={15} />} onClick={async () => { await navigator.clipboard.writeText(promptPreview); notify("AI语义维护提示词已复制"); }}>复制提示词</AppButton></div></section> : null}
    {tab === "review" ? <section className="semantic-review-list">{snapshot.semantic.pending.length ? <><header className="semantic-batch-bar"><label className="semantic-checkbox"><input type="checkbox" checked={selectedIds.size === snapshot.semantic.pending.length} onChange={() => { if (selectedIds.size === snapshot.semantic.pending.length) setSelectedIds(new Set()); else setSelectedIds(new Set(snapshot.semantic.pending.map((item) => item.id))); }} /><span className="checkmark" /></label><span>全选（{selectedIds.size}/{snapshot.semantic.pending.length}）</span><AppButton tone="primary" disabled={!selectedIds.size} onClick={async () => { const ids = Array.from(selectedIds); const approved = await api.approveSemanticCandidates(ids, "宋冰冰"); onSemanticChange(approved); setSelectedIds(new Set()); notify(`已确认发布 ${ids.length} 条`); }}>批量确认发布</AppButton><AppButton tone="danger" disabled={!selectedIds.size} onClick={async () => { const ids = Array.from(selectedIds); const rejected = await api.rejectSemanticCandidates(ids, "批量退回"); onSemanticChange(rejected); setSelectedIds(new Set()); notify(`已退回 ${ids.length} 条`); }}>批量退回</AppButton></header>{snapshot.semantic.pending.map((item) => <SemanticProposalEditor key={item.id} item={item} onChange={onSemanticChange} notify={notify} selected={selectedIds.has(item.id)} onToggle={(id) => { setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }} />)}</> : <div className="semantic-empty"><CheckCircle size={28} /><strong>没有待确认候选</strong><span>从人工录入或 AI 整理开始。</span></div>}</section> : null}
    {tab === "formal" ? <section className="semantic-layout"><div><h2>正式语义文件</h2>{snapshot.semantic.docs.map((doc) => <button className={`semantic-doc-row ${doc.id === selectedId ? "selected" : ""}`} key={doc.id} onClick={() => setSelectedId(doc.id)}><BookOpenText size={20} /><span><strong>{doc.title}</strong><small>{doc.count}条正式定义 · {doc.incomplete}个字段待完善</small></span><CaretRight size={15} /></button>)}</div><div><h2>正式内容预览</h2>{selected ? <article className="semantic-preview"><header><BookOpenText size={20} /><strong>{selected.title}</strong></header>{(() => {if (!selected.content) return <div className="semantic-preview-empty">该语义文件暂无内容。</div>;const lines = selected.content.split('\n');const headers = lines.slice(2,3)[0];if (!headers) return <pre>{selected.content}</pre>;const cols = headers.split('|').filter(c => c.trim()).map(c => c.trim());const dataLines = lines.slice(4).filter(l => l.trim().startsWith('|'));const items = dataLines.map(l => {const cells = l.split('|').filter(c => c.trim());const obj: Record<string,string> = {};cols.forEach((c,i) => { if (cells[i+1]) obj[c] = cells[i+1].trim(); });return obj;}).filter(o => Object.keys(o).length > 0);if (items.length === 0) return <pre>{selected.content}</pre>;const previewItems = items.slice(0, Math.min(20, items.length));return <div className="semantic-card-list">{previewItems.map((item, idx) => <div className="semantic-card-item" key={idx}><div className="sci-header"><strong>{item['指标'] || item['标准名称'] || item['数据源'] || ''}</strong><span className={`sci-type ${item['计算方式'] ? 'has-calculation' : ''}`}>{item['计算方式'] ? '有公式' : ''}</span></div><div className="sci-fields">{Object.entries(item).filter(([k]) => k !== '指标' && k !== '标准名称' && k !== '数据源').map(([k, v]) => <div className="sci-field" key={k}><span className="sci-label">{k}</span><span className="sci-value">{v || <em style={{color:'#bbb',fontStyle:'normal'}}>空</em>}</span></div>)}</div></div>)}</div>;})()}<footer><span>共 {(() => {if (!selected.content) return 0;return selected.content.split('\n').filter(l => l.trim().startsWith('|')).slice(2).filter(l => !/^\|[\s:|-]+\|$/.test(l.trim())).length;})()} 条正式定义</span>{selected.incomplete > 0 ? <button style={{border:0,color:'#126d74',background:'transparent',fontSize:'11px',cursor:'pointer'}} onClick={() => {const rows = (selected.content||'').split('\n').filter(l=>l.trim().startsWith('|'));const dataRows = rows.slice(2).filter(l=>!/^\|[\s:|-]+\|$/.test(l.trim()));const empty = dataRows.filter(l=>l.split('|').slice(1,-1).some(c=>!c.trim()||/待确认|待补充|未知|todo/i.test(c)));navigator.clipboard.writeText(empty.slice(0,10).join('\n'));notify(`已复制${Math.min(empty.length,10)}条缺失项`);}}>复制缺失项({selected.incomplete})</button> : null}</footer></article> : null}</div></section> : null}
  </main>;
}

function SettingsView({ snapshot, onSelectWorkspace, onUpdate, onDownload, onInstall }: { snapshot: AppSnapshot; onSelectWorkspace: () => void; onUpdate: () => void; onDownload: () => void; onInstall: () => void }) {
  const update = snapshot.update;
  const updateMessage = update.status === "checking" ? "正在检查 GitHub Releases…" : update.status === "available" ? `发现新版本 v${update.version}，尚未下载。` : update.status === "downloading" ? `正在下载 v${update.version}，请保持应用打开。` : update.status === "downloaded" ? `v${update.version} 已下载，可以重启安装。` : update.status === "current" ? "当前已是最新版本。" : update.status === "error" ? "更新失败，请重试或下载安装包。" : "通过 GitHub Releases 获取新版本。";
  return <main className="global-content settings"><header className="global-content-head"><div><h1>设置</h1><p>本机工作区、版本升级和应用信息。</p></div></header><section className="settings-section"><h2>工作区</h2><div className="setting-row"><div><strong>当前工作区</strong><p>{snapshot.workspacePath}</p></div><AppButton onClick={onSelectWorkspace}>选择目录</AppButton></div></section><section className="settings-section"><h2>软件更新</h2><div className="setting-row"><div><strong>当前版本 v{snapshot.version}</strong><p>{updateMessage}</p></div><div className="inline-actions">{update.status === "available" ? <AppButton tone="primary" icon={<UploadSimple size={16} />} onClick={onDownload}>下载更新</AppButton> : null}{update.status === "downloaded" ? <AppButton tone="primary" icon={<ArrowClockwise size={16} />} onClick={onInstall}>重启并安装</AppButton> : null}<AppButton disabled={["checking", "downloading", "installing"].includes(update.status)} icon={update.status === "checking" ? <Spinner /> : <ArrowClockwise size={16} />} onClick={onUpdate}>检查更新</AppButton></div></div><div className="update-steps"><span className={["available", "downloading", "downloaded", "installing"].includes(update.status) ? "done" : ""}>1 发现版本</span><span className={["downloaded", "installing"].includes(update.status) ? "done" : update.status === "downloading" ? "active" : ""}>2 下载</span><span className={update.status === "installing" ? "active" : ""}>3 重启安装</span></div></section><section className="settings-section"><h2>关于</h2><p>AI原生数据分析工作台 · 作者 宋冰冰 & Codex</p><p>本地优先。业务数据不会随应用源代码公开。</p></section></main>;
}

function StatusBar({ task }: { task: TaskDetail }) { return <footer className="statusbar"><span><ShieldCheck size={15} />工作区健康 <b>健康</b></span><span>文件总数 <b>{task.rawCount}</b></span><span>资料完整度 <b>{task.inputCompleteness}</b></span><span>语义覆盖率 <b>{task.semanticCoverage}%</b></span><span>后台检查 <b>空闲中</b></span></footer>; }

function NewTaskModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState(""); const [busy, setBusy] = useState(false);
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-task-title" onMouseDown={(event) => event.stopPropagation()}><header><h2 id="new-task-title">新建分析任务</h2><button onClick={onClose}><X size={18} /></button></header><label className="field-label">任务名称<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：2026M07_H64经营分析" /></label><p>将创建独立的投喂区、raw、working、notes、outputs 和 validation 目录。</p><footer><AppButton onClick={onClose}>取消</AppButton><AppButton tone="primary" disabled={!name.trim() || busy} onClick={async () => { setBusy(true); await onCreate(name.trim()); setBusy(false); }}>{busy ? "创建中" : "创建任务"}</AppButton></footer></section></div>;
}

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [stage, setStage] = useState<StageId>("analysis");
  const [view, setView] = useState<GlobalView>("tasks");
  const [query, setQuery] = useState("");
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [toast, setToast] = useState("");

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2400); };
  useEffect(() => { api.getSnapshot().then((data) => { setSnapshot(data); setTask(data.selectedTask || null); if (data.selectedTask) setStage(data.selectedTask.stage); }); }, []);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") { event.preventDefault(); setNewTaskOpen(true); } }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, []);
  const activeTask = task;
  const taskIds = useMemo(() => new Set(snapshot?.tasks.map((item) => item.id) || []), [snapshot]);

  const selectTask = async (summary: TaskSummary) => { const detail = await api.getTask(summary.id); setTask(detail); setStage(detail.stage); setView("tasks"); };
  const refreshTask = (detail: TaskDetail) => { setTask(detail); setSnapshot((current) => current ? { ...current, selectedTask: detail, tasks: current.tasks.map((item) => item.id === detail.id ? { ...item, ...detail } : item) } : current); };
  useEffect(() => { if (!task?.id || view !== "tasks") return; let cancelled = false; api.getTask(task.id).then((detail) => { if (!cancelled) refreshTask(detail); }); return () => { cancelled = true; }; }, [stage, view, task?.id]);
  const createTask = async (name: string) => { const detail = await api.createTask(name); setSnapshot((current) => current ? { ...current, selectedTask: detail, tasks: [detail, ...current.tasks.filter((item) => item.id !== detail.id)] } : current); setTask(detail); setStage("data"); setView("tasks"); setNewTaskOpen(false); notify("任务已创建"); };
  const archiveTask = async (summary: TaskSummary) => { await api.archiveTask(summary.id, !summary.archived); setSnapshot((current) => current ? { ...current, tasks: current.tasks.map((item) => item.id === summary.id ? { ...item, archived: !summary.archived } : item) } : current); notify(summary.archived ? "任务已恢复" : "任务已归档"); };
  const checkUpdate = async () => { setSnapshot((current) => current ? { ...current, update: { status: "checking" } } : current); const result = await api.checkForUpdates(); setSnapshot((current) => current ? { ...current, update: { status: result.status as AppSnapshot["update"]["status"], version: result.version } } : current); notify(result.status === "available" ? `发现新版本 ${result.version}` : "当前已是最新版本"); };
  const downloadUpdate = async () => { const version = snapshot?.update.version; setSnapshot((current) => current ? { ...current, update: { status: "downloading", version } } : current); try { await api.downloadUpdate(); setSnapshot((current) => current ? { ...current, update: { status: "downloaded", version } } : current); notify("更新已下载，可以重启安装"); } catch { setSnapshot((current) => current ? { ...current, update: { status: "error", version } } : current); notify("更新下载失败"); } };
  const installUpdate = async () => { setSnapshot((current) => current ? { ...current, update: { ...current.update, status: "installing" } } : current); notify("应用将退出并安装更新"); await api.installUpdate(); };

  if (!snapshot || !activeTask) return <div className="app-loading"><Spinner /><strong>正在打开本地工作区</strong></div>;

  let content: React.ReactNode;
  if (view === "semantic") content = <SemanticCenter snapshot={snapshot} onBack={() => setView("tasks")} onSemanticChange={(semantic) => setSnapshot((current) => current ? { ...current, semantic } : current)} onRefresh={async () => { const next = await api.getSnapshot(); setSnapshot(next); if (next.selectedTask?.id === activeTask.id) setTask(next.selectedTask); notify("语义中心已刷新"); }} notify={notify} />;
  else if (view === "settings") content = <SettingsView snapshot={snapshot} onSelectWorkspace={async () => { const next = await api.selectWorkspace(); if (next) { setSnapshot(next); setTask(next.selectedTask || null); notify("工作区已切换"); } }} onUpdate={checkUpdate} onDownload={downloadUpdate} onInstall={installUpdate} />;
  else {
    const stageContent = stage === "overview" ? <OverviewStage task={activeTask} setStage={setStage} />
      : stage === "data" ? <DataStage task={activeTask} refresh={refreshTask} notify={notify} />
      : stage === "analysis" ? <AnalysisStage task={activeTask} refresh={refreshTask} notify={notify} />
      : stage === "four-piece" ? <FourPieceStage task={activeTask} refresh={refreshTask} notify={notify} />
      : stage === "validation" ? <ValidationStage task={activeTask} refresh={refreshTask} notify={notify} />
      : stage === "delivery" ? <DeliveryStage task={activeTask} refresh={refreshTask} notify={notify} />
      : <EvaluationStage task={activeTask} refresh={refreshTask} notify={notify} />;
    content = <main className="task-workspace"><TaskHeader task={activeTask} onReveal={() => api.revealPath(activeTask.path)} onContinue={() => setStage("analysis")} onEvaluate={() => setStage("evaluation")} /><StageNav active={stage} task={activeTask} onStage={setStage} />{stageContent}</main>;
  }

  const navigateGlobal = (next: GlobalView) => {
    if (next === "evaluation") {
      setView("tasks");
      setStage("evaluation");
      return;
    }
    setView(next);
  };

  const selectWorkspace = async () => { const next = await api.selectWorkspace(); if (next) { setSnapshot(next); setTask(next.selectedTask || null); notify("工作区已切换"); } };

  return <div className="app-shell"><TitleBar snapshot={snapshot} query={query} onQuery={setQuery} onCheckUpdate={checkUpdate} onWorkspace={selectWorkspace} /><div className="app-body"><GlobalRail view={view} onView={navigateGlobal} /><TaskNavigator tasks={snapshot.tasks.filter((item) => taskIds.has(item.id))} selectedId={activeTask.id} query={query} onQuery={setQuery} onSelect={selectTask} onCreate={() => setNewTaskOpen(true)} onArchive={archiveTask} />{content}</div>{view === "tasks" ? <StatusBar task={activeTask} /> : null}{toast ? <div className="toast"><Check size={16} />{toast}</div> : null}{newTaskOpen ? <NewTaskModal onClose={() => setNewTaskOpen(false)} onCreate={createTask} /> : null}</div>;
}
