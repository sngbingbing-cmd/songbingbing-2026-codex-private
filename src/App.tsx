import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive, ArrowClockwise, Bell, BookOpenText, CaretDown, CaretRight, Check,
  CheckCircle, ClipboardText, ClockCounterClockwise, Copy, Database, File, FileCsv,
  FileDoc, FileMd, Files, Folder, FolderOpen, Gear, HardDrives, ListChecks, MagnifyingGlass,
  Plus, Robot, ShieldCheck, SidebarSimple, Sparkle, SquaresFour, UploadSimple,
  WarningCircle, X
} from "@phosphor-icons/react";
import { api } from "./api";
import type { AppSnapshot, ExternalSourceInfo, FileEntry, GlobalView, StageId, TaskDetail, TaskSummary } from "./types";

const STAGES: Array<{ id: StageId; number: string; title: string; subtitle: string }> = [
  { id: "overview", number: "01", title: "概览", subtitle: "任务状态" },
  { id: "data", number: "02", title: "资料", subtitle: "输入准备" },
  { id: "analysis", number: "03", title: "分析", subtitle: "首次调度" },
  { id: "four-piece", number: "04", title: "四件套", subtitle: "分析沉淀" },
  { id: "validation", number: "05", title: "验证", subtitle: "复核回流" },
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
    <button className="update-control" onClick={onCheckUpdate}>检查更新<span className={`status-dot ${snapshot.update.status === "available" ? "warning" : "active"}`} /></button>
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
      <div className="context-summary"><header><strong>语义定义</strong><AppButton tone="ghost">管理</AppButton></header><p>已加载 23 项关键业务术语与指标口径。</p></div>
      <div className="context-summary"><header><strong>领域（Skill）</strong><AppButton tone="ghost">切换</AppButton></header><p><b>{task.domainSkill}</b><br />已加载领域规则、分析模板与校验逻辑。</p></div>
      <button className="dropzone" onClick={onPick}><UploadSimple size={25} /><strong>拖拽文件到此处，或点击添加</strong><span>支持 .md .xlsx .csv .txt</span></button>
    </> : tab === "semantic" ? <div className="context-tab-content"><BookOpenText size={28} /><h3>当前语义上下文</h3><p>指标口径 23 项、实体映射 18 项、权威数据源 12 项。</p><AppButton>打开语义中心</AppButton></div> : <div className="context-tab-content"><Robot size={28} /><h3>{task.domainSkill}</h3><p>覆盖输入识别、口径约束、分析框架、验证规则与输出标准。</p><AppButton>查看 Skill</AppButton></div>}
  </section>;
}

function AnalysisEditor({ task, onCopy, onSave }: { task: TaskDetail; onCopy: () => void; onSave: (content: string) => void }) {
  const [goal, setGoal] = useState("基于提供的资料，完成示例经营单元的首次分析，输出四件套并形成初步结论与关键洞察。");
  const [thinking, setThinking] = useState("从结构、趋势、异常、对比四个维度展开；主动寻找反例与替代解释；结合历史口径变化，关注指标一致性与可比性。");
  const [verification, setVerification] = useState("严格使用资料所载口径与单位；无法判断的内容明确标注并提出补充；关键结论必须注明来源文件与行/列。");
  return <section className="editor-pane pane">
    <header className="editor-head"><div><h2>首次分析调度单</h2><p>生成时间：2026-06-24 10:21　任务：{task.name}</p></div><div><AppButton tone="ghost">模板</AppButton><AppButton tone="ghost">清空</AppButton><AppButton tone="ghost" icon={<Copy size={14} />} onClick={onCopy}>复制</AppButton><AppButton tone="ghost" onClick={() => onSave([goal, thinking, verification].join("\n\n"))}>保存草稿</AppButton></div></header>
    <div className="editor-scroll">
      <PromptSection number="1" title="必须补充"><div className="mini-table"><span>序号</span><span>补充项</span><span>当前状态</span><span>影响</span><span>建议返回格式</span><i>--</i><i>--</i><i>--</i><i>--</i><i>--</i></div></PromptSection>
      <div className="prompt-variables"><header><strong>Prompt 变量</strong><AppButton tone="ghost">管理</AppButton></header><div><span><b>任务ID</b>{task.name}</span><span><b>领域</b>通用经营分析</span><span><b>报告期间</b>202606</span><span><b>输出粒度</b>万元</span><span><b>单位风险阈值</b>未设置</span><button>+ 添加变量</button></div></div>
      <PromptSection number="2" title="分析目标与范围"><textarea value={goal} onChange={(event) => setGoal(event.target.value)} /></PromptSection>
      <PromptSection number="3" title="分析思路（AI 创造力引导）"><textarea value={thinking} onChange={(event) => setThinking(event.target.value)} /></PromptSection>
      <PromptSection number="4" title="校验与验证要求"><textarea value={verification} onChange={(event) => setVerification(event.target.value)} /></PromptSection>
      <PromptSection number="5" title="输出要求"><div className="output-checks"><label><input type="checkbox" defaultChecked />分析请求</label><label><input type="checkbox" defaultChecked />分析请求.md 补充</label><label><input type="checkbox" defaultChecked />来源清单</label><label><input type="checkbox" defaultChecked />口径映射</label></div></PromptSection>
    </div>
    <footer className="editor-actions"><AppButton icon={<Copy size={16} />} onClick={onCopy}>复制调度单</AppButton><AppButton tone="primary" icon={<Robot size={17} />} onClick={onCopy}>执行分析 <kbd>{shortcutModifier}↵</kbd></AppButton></footer>
  </section>;
}

function PromptSection({ number, title, children }: { number: string; title: string; children: React.ReactNode }) { return <section className="prompt-section"><h3>{number}. {title}</h3>{children}</section>; }

function ReceiptPane({ task, onReveal }: { task: TaskDetail; onReveal: () => void }) {
  return <section className="receipt-pane pane"><h2>执行与回执</h2>
    <div className="receipt-block"><header><strong>首次执行状态</strong></header>{["分析请求", "分析请求.md 补充", "来源清单", "回执映射"].map((item) => <div className="receipt-row" key={item}><CheckCircle size={15} color="#5ca97c" /><span>{item}</span><b>0/1</b></div>)}</div>
    <div className="receipt-block"><header><strong>最近回执</strong></header><p>{task.firstRun.receipt || "暂无回执记录"}</p></div>
    <div className="receipt-block"><header><strong>验证项（系统自动刷新）</strong><button>查看全部</button></header><p>待处理 {task.validation.length} / 已解决 0</p></div>
    <div className="receipt-block output-preview"><header><strong>输出预览（执行后生成）</strong></header><p>{task.outputs.length ? `最近输出：${task.outputs[0].name}` : "暂无输出内容，执行后可在此预览结果摘要。"}</p></div>
    <AppButton icon={<FolderOpen size={16} />} onClick={onReveal}>打开输出目录</AppButton>
  </section>;
}

function AnalysisStage({ task, notify, refresh }: { task: TaskDetail; notify: (message: string) => void; refresh: (task: TaskDetail) => void }) {
  const copyPrompt = async () => { const prompt = await api.generatePrompt(task.id, "analysis"); await navigator.clipboard.writeText(prompt); notify("首次分析调度单已复制"); };
  return <div className="analysis-canvas"><ContextPane task={task} onPick={async () => refresh(await api.pickFiles(task.id, "raw"))} /><div className="resize-handle" /><AnalysisEditor task={task} onCopy={copyPrompt} onSave={() => notify("调度单草稿已保存")} /><div className="resize-handle" /><ReceiptPane task={task} onReveal={() => api.revealPath(task.path)} /></div>;
}

function OverviewStage({ task, setStage }: { task: TaskDetail; setStage: (stage: StageId) => void }) {
  return <div className="overview-grid"><section className="work-section span-two"><header><div><h2>下一步队列</h2><span>按阻塞优先</span></div><b>{task.validation.length} 项待处理</b></header>{task.validation.map((item) => <div className="action-row" key={item.id}><span className="tag warning">验证</span><div><strong>{item.title}</strong><small>{item.description}</small></div><b>高</b><button onClick={() => setStage("validation")}>去处理</button></div>)}</section>
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

function FourPieceStage({ task, notify }: { task: TaskDetail; notify: (m: string) => void }) {
  const [selected, setSelected] = useState(task.requiredDocs[0]); const [content, setContent] = useState(selected?.content || "");
  const choose = async (doc: typeof selected) => { setSelected(doc); setContent(doc.content || await api.readFile(doc.path)); };
  return <div className="document-workspace"><aside><h2>四件套</h2>{task.requiredDocs.map((doc) => <button className={selected?.path === doc.path ? "active" : ""} key={doc.path} onClick={() => choose(doc)}><FileMd size={18} /><span><strong>{doc.name}</strong><small>{doc.filled ? "已填写" : "待补充"}</small></span><CaretRight size={14} /></button>)}</aside><section className="document-editor"><header><div><h2>{selected?.name}</h2><p>{selected?.path}</p></div><AppButton tone="primary" onClick={async () => { if (selected) await api.saveFile(selected.path, content); notify("文件已保存"); }}>保存</AppButton></header><textarea value={content} onChange={(event) => setContent(event.target.value)} /></section></div>;
}

function ValidationStage({ task, refresh, notify }: { task: TaskDetail; refresh: (task: TaskDetail) => void; notify: (m: string) => void }) {
  const [selected, setSelected] = useState(task.validation[0]); const [feedback, setFeedback] = useState("");
  const copy = async () => { const prompt = await api.generatePrompt(task.id, "reanalysis"); await navigator.clipboard.writeText(prompt); notify("重分析调度单已复制"); };
  return <div className="validation-workspace"><section className="validation-queue"><header><h2>验证队列</h2><span>待处理 {task.validation.length}</span></header>{task.validation.map((item) => <button className={selected?.id === item.id ? "active" : ""} key={item.id} onClick={() => setSelected(item)}><WarningCircle size={17} /><span><strong>{item.title}</strong><small>{item.source}</small></span><CaretRight size={15} /></button>)}</section><section className="validation-detail"><header><h2>{selected?.title || "暂无待处理项"}</h2><AppButton icon={<Copy size={15} />} onClick={copy}>复制重分析调度单</AppButton></header><div className="detail-block"><span>问题说明</span><p>{selected?.description}</p></div><div className="detail-block"><span>证据位置</span><p>{selected?.source || "未记录"}</p></div><label className="field-label">人工确认与补充<textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="补充口径、业务确认、行动进展..." /></label><div className="detail-actions"><AppButton icon={<UploadSimple size={16} />}>上传附件</AppButton><AppButton tone="primary" onClick={async () => { refresh(await api.writeFeedback(task.id, "conclusion", feedback)); setFeedback(""); notify("已写入回流记录"); }}>提交反馈</AppButton></div></section><ReceiptPane task={task} onReveal={() => api.revealPath(task.path)} /></div>;
}

function DeliveryStage({ task, notify }: { task: TaskDetail; notify: (m: string) => void }) {
  const generate = async (kind: "html" | "skill") => { const prompt = await api.generatePrompt(task.id, kind); await navigator.clipboard.writeText(prompt); notify(kind === "html" ? "HTML报告调度单已复制" : "Skill沉淀调度单已复制"); };
  return <div className="delivery-layout"><section className="work-section"><header><div><h2>正式输出</h2><span>{task.outputs.length} 个文件</span></div><AppButton icon={<FolderOpen size={16} />} onClick={() => api.revealPath(`${task.path}/outputs`)}>打开目录</AppButton></header><div className="output-list">{task.outputs.map((file) => <button key={file.path} onClick={() => api.revealPath(file.path)}><IconForFile file={file} /><span><strong>{file.name}</strong><small>{file.sizeKb} KB · {file.modifiedAt}</small></span><CaretRight size={15} /></button>)}</div></section><section className="work-section"><header><h2>交付工具</h2></header><button className="command-row" onClick={() => notify("Word报告将基于最新Markdown输出生成")}><FileDoc size={21} /><span><strong>生成 Word 报告</strong><small>适合正式流转与归档</small></span><CaretRight size={15} /></button><button className="command-row" onClick={() => generate("html")}><SquaresFour size={21} /><span><strong>生成 HTML 报告调度单</strong><small>适合交互阅读和分享</small></span><CaretRight size={15} /></button><button className="command-row" onClick={() => generate("skill")}><Robot size={21} /><span><strong>沉淀领域 Skill</strong><small>把可复用方法带到下一次任务</small></span><CaretRight size={15} /></button></section></div>;
}

function EvaluationStage({ task, refresh, notify }: { task: TaskDetail; refresh: (task: TaskDetail) => void; notify: (m: string) => void }) {
  const [running, setRunning] = useState(false); const run = async () => { setRunning(true); refresh(await api.runEvaluation(task.id)); setRunning(false); notify("后台抽查已完成"); };
  const copy = async () => { const prompt = await api.generatePrompt(task.id, "evaluation"); await navigator.clipboard.writeText(prompt); notify("AI评测调度单已复制"); };
  return <div className="evaluation-layout"><section className="work-section span-two"><header><div><h2>后台数据抽查</h2><span>检查文件、来源登记和输出追溯痕迹</span></div><AppButton tone="primary" icon={running ? <Spinner /> : <ShieldCheck size={16} />} onClick={run} disabled={running}>{running ? "抽查中" : "运行后台抽查"}</AppButton></header>{["正式输入", "文件抽样", "来源登记", "正式输出", "输出追溯痕迹"].map((item) => <div className="check-row" key={item}><CheckCircle size={17} color="#4c9d78" /><strong>{item}</strong><span>通过</span></div>)}</section><section className="work-section score-section"><header><h2>AI评测</h2></header><strong className="score">{task.evaluation.score || "-"}<small>/100</small></strong><p>{task.evaluation.status}<br />{task.evaluation.checkedAt}</p><AppButton onClick={copy}>生成AI评测调度单</AppButton></section><section className="work-section span-three"><header><div><h2>评测边界</h2><span>两层检查分工明确</span></div></header><div className="boundary-grid"><div><HardDrives size={24} /><strong>后台抽查</strong><p>判断文件能否读取、来源是否登记、输出是否留下追溯痕迹。</p></div><div><Robot size={24} /><strong>AI评测</strong><p>抽查数字、口径、推理、反证和结论边界。</p></div><div><WarningCircle size={24} /><strong>人工确认</strong><p>文件可读不等于业务结论正确，最终规则仍需人确认。</p></div></div></section></div>;
}

function SemanticCenter({ snapshot, onBack, notify }: { snapshot: AppSnapshot; onBack: () => void; notify: (m: string) => void }) {
  const [selectedId, setSelectedId] = useState(snapshot.semantic.docs[0]?.id || "");
  const selected = snapshot.semantic.docs.find((doc) => doc.id === selectedId);
  return <main className="global-content">
    <header className="global-content-head"><div><h1>权威语义中心</h1><p>正式定义由人工确认；AI负责发现、举证和提出候选。</p></div><AppButton onClick={onBack}>返回任务</AppButton></header>
    <div className="semantic-summary"><div><span>正式条目</span><strong>{snapshot.semantic.docs.reduce((sum, doc) => sum + doc.count, 0)}</strong></div><div><span>待确认</span><strong>{snapshot.semantic.pending.length}</strong></div><div><span>待完善字段</span><strong>{snapshot.semantic.docs.reduce((sum, doc) => sum + doc.incomplete, 0)}</strong></div></div>
    <section className="semantic-layout">
      <div><h2>正式语义</h2>{snapshot.semantic.docs.map((doc) => <button className={`semantic-doc-row ${doc.id === selectedId ? "selected" : ""}`} key={doc.id} onClick={() => setSelectedId(doc.id)}><BookOpenText size={20} /><span><strong>{doc.title}</strong><small>{doc.count}条正式定义 · {doc.incomplete}个字段待完善</small></span><CaretRight size={15} /></button>)}</div>
      <div><h2>{snapshot.semantic.pending.length ? "待确认建议" : "语义预览"}</h2>
        {snapshot.semantic.pending.map((item) => <article className="proposal" key={item.id}><header><span>{item.type}</span><strong>{item.title}</strong></header><dl><dt>建议定义</dt><dd>{item.proposed}</dd><dt>依据</dt><dd>{item.evidence}</dd><dt>影响</dt><dd>{item.impact}</dd></dl><footer><AppButton onClick={() => notify("已退回修改")}>退回修改</AppButton><AppButton tone="primary" onClick={() => notify("已提交人工确认")}>确认发布</AppButton></footer></article>)}
        {!snapshot.semantic.pending.length && selected ? <article className="semantic-preview"><header><BookOpenText size={20} /><strong>{selected.title}</strong></header><pre>{selected.content || "该语义文件暂无内容。"}</pre><footer><span>修改正式语义前需人工确认</span><AppButton onClick={() => notify("请在工作区的 02-权威语义层中维护")}>维护指引</AppButton></footer></article> : null}
      </div>
    </section>
  </main>;
}

function SettingsView({ snapshot, onSelectWorkspace, onUpdate }: { snapshot: AppSnapshot; onSelectWorkspace: () => void; onUpdate: () => void }) {
  return <main className="global-content settings"><header className="global-content-head"><div><h1>设置</h1><p>本机工作区、版本升级和应用信息。</p></div></header><section className="settings-section"><h2>工作区</h2><div className="setting-row"><div><strong>当前工作区</strong><p>{snapshot.workspacePath}</p></div><AppButton onClick={onSelectWorkspace}>选择目录</AppButton></div></section><section className="settings-section"><h2>软件更新</h2><div className="setting-row"><div><strong>当前版本 v{snapshot.version}</strong><p>通过 GitHub Releases 获取签名后的新版本。</p></div><AppButton icon={<ArrowClockwise size={16} />} onClick={onUpdate}>检查更新</AppButton></div></section><section className="settings-section"><h2>关于</h2><p>AI原生数据分析工作台 · 作者 宋冰冰 & Codex</p><p>本地优先。业务数据不会随应用源代码公开。</p></section></main>;
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
  const createTask = async (name: string) => { const detail = await api.createTask(name); setSnapshot((current) => current ? { ...current, selectedTask: detail, tasks: [detail, ...current.tasks.filter((item) => item.id !== detail.id)] } : current); setTask(detail); setStage("data"); setView("tasks"); setNewTaskOpen(false); notify("任务已创建"); };
  const archiveTask = async (summary: TaskSummary) => { await api.archiveTask(summary.id, !summary.archived); setSnapshot((current) => current ? { ...current, tasks: current.tasks.map((item) => item.id === summary.id ? { ...item, archived: !summary.archived } : item) } : current); notify(summary.archived ? "任务已恢复" : "任务已归档"); };
  const checkUpdate = async () => { setSnapshot((current) => current ? { ...current, update: { status: "checking" } } : current); const result = await api.checkForUpdates(); setSnapshot((current) => current ? { ...current, update: { status: result.status as AppSnapshot["update"]["status"], version: result.version } } : current); notify(result.status === "available" ? `发现新版本 ${result.version}` : "当前已是最新版本"); };

  if (!snapshot || !activeTask) return <div className="app-loading"><Spinner /><strong>正在打开本地工作区</strong></div>;

  let content: React.ReactNode;
  if (view === "semantic") content = <SemanticCenter snapshot={snapshot} onBack={() => setView("tasks")} notify={notify} />;
  else if (view === "settings") content = <SettingsView snapshot={snapshot} onSelectWorkspace={async () => { const next = await api.selectWorkspace(); if (next) { setSnapshot(next); setTask(next.selectedTask || null); notify("工作区已切换"); } }} onUpdate={checkUpdate} />;
  else {
    const stageContent = stage === "overview" ? <OverviewStage task={activeTask} setStage={setStage} />
      : stage === "data" ? <DataStage task={activeTask} refresh={refreshTask} notify={notify} />
      : stage === "analysis" ? <AnalysisStage task={activeTask} refresh={refreshTask} notify={notify} />
      : stage === "four-piece" ? <FourPieceStage task={activeTask} notify={notify} />
      : stage === "validation" ? <ValidationStage task={activeTask} refresh={refreshTask} notify={notify} />
      : stage === "delivery" ? <DeliveryStage task={activeTask} notify={notify} />
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
