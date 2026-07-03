import { useEffect, useState } from "react";
import {
  ArrowClockwise, CaretRight, CheckCircle, ClipboardText, Copy, FileDoc,
  FileMd, Folder, FolderOpen, HardDrives, ListChecks, MagnifyingGlass, Plus,
  Robot, ShieldCheck, Sparkle, SquaresFour, UploadSimple, WarningCircle,
  ClockCounterClockwise, Files
} from "@phosphor-icons/react";
import { api } from "../api";
import type { DomainSkill, ExternalSourceInfo, FileEntry, PromptDraft, StageId, TaskDetail, ToastTone } from "../types";
import { findIncompleteItems, isIncompleteValue, parseMarkdownTable, updateMarkdownTableCell } from "../semantic-table-utils";
import { aiCapability, AIStreamPanel, useAiExecution } from "./ai-execution";
import { AppButton, evaluationStatusColor, evaluationStatusLabel, IconForFile, Progress, PromptSection, Spinner, trustSummary } from "./ui";
import { PromptPreviewPanel, ReceiptPane } from "./shared-panes";

type Notify = (m: string, tone?: ToastTone) => void;
type Refresh = (task: TaskDetail) => void;

// ── External sources module (used in DataStage) ──
export function ExternalSourcesModule({ taskId, notify }: { taskId: string; notify: Notify }) {
  const [sources, setSources] = useState<ExternalSourceInfo[]>([]);
  const [processingPaths, setProcessingPaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const loadSources = async () => { setLoading(true); setSources(await api.getExternalSources(taskId)); setLoading(false); };
  useEffect(() => { loadSources(); }, [taskId]);

  const handleLink = async () => {
    const dir = await api.pickDirectory();
    if (!dir) return;
    try { await api.linkExternalSource(taskId, dir); notify("外部目录已关联"); await loadSources(); }
    catch (e: any) { notify(e.message || "关联失败", "error"); }
  };
  const handleRefresh = async (path: string) => {
    setProcessingPaths((prev) => new Set(prev).add(path));
    try { await api.refreshExternalSource(taskId, path); notify("目录已刷新"); await loadSources(); }
    catch (e: any) { notify(e.message || "刷新失败", "error"); }
    setProcessingPaths((prev) => { const next = new Set(prev); next.delete(path); return next; });
  };
  const handleUnlink = async (path: string) => {
    if (!window.confirm("解除关联不会删除原始目录。确认解除？")) return;
    try { await api.unlinkExternalSource(taskId, path); notify("已解除关联"); await loadSources(); }
    catch (e: any) { notify(e.message || "解除关联失败", "error"); }
  };
  const trunc = (p: string, max = 50) => p.length <= max ? p : p.slice(0, 22) + "…" + p.slice(-26);
  const scanTime = (value: string) => new Date(value).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

  if (loading) return <section className="work-section external-sources-section external-sources-loading"><Spinner /><span>正在读取关联目录</span></section>;
  return <section className="work-section external-sources-section">
    <header><div><h2>外部资料目录</h2><span>{sources.length} 个关联目录</span></div><AppButton tone="primary" icon={<Folder size={16} />} onClick={handleLink}>关联目录</AppButton></header>
    {sources.length === 0 ? <div className="external-sources-empty"><Folder size={28} /><strong>尚未关联外部资料目录</strong><span>关联后可通过 AI 调度提示词让外部 Agent 递归读取</span></div> : <div className="external-sources-list">
      {sources.map((source) => <div key={source.path} className="external-source-row">
        <div className="external-source-info">
          <div className="external-source-path"><FolderOpen size={18} /><span title={source.path}>{trunc(source.path)}</span></div>
          <div className="external-source-meta">
            <span title="顶层目录">{source.topLevelItems.filter((i) => i.isDirectory).length} 个顶层目录</span><span>{source.totalFiles} 个文件</span>
            <span>{source.totalSizeKb >= 1024 ? (source.totalSizeKb / 1024).toFixed(1) + " MB" : source.totalSizeKb + " KB"}</span>
            {source.anomalies.length > 0 ? <span className="anomaly-badge" title={source.anomalies.join("\n")}><WarningCircle size={14} />{source.anomalies.length} 个异常</span> : <span className="scan-ok">扫描正常</span>}
          </div>
          <div className="external-source-dirs"><span>目录: {source.topLevelItems.filter((i) => i.isDirectory).slice(0, 4).map((i) => i.name).join("、")}{source.topLevelItems.filter((i) => i.isDirectory).length > 4 ? ` 等 ${source.topLevelItems.filter((i) => i.isDirectory).length} 个` : ""}</span></div>
          <div className="external-source-scan"><span>扫描于 {scanTime(source.lastScannedAt)}</span></div>
        </div>
        <div className="external-source-actions">
          <button className="source-action-btn" title="重新扫描" onClick={() => handleRefresh(source.path)} disabled={processingPaths.has(source.path)}>{processingPaths.has(source.path) ? <Spinner /> : <ArrowClockwise size={16} />}</button>
          <button className="source-action-btn" title="在 Finder 中显示" onClick={() => api.revealExternalSource(taskId, source.path)}><MagnifyingGlass size={16} /></button>
          <button className="source-action-btn danger" title="解除关联" onClick={() => handleUnlink(source.path)}><WarningCircle size={16} /></button>
        </div>
      </div>)}
    </div>}
  </section>;
}

// ── 01 Overview ──
export function OverviewStage({ task, setStage }: { task: TaskDetail; setStage: (stage: StageId) => void }) {
  const pCount = (task.validation || []).filter((item: any) => item.status !== "resolved").length;
  const rCount = (task.validation || []).filter((item: any) => item.status === "resolved").length;
  const readiness = computeReadiness(task);
  return <div className="overview-grid"><section className="work-section span-two"><header><div><h2>下一步队列</h2><span>按阻塞优先</span></div><b>{pCount} 项待处理 / {rCount} 项已处理</b></header>{task.validation.map((item) => <div className="action-row" key={item.id}><span className={`tag ${item.status === 'resolved' ? 'ok' : 'warning'}`}>{item.status === 'resolved' ? '已处理' : '验证'}</span><div><strong>{item.title}</strong><small>{item.description}</small></div><b>{item.status === 'resolved' ? '中' : '高'}</b>{item.status !== 'resolved' ? <button onClick={() => setStage("validation")}>去处理</button> : <span style={{color:'#888',fontSize:'9px'}}>已确认</span>}</div>)}</section>
    <section className="work-section"><header><h2>语义冲突（全局共识）</h2><b>{task.semanticConflicts}</b></header>{task.semanticConflicts > 0 ? <div className="metric-line"><span>检测到同名不同义或重复定义</span><em>高</em></div> : <div className="metric-line"><span>未检测到冲突</span><em>低</em></div>}</section>
    <section className="work-section span-two"><header><h2>输入就绪度</h2><span>{task.inputCompleteness} · 更新于 {task.updatedAt || "—"}</span></header>{readiness.map((item) => <div className="readiness-row" key={item.label}><CheckCircle size={15} color={item.ready ? "#4f9d76" : "#c08a30"} /><strong>{item.label}</strong><span>{item.ready ? "已就绪" : "部分缺失"}</span><button onClick={() => setStage(item.stage)}>{item.ready ? "查看" : "去补齐"}</button></div>)}</section>
    <section className="work-section score-section"><header><h2>AI评测（抽查得分）</h2></header><strong className="score">{task.evaluation.score ?? "-"}<small>/100</small></strong><p>{task.evaluation.status || "未评测"}<br />{task.evaluation.checkedAt ? `最近评测：${task.evaluation.checkedAt}` : "点击运行后台抽查"}</p><button onClick={() => setStage("evaluation")}>查看详细评测</button></section>
    <section className="work-section span-two"><header><h2>最近一次AI执行回执</h2><span className={`tag ${task.firstRun.status === "已完成" ? "ok" : task.firstRun.status === "等待回执" ? "warning" : "muted"}`}>{task.firstRun.status}</span></header><p>{task.firstRun.receipt || "暂无回执摘要"}</p></section>
    <section className="work-section"><header><h2>来源覆盖度</h2></header><Progress label="结构化来源覆盖" value={task.sourceCoverage} /><Progress label="语义口径覆盖" value={task.semanticCoverage} /></section></div>;
}

function computeReadiness(task: TaskDetail): Array<{ label: string; ready: boolean; stage: StageId }> {
  const filledDocs = task.requiredDocs.filter((d) => d.filled).length;
  const hasRaw = task.rawFiles.length > 0;
  const hasOutput = task.outputs.length > 0;
  const hasReceipt = task.firstRun.status === "已完成";
  return [
    { label: "结构化数据", ready: hasRaw, stage: "data" as StageId },
    { label: "四件套文档", ready: filledDocs >= 3, stage: "four-piece" as StageId },
    { label: "分析回执", ready: hasReceipt && hasOutput, stage: "validation" as StageId },
    { label: "评测确认", ready: task.evaluation.score != null && task.evaluation.score >= 60, stage: "evaluation" as StageId },
  ];
}

export { ContextPane };
// ── ContextPane (used in AnalysisStage) ──
function ContextPane({ task, onPick, onDropFiles, skills, onSetSkill }: { task: TaskDetail; onPick: () => void; onDropFiles: (paths: string[]) => Promise<void>; skills: DomainSkill[]; onSetSkill: (skillId: string | null) => Promise<void> }) {
  const [tab, setTab] = useState<"files" | "semantic" | "skill">("files");
  const [pickingSkill, setPickingSkill] = useState(false);
  const activeSkill = skills.find((s) => s.id === task.skillId);
  return <section className="context-pane pane">
    <h2>输入与上下文</h2>
    <div className="segmented"><button className={tab === "files" ? "active" : ""} onClick={() => setTab("files")}>文件</button><button className={tab === "semantic" ? "active" : ""} onClick={() => setTab("semantic")}>语义</button><button className={tab === "skill" ? "active" : ""} onClick={() => setTab("skill")}>Skill</button></div>
      {tab === "files" ? <>
      <div className="pane-section-title"><strong>原始文件 ({task.rawFiles.length})</strong><AppButton tone="ghost" icon={<Plus size={14} />} onClick={onPick}>添加</AppButton></div>
      <div className="file-list">{task.rawFiles.map((file, index) => <button key={file.path} className={`file-row ${index === 0 ? "selected" : ""}`}><IconForFile file={file} /><span><strong>{file.name}</strong><small>{file.sizeKb} KB · {file.modifiedAt}</small></span><em>{file.trust || "-"}</em></button>)}</div>
      {(() => { const summary = trustSummary(task.rawFiles); return <div className="context-summary"><header><strong>源可信度</strong><span><ShieldCheck size={14} color={summary.color} /> {summary.label}</span></header><p>{task.rawFiles.length} 个原始文件，按最低可信度 {summary.label} 计入上下文。</p></div>; })()}
      <div className="context-summary"><header><strong>语义定义</strong><AppButton tone="ghost">管理</AppButton></header><p>已加载当前工作区的指标口径、实体字典和数据源登记。</p></div>
      <div className="context-summary"><header><strong>领域（Skill）</strong>{activeSkill ? <AppButton tone="ghost" onClick={() => onSetSkill(null)}>移除</AppButton> : null}</header><div className="skill-mini-info">{activeSkill ? <><Robot size={16} color="#4f9d76" /><p><b>{activeSkill.name}</b><br /><small>{activeSkill.domain} · v{activeSkill.version}</small><br /><small>{activeSkill.description}</small></p></> : <p><b>未选择 Skill</b><br /><small>选择领域Skill后，分析调度单将包含该Skill的分析框架和规则。</small></p>}</div></div>
      <button className="dropzone" onClick={onPick} onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag-active"); }} onDragLeave={(e) => e.currentTarget.classList.remove("drag-active")} onDrop={async (e) => { e.preventDefault(); e.currentTarget.classList.remove("drag-active"); const paths = Array.from(e.dataTransfer.files).map((f: any) => f.path).filter(Boolean); if (paths.length) await onDropFiles(paths); }}><UploadSimple size={25} /><strong>拖拽文件到此处，或点击添加</strong><span>支持 .md .xlsx .csv .txt</span></button>
    </> : tab === "semantic" ? <div className="context-tab-content"><ShieldCheck size={28} /><h3>当前语义上下文</h3><p>读取工作区正式语义；没有正式条目时，AI仍可分析并提出待确认候选。</p><AppButton>打开语义中心</AppButton></div> : <div className="context-tab-content skill-tab">
        <Robot size={28} />
        {activeSkill ? <>
          <h3>{activeSkill.name}</h3>
          <p className="skill-domain-tag">{activeSkill.domain} · v{activeSkill.version}</p>
          <p className="skill-desc">{activeSkill.description}</p>
          <div className="skill-actions"><AppButton tone="ghost" onClick={() => setPickingSkill(true)}>更换 Skill</AppButton><AppButton tone="danger" onClick={() => onSetSkill(null)}>不使用 Skill</AppButton></div>
          {activeSkill.capabilities && activeSkill.capabilities.length > 0 ? <div className="skill-capabilities"><h4>能力声明</h4><div className="cap-list">{activeSkill.capabilities.map((cap) => <span key={cap.id} className="cap-tag" title={cap.description}>{cap.label}</span>)}</div></div> : null}
          {activeSkill.agentSkillMapping && Object.keys(activeSkill.agentSkillMapping).length > 0 ? <div className="skill-mapping"><h4>Agent Skill 映射</h4>{Object.entries(activeSkill.agentSkillMapping).map(([agent, sid]) => <span key={agent} className="map-tag">{agent} → {sid}</span>)}</div> : null}
          {activeSkill.content ? <pre className="skill-preview">{activeSkill.content.slice(0, 500)}{activeSkill.content.length > 500 ? '…' : ''}</pre> : null}
        </> : <>
          <h3>选择领域 Skill</h3>
          <p>选择后，分析调度单将嵌入Skill的分析框架、验证规则和输出标准。</p>
          {skills.length === 0 ? <div className="skill-empty-hint"><p>尚未创建任何领域Skill。<br />完成一次分析后，可在交付阶段沉淀为Skill，或手动在 03-领域分析Skills/ 目录创建。</p></div>
          : <div className="skill-list">{skills.map((s) => <button key={s.id} className="skill-choice-row" onClick={() => onSetSkill(s.id)}><div><strong>{s.name}</strong><small>{s.domain} · v{s.version}</small><small>{s.description}</small></div><CaretRight size={16} /></button>)}</div>}
        </>}
      </div>}
  </section>;
}

// ── 02 Data ──
export function DataStage({ task, refresh, notify }: { task: TaskDetail; refresh: Refresh; notify: Notify }) {
  return <div className="data-stage-wrapper">
    <div className="two-column-stage"><section className="work-section"><header><div><h2>文件投喂</h2><span>进入投喂区后再同步至正式 raw</span></div><AppButton tone="primary" icon={<Plus size={16} />} onClick={async () => refresh(await api.pickFiles(task.id, "inbox"))}>选择文件</AppButton></header><button className="large-dropzone" onClick={async () => refresh(await api.pickFiles(task.id, "inbox"))} onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag-active"); }} onDragLeave={(e) => e.currentTarget.classList.remove("drag-active")} onDrop={async (e) => { e.preventDefault(); e.currentTarget.classList.remove("drag-active"); const paths = Array.from(e.dataTransfer.files).map((f: any) => f.path).filter(Boolean); if (paths.length) { refresh(await api.dragFiles(task.id, "inbox", paths)); notify("文件已通过拖拽添加到投喂区"); } }}><UploadSimple size={32} /><strong>拖拽或点击选择文件</strong><span>支持 Excel、Word、PDF、PPT、Markdown、CSV</span></button></section>
    <section className="work-section"><header><div><h2>输入状态</h2><span>资料完整度 {task.inputCompleteness}</span></div><AppButton icon={<ArrowClockwise size={16} />} onClick={async () => { refresh(await api.syncFiles(task.id)); notify("已同步到 raw"); }}>同步到 raw</AppButton></header><div className="file-table"><div className="file-table-head"><span>文件名</span><span>区域</span><span>可信度</span><span>更新时间</span></div>{task.rawFiles.map((file) => <div key={file.path}><span><IconForFile file={file} />{file.name}</span><span>raw</span><span>{file.trust}</span><span>{file.modifiedAt}</span></div>)}</div></section></div>
    <ExternalSourcesModule taskId={task.id} notify={notify} />
  </div>;
}

// ── 03 Analysis ──
function AnalysisEditor({ task, promptPreview, previewSource, onCopy, onDispatch, onSave, activeSkill, aiState, aiEvents, aiInstalled, onAiExecute, onAiCancel, aiPanelOpen, setAiPanelOpen }: { task: TaskDetail; promptPreview: string; previewSource: "copy" | "dispatch" | null; onCopy: (draft: PromptDraft) => void; onDispatch: (draft: PromptDraft) => void; onSave: (draft: PromptDraft) => void; activeSkill?: DomainSkill; aiState: any; aiEvents: any[]; aiInstalled: any; onAiExecute: (draft: PromptDraft) => void; onAiCancel: () => void; aiPanelOpen: boolean; setAiPanelOpen: (v: boolean) => void }) {
  const [goal, setGoal] = useState("基于提供的资料，完成示例经营单元的首次分析，形成初版报告、关键结论、证据和待验证问题。");
  const [thinking, setThinking] = useState("从结构、趋势、异常、对比四个维度展开；主动寻找反例与替代解释；结合历史口径变化，关注指标一致性与可比性。");
  const [verification, setVerification] = useState("严格使用资料所载口径与单位；无法判断的内容明确标注并提出补充；关键结论必须注明来源文件与行/列。");
  const draft = (): PromptDraft => ({ goal, thinking, verification });
  const skillLabel = activeSkill ? `${activeSkill.name}（${activeSkill.domain} v${activeSkill.version}）` : '通用经营分析（未选择Skill）';
  const { aiRunning, canAiExecute } = aiCapability(aiInstalled, aiState);
  return <section className="editor-pane pane">
    <header className="editor-head"><div><h2>首次分析调度单</h2><p>生成时间：{new Date().toLocaleString('zh-CN')}　任务：{task.name}</p></div><div><AppButton tone="ghost">模板</AppButton><AppButton tone="ghost">清空</AppButton><AppButton tone="ghost" icon={<Copy size={14} />} onClick={() => onCopy(draft())}>复制</AppButton><AppButton tone="ghost" onClick={() => onSave(draft())}>保存草稿</AppButton></div></header>
    <div className="editor-scroll">
      <PromptSection number="1" title="必须补充"><div className="mini-table"><span>序号</span><span>补充项</span><span>当前状态</span><span>影响</span><span>建议返回格式</span><i>--</i><i>--</i><i>--</i><i>--</i><i>--</i></div></PromptSection>
      <div className="prompt-variables"><header><strong>Prompt 变量</strong><AppButton tone="ghost">管理</AppButton></header><div><span><b>任务ID</b>{task.name}</span><span><b>领域Skill</b>{skillLabel}</span><span><b>报告期间</b>202606</span><span><b>输出粒度</b>万元</span><span><b>单位风险阈值</b>未设置</span><button>+ 添加变量</button></div></div>
      <PromptSection number="2" title="分析目标与范围"><textarea value={goal} onChange={(event) => setGoal(event.target.value)} /></PromptSection>
      <PromptSection number="3" title="分析思路（AI 创造力引导）"><textarea value={thinking} onChange={(event) => setThinking(event.target.value)} /></PromptSection>
      <PromptSection number="4" title="校验与验证要求"><textarea value={verification} onChange={(event) => setVerification(event.target.value)} /></PromptSection>
      <PromptSection number="5" title="03 分析输出（四件套在 04 收工补齐）"><div className="output-checks"><label><input type="checkbox" defaultChecked />Markdown 初版报告</label><label><input type="checkbox" defaultChecked />关键结论与证据</label><label><input type="checkbox" defaultChecked />待验证问题</label><label><input type="checkbox" defaultChecked />执行回执</label></div></PromptSection>
    </div>
    <div className="dispatch-difference"><div><strong>三个按钮使用同一份提示词</strong><span>复制调度单：只复制，不改变任务状态。</span></div><div><span>开始外部分析：复制提示词，同时登记为"等待外部 Agent 回执"。</span></div><div><span>✨ 直接执行：调用本地 WorkBuddy AI 引擎，自动写入结果。需安装 WorkBuddy。</span></div></div>
    {promptPreview ? <section className="analysis-prompt-preview"><header><div><strong>调度单预览</strong><span>{previewSource === "dispatch" ? "已登记外部分析，等待回执" : "仅预览并复制，尚未登记执行"}</span></div><AppButton icon={<Copy size={14} />} onClick={async () => navigator.clipboard.writeText(promptPreview)}>再次复制</AppButton></header><pre>{promptPreview}</pre></section> : null}
    {aiPanelOpen || aiRunning ? <AIStreamPanel events={aiEvents} state={aiState} onCancel={() => { onAiCancel(); setAiPanelOpen(false); }} title="AI 直连分析" /> : null}
    <footer className="editor-actions">
      <AppButton icon={<Copy size={16} />} onClick={() => onCopy(draft())}>复制调度单并预览</AppButton>
      <AppButton tone="primary" icon={<Robot size={17} />} onClick={() => onDispatch(draft())}>开始外部分析并预览</AppButton>
      <AppButton tone="primary" icon={<Sparkle size={17} />} disabled={!canAiExecute} onClick={() => { onAiExecute(draft()); }} title={!aiInstalled?.installed ? "需要安装 WorkBuddy 才能使用 AI 直连" : aiRunning ? "AI 正在执行中" : "直接调用 WorkBuddy AI 引擎执行分析"}>✨ 直接执行{!aiInstalled?.installed ? "（未安装）" : ""}</AppButton>
    </footer>
  </section>;
}

export function AnalysisStage({ task, notify, refresh, skills, onSetSkill }: { task: TaskDetail; notify: Notify; refresh: Refresh; skills: DomainSkill[]; onSetSkill: (skillId: string | null) => Promise<void> }) {
  const [promptPreview, setPromptPreview] = useState(""); const [previewSource, setPreviewSource] = useState<"copy" | "dispatch" | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const { aiState, aiEvents, aiInstalled, execute: aiExecute, cancel: aiCancel } = useAiExecution(task.id, "analysis", notify, refresh);
  const copyPrompt = async (draft: PromptDraft) => { const prompt = await api.generatePrompt(task.id, "analysis", draft); setPromptPreview(prompt); setPreviewSource("copy"); try { await navigator.clipboard.writeText(prompt); notify("首次分析调度单已复制并显示预览"); } catch { notify("已显示调度单预览，可点击预览区再次复制"); } };
  const dispatchPrompt = async (draft: PromptDraft) => { const prompt = await api.dispatchPrompt(task.id, "analysis", draft); setPromptPreview(prompt); setPreviewSource("dispatch"); refresh(await api.getTask(task.id)); try { await navigator.clipboard.writeText(prompt); notify("调度单已复制并登记执行，等待外部 Agent 回执"); } catch { notify("已登记执行并显示预览，请从预览区复制调度单"); } };
  const refreshReceipt = async () => { refresh(await api.getTask(task.id)); notify("执行状态已刷新"); };
  const saveDraft = async (draft: PromptDraft) => { await api.saveFile(`${task.path}/notes/prompt-draft.json`, JSON.stringify(draft, null, 2)); notify("调度单草稿已保存"); };
  const executeAi = async (draft: PromptDraft) => { setAiPanelOpen(true); const prompt = await api.generatePrompt(task.id, "analysis", draft); setPromptPreview(prompt); await aiExecute(prompt); };
  const activeSkill = skills.find((s) => s.id === task.skillId);
  return <div className="analysis-canvas"><ContextPane task={task} onPick={async () => refresh(await api.pickFiles(task.id, "raw"))} onDropFiles={async (paths) => { refresh(await api.dragFiles(task.id, "raw", paths)); notify("文件已通过拖拽添加到 raw"); }} skills={skills} onSetSkill={async (sid) => { onSetSkill(sid); refresh(await api.getTask(task.id)); }} /><div className="resize-handle" /><AnalysisEditor task={task} promptPreview={promptPreview} previewSource={previewSource} onCopy={copyPrompt} onDispatch={dispatchPrompt} onSave={saveDraft} activeSkill={activeSkill} aiState={aiState} aiEvents={aiEvents} aiInstalled={aiInstalled} onAiExecute={executeAi} onAiCancel={aiCancel} aiPanelOpen={aiPanelOpen} setAiPanelOpen={setAiPanelOpen} /><div className="resize-handle" /><ReceiptPane task={task} onReveal={() => api.revealPath(`${task.path}/outputs`)} onRefresh={refreshReceipt} /></div>;
}

// ── 04 Four-piece ──
export function FourPieceStage({ task, refresh, notify }: { task: TaskDetail; refresh: Refresh; notify: Notify }) {
  const [mode, setMode] = useState<"manual" | "ai">("manual");
  const [selected, setSelected] = useState(task.requiredDocs[0]); const [content, setContent] = useState(selected?.content || ""); const [savedContent, setSavedContent] = useState(selected?.content || "");
  const [promptPreview, setPromptPreview] = useState("");
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const { aiState, aiEvents, aiInstalled, execute: aiExecute, cancel: aiCancel } = useAiExecution(task.id, "four-piece", notify, refresh);
  const { aiRunning, canAiExecute } = aiCapability(aiInstalled, aiState);
  const choose = async (doc: typeof selected) => { const value = doc.content || await api.readFile(doc.path); setSelected(doc); setContent(value); setSavedContent(value); setPromptPreview(""); };
  const previewCompletion = async (scope: string) => { const prompt = await api.generatePrompt(task.id, "four-piece", { goal: scope, thinking: "基于现有资料、初版报告和验证记录补齐，不编造缺失事实。", verification: "无法确认的内容写入待验证项，正式保存前由人工复核。" }); setPromptPreview(prompt); };
  const executeAiCompletion = async (scope: string) => { setAiPanelOpen(true); const prompt = await api.generatePrompt(task.id, "four-piece", { goal: scope, thinking: "基于现有资料、初版报告和验证记录补齐，不编造缺失事实。", verification: "无法确认的内容写入待验证项，正式保存前由人工复核。" }); setPromptPreview(prompt); await aiExecute(prompt); };
  const save = async () => { if (!selected) return; await api.saveFile(selected.path, content); const next = await api.getTask(task.id); refresh(next); const updated = next.requiredDocs.find((doc) => doc.path === selected.path); if (updated) setSelected(updated); setSavedContent(content); notify(`${selected.name} 已手工保存，仍可继续修改`); };
  return <div className="four-piece-stage">
    <section className="closeout-guide"><div><span>03 已生成初版分析</span><CaretRight size={14} /><strong>04 收工补齐四件套</strong><CaretRight size={14} /><span>05 验证并决定是否重分析</span></div><p>本步骤只整理分析依据和验证要求，不重新生成分析报告。</p></section>
    <div className="completion-mode" role="tablist" aria-label="四件套补齐方式"><button className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}><ClipboardText size={18} /><span><strong>手工补齐</strong><small>在工作区内选择文件、录入并保存</small></span></button><button className={mode === "ai" ? "active" : ""} onClick={() => setMode("ai")}><Robot size={18} /><span><strong>AI 辅助补齐</strong><small>复制调度单或直接执行，交给 AI 引擎</small></span></button></div>
    <div className="document-workspace"><aside><div className="four-piece-head"><div><h2>选择要补齐的文件</h2><small>{task.requiredDocs.filter((doc) => doc.filled).length}/4 已有内容</small></div>{mode === "ai" ? <AppButton icon={<Robot size={15} />} onClick={() => previewCompletion("检查并补齐全部四件套")}>AI补齐全部</AppButton> : null}</div>{task.requiredDocs.map((doc) => <label className={selected?.path === doc.path ? "doc-choice active" : "doc-choice"} key={doc.path}><input type="radio" name="four-piece-doc" checked={selected?.path === doc.path} onChange={() => choose(doc)} /><FileMd size={18} /><span><strong>{doc.name}</strong><small>{doc.filled ? "已有内容，可继续修改" : "尚未补齐"}</small></span><CaretRight size={14} /></label>)}</aside>
      {mode === "manual" ? <section className="document-editor"><header><div><h2>手工录入：{selected?.name}</h2><p>{content !== savedContent ? "有未保存修改" : "内容已与磁盘同步"}</p></div><div className="inline-actions"><AppButton icon={<UploadSimple size={15} />} onClick={async () => { refresh(await api.pickFiles(task.id, "notes/four-piece-support")); notify("佐证文件已上传到 notes/four-piece-support"); }}>上传佐证</AppButton><AppButton disabled={content === savedContent} onClick={() => { setContent(savedContent); notify("已撤回本次未保存修改"); }}>撤回修改</AppButton><AppButton tone="primary" disabled={content === savedContent} onClick={save}>保存本文件</AppButton></div></header><label className="manual-entry"><span>手工录入工作区</span><textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="在这里补充内容。表格和勾选项可以直接按 Markdown 格式录入。" /></label></section>
      : <section className="ai-completion-panel"><header><div><h2>AI 提示词预览</h2><p>先选择补齐当前或全部，再检查提示词并复制或直接执行。</p></div><div className="inline-actions"><AppButton icon={<Robot size={15} />} onClick={() => selected && previewCompletion(`只检查并补齐 ${selected.name}；其他四件套文件不得修改`)}>AI补齐当前</AppButton><AppButton disabled={!promptPreview} icon={<Copy size={15} />} onClick={async () => { await navigator.clipboard.writeText(promptPreview); notify("AI补齐调度单已复制"); }}>复制调度单</AppButton><AppButton tone="primary" icon={<Sparkle size={15} />} disabled={!canAiExecute} onClick={() => selected && executeAiCompletion(`只检查并补齐 ${selected.name}；其他四件套文件不得修改`)} title={!aiInstalled?.installed ? "需要安装 WorkBuddy" : aiRunning ? "AI 正在执行中" : "直接调用 WorkBuddy AI 引擎补齐"}>✨ 直接执行{!aiInstalled?.installed ? "（未安装）" : ""}</AppButton></div></header><div className="ai-scope"><span>当前选择</span><strong>{selected?.name}</strong><small>“直接执行”会调用 AI 引擎补齐；执行完成后切回手工补齐检查结果。</small></div><pre className={promptPreview ? "prompt-preview" : "prompt-preview empty"}>{promptPreview || "点击“AI补齐当前”或“直接执行”后，在这里预览完整调度单。"}</pre><small className="ai-refresh-note">AI 执行完成后，切回手工补齐检查并修改结果。</small></section>}
    </div>
    {aiPanelOpen || aiRunning ? <AIStreamPanel events={aiEvents} state={aiState} onCancel={() => { aiCancel(); setAiPanelOpen(false); }} title="AI 直连四件套补齐" /> : null}
  </div>;
}

// ── 05 Validation ──
export function ValidationStage({ task, refresh, notify }: { task: TaskDetail; refresh: Refresh; notify: Notify }) {
  const pending = task.validation.filter((item) => item.status !== "resolved");
  const resolved = task.validation.filter((item) => item.status === "resolved");
  const [selectedId, setSelectedId] = useState(pending[0]?.id || "general"); const [feedback, setFeedback] = useState("");
  const selected = task.validation.find((item) => item.id === selectedId);
  const [promptPreview, setPromptPreview] = useState(""); const [previewSource, setPreviewSource] = useState<"copy" | "dispatch" | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const { aiState, aiEvents, aiInstalled, execute: aiExecute, cancel: aiCancel } = useAiExecution(task.id, "reanalysis", notify, refresh);
  useEffect(() => { if (selectedId !== "general" && !task.validation.some((item) => item.id === selectedId && item.status !== "resolved")) setSelectedId(pending[0]?.id || "general"); }, [task.validation, selectedId]);
  const dispatch = async () => { const prompt = await api.dispatchPrompt(task.id, "reanalysis"); setPromptPreview(prompt); setPreviewSource("dispatch"); refresh(await api.getTask(task.id)); try { await navigator.clipboard.writeText(prompt); notify("重分析调度单已复制，外部 Agent 将读取验证补充后重做报告"); } catch { notify("已登记执行并显示预览，请从预览区复制调度单"); } };
  const previewOnly = async () => { const prompt = await api.generatePrompt(task.id, "reanalysis"); setPromptPreview(prompt); setPreviewSource("copy"); notify("重分析调度单已生成预览"); };
  const submit = async () => { if (!feedback.trim()) return; const question = selected?.title || "通用补充"; const body = `# 人工确认与补充\n\n## 对应问题\n${question}\n\n## 用户补充\n${feedback.trim()}\n`; refresh(await api.writeFeedback(task.id, selected?.id || "general", body)); setFeedback(""); notify("补充已写入，下一次重分析会自动读取"); };
  const { aiRunning, canAiExecute } = aiCapability(aiInstalled, aiState);
  const executeReanalysis = async () => { setAiPanelOpen(true); const prompt = await api.generatePrompt(task.id, "reanalysis"); setPromptPreview(prompt); await aiExecute(prompt); };
  return <div className="validation-stage"><section className="closeout-guide"><div><span>03 初版分析</span><CaretRight size={14} /><span>04 四件套已收工</span><CaretRight size={14} /><strong>05 人工验证与回流</strong></div><p>先记录确认结果；只有结论需要改变时才发起重分析。</p></section><div className="validation-workspace"><section className="validation-queue"><header><h2>第一步：选择验证项</h2><span>待处理 {pending.length} / 已处理 {resolved.length}</span></header>{pending.map((item) => <button className={selected?.id === item.id ? "active" : ""} key={item.id} onClick={() => setSelectedId(item.id)}><WarningCircle size={17} /><span><strong>{item.title}</strong><small>{item.source}</small></span><CaretRight size={15} /></button>)}{resolved.map((item) => <button className={selected?.id === item.id ? "active resolved" : "resolved"} key={item.id} onClick={() => setSelectedId(item.id)}><CheckCircle size={17} color="#4f9d76" /><span><strong>{item.title}</strong><small style={{color:'#4f9d76'}}>已处理 · {item.source}</small></span><CaretRight size={15} /></button>)}{!pending.length && !resolved.length ? <div className="queue-empty"><CheckCircle size={24} /><strong>暂无待确认问题</strong><span>仍可录入新的业务确认。</span></div> : null}<button className={selectedId === "general" ? "active general-feedback" : "general-feedback"} onClick={() => setSelectedId("general")}><Plus size={17} /><span><strong>其他补充</strong><small>新增事实、口径或行动进展</small></span><CaretRight size={15} /></button></section><section className="validation-detail"><header><div><h2>第二步：录入人工确认</h2><p>{selected?.title || "补充新信息"}</p></div></header>{selected ? <><div className="detail-block"><span>问题说明</span><p>{selected.description}</p></div><div className="detail-block"><span>证据位置</span><p>{selected.source || "未记录"}</p></div></> : <div className="detail-block"><span>适用场景</span><p>补充首次分析未覆盖的新事实、指标口径、业务确认或行动进展。</p></div>}<label className="field-label">确认结果<textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="填写确认的事实、口径、原因或行动进展。提交后保存到 validation 目录。" /></label><div className="detail-actions"><AppButton icon={<UploadSimple size={16} />} onClick={async () => { refresh(await api.pickFiles(task.id, "validation")); notify("附件已加入验证区"); }}>上传附件</AppButton><AppButton tone="primary" disabled={!feedback.trim()} onClick={submit}>保存确认结果</AppButton></div><div className="reanalysis-gate"><div><strong>第三步（按需）：重分析</strong><span>只有新增事实会改变报告结论时才执行。</span></div><div className="inline-actions"><AppButton icon={<Robot size={15} />} onClick={previewOnly}>预览调度单</AppButton><AppButton icon={<ArrowClockwise size={15} />} onClick={dispatch}>发起重分析并复制</AppButton><AppButton tone="primary" icon={<Sparkle size={15} />} disabled={!canAiExecute} onClick={executeReanalysis} title={!aiInstalled?.installed ? "需要安装 WorkBuddy" : aiRunning ? "AI 正在执行中" : "直接调用 WorkBuddy AI 引擎执行重分析"}>✨ 直接执行重分析{!aiInstalled?.installed ? "（未安装）" : ""}</AppButton></div></div>{aiPanelOpen || aiRunning ? <AIStreamPanel events={aiEvents} state={aiState} onCancel={() => { aiCancel(); setAiPanelOpen(false); }} title="AI 直连重分析" /> : null}<PromptPreviewPanel content={promptPreview} source={previewSource} onClose={() => setPromptPreview("")} /></section><ReceiptPane task={task} onReveal={() => api.revealPath(`${task.path}/outputs`)} onRefresh={async () => refresh(await api.getTask(task.id))} /></div></div>;
}

// ── 06 Delivery ──
export function DeliveryStage({ task, refresh, notify }: { task: TaskDetail; refresh: Refresh; notify: Notify }) {
  const [wordBusy, setWordBusy] = useState(false);
  const [preview, setPreview] = useState<{ name: string; content: string } | null>(null);
  const [promptPreview, setPromptPreview] = useState("");
  const [skillMode, setSkillMode] = useState<"idle" | "dispatching" | "pasting">("idle");
  const [skillName, setSkillName] = useState("");
  const [skillDomain, setSkillDomain] = useState("经营分析");
  const [skillPaste, setSkillPaste] = useState("");
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const { aiState, aiEvents, aiInstalled, execute: aiExecute, cancel: aiCancel } = useAiExecution(task.id, "html", notify, refresh);
  const { aiRunning, canAiExecute } = aiCapability(aiInstalled, aiState);
  const generate = async (kind: "html") => { const prompt = await api.generatePrompt(task.id, kind); setPromptPreview(prompt); try { await navigator.clipboard.writeText(prompt); notify(kind === "html" ? "HTML报告调度单已复制并显示预览" : ""); } catch { notify("已显示预览，可点击预览区再次复制"); } };
  const executeAiHtml = async () => { setAiPanelOpen(true); const prompt = await api.generatePrompt(task.id, "html"); setPromptPreview(prompt); await aiExecute(prompt); };
  const generateWord = async () => { setWordBusy(true); try { const result = await api.generateWordReport(task.id); refresh(result.task); notify(`Word 已生成：${result.outputName}`); await api.revealPath(result.outputPath); } catch (error: any) { notify(error.message || "Word 生成失败", "error"); } finally { setWordBusy(false); } };
  const startPrecipitate = () => setSkillMode("dispatching");
  const doPrecipitate = async () => { try { const name = skillName.trim() || task.name; const result = await api.precipitateSkill(task.id, { name, description: "从本次分析提炼的可复用方法", domain: skillDomain }); setPromptPreview(result.prompt); notify("提炼调度单已生成，复制后交给外部 AI Agent 执行"); setSkillMode("pasting"); } catch (error: any) { notify(error.message || "生成调度单失败", "error"); setSkillMode("idle"); } };
  const doSavePrecipitated = async () => { try { if (!skillPaste.trim()) { notify("请粘贴 AI 返回的 Skill 内容"); return; } const saved = await api.savePrecipitatedSkill(task.id, skillPaste); notify(`领域Skill已沉淀：${saved.name}，并已关联到当前任务`); refresh(await api.getTask(task.id)); setSkillMode("idle"); setSkillPaste(""); setSkillName(""); setPromptPreview(""); } catch (error: any) { notify(error.message || "保存失败", "error"); } };
  const cancelSkill = () => { setSkillMode("idle"); setSkillPaste(""); setPromptPreview(""); };
  const openOutput = async (file: FileEntry) => { if (file.type === "md") { setPreview({ name: file.name, content: await api.readFile(file.path) }); } else await api.revealPath(file.path); };
  return <div className="delivery-stage"><div className="delivery-layout"><section className="work-section"><header><div><h2>正式输出</h2><span>{task.outputs.length} 个文件</span></div><div className="inline-actions"><AppButton icon={<ArrowClockwise size={16} />} onClick={async () => refresh(await api.getTask(task.id))}>刷新</AppButton><AppButton icon={<FolderOpen size={16} />} onClick={() => api.revealPath(`${task.path}/outputs`)}>打开目录</AppButton></div></header><div className="output-list">{task.outputs.map((file) => <button key={file.path} onClick={() => openOutput(file)}><IconForFile file={file} /><span><strong>{file.name}</strong><small>{file.type === "md" ? "点击应用内预览" : "点击在系统中打开"} · {file.sizeKb} KB</small></span><CaretRight size={15} /></button>)}{!task.outputs.length ? <div className="output-empty">目录中暂无正式输出。请先在 03 完成分析并生成 Markdown 报告。</div> : null}</div></section><section className="work-section"><header><div><h2>交付工具</h2><span>应用内转换会直接写入 outputs</span></div></header><button className="command-row" onClick={generateWord} disabled={wordBusy}><FileDoc size={21} />{wordBusy ? <span><strong>正在生成 Word…</strong><small>读取最新 Markdown 正式报告</small></span> : <span><strong>直接生成 Word 报告</strong><small>从 outputs 中最新的 .md 报告生成 .docx</small></span>}<CaretRight size={15} /></button><button className="command-row" onClick={() => generate("html")}><SquaresFour size={21} /><span><strong>生成 HTML 报告调度单</strong><small>复制调度单交给外部 Agent，或直接执行</small></span><CaretRight size={15} /></button><div className="html-direct-actions"><AppButton tone="primary" icon={<Sparkle size={15} />} disabled={!canAiExecute} onClick={executeAiHtml} title={!aiInstalled?.installed ? "需要安装 WorkBuddy" : aiRunning ? "AI 正在执行中" : "直接调用 WorkBuddy AI 引擎生成 HTML"}>✨ 直接生成 HTML{!aiInstalled?.installed ? "（未安装）" : ""}</AppButton></div><button className="command-row" onClick={startPrecipitate}><Robot size={21} /><span><strong>沉淀领域 Skill</strong><small>生成提炼调度单 → AI 提炼 → 粘贴确认写入</small></span><CaretRight size={15} /></button></section></div>
    {skillMode !== "idle" ? <section className="skill-precipitate-panel"><header><div><strong>Skill 沉淀</strong><span>{skillMode === "dispatching" ? "步骤1：输入基本信息 → 生成提炼调度单" : "步骤2：粘贴 AI 返回的结果 → 确认写入"}</span></div><AppButton onClick={cancelSkill}>取消</AppButton></header><div className="skill-precipitate-body">{skillMode === "dispatching" ? <><div className="skill-draft-fields"><label>Skill 名称<input value={skillName} onChange={(e) => setSkillName(e.target.value)} placeholder={task.name} /></label><label>领域分类<input value={skillDomain} onChange={(e) => setSkillDomain(e.target.value)} placeholder="经营分析" /></label></div><p className="skill-dispatch-hint">提炼调度单将包含：分析报告摘要、验证清单、口径映射、验证反馈。</p><AppButton tone="primary" icon={<Robot size={16} />} onClick={doPrecipitate}>生成提炼调度单</AppButton></> : <><PromptPreviewPanel content={promptPreview} source="copy" onClose={() => setPromptPreview("")} /><div className="skill-paste-area"><label>粘贴 AI Agent 返回的 Skill 内容（YAML + Markdown）<textarea value={skillPaste} onChange={(e) => setSkillPaste(e.target.value)} placeholder="将外部 AI Agent 返回的内容粘贴到这里…" rows={8} /></label><AppButton tone="primary" disabled={!skillPaste.trim()} onClick={doSavePrecipitated}>确认写入 03-领域分析Skills/</AppButton></div></>}</div></section> : null}
    {promptPreview && skillMode === "idle" ? <PromptPreviewPanel content={promptPreview} source="copy" onClose={() => setPromptPreview("")} /> : null}{preview ? <section className="markdown-preview"><header><div><h2>Markdown 输出预览</h2><span>{preview.name}</span></div><AppButton onClick={() => setPreview(null)}>关闭预览</AppButton></header><article>{preview.content}</article></section> : null}{aiPanelOpen || aiRunning ? <AIStreamPanel events={aiEvents} state={aiState} onCancel={() => { aiCancel(); setAiPanelOpen(false); }} title="AI 直连 HTML 报告生成" /> : null}</div>;
}

// ── 07 Evaluation ──
export function EvaluationStage({ task, refresh, notify }: { task: TaskDetail; refresh: Refresh; notify: Notify }) {
  const [running, setRunning] = useState(false);
  const [promptPreview, setPromptPreview] = useState("");
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const { aiState, aiEvents, aiInstalled, execute: aiExecute, cancel: aiCancel } = useAiExecution(task.id, "evaluation", notify, refresh);
  const { aiRunning, canAiExecute } = aiCapability(aiInstalled, aiState);
  const checks = task.evaluation.checks || [];
  const run = async () => { setRunning(true); refresh(await api.runEvaluation(task.id)); setRunning(false); notify("本地规则检查已完成"); };
  const copy = async () => { const prompt = await api.generatePrompt(task.id, "evaluation"); setPromptPreview(prompt); try { await navigator.clipboard.writeText(prompt); notify("AI评测调度单已复制并显示预览"); } catch { notify("已显示预览，可点击预览区再次复制"); } };
  const executeAiEvaluation = async () => { setAiPanelOpen(true); const prompt = await api.generatePrompt(task.id, "evaluation"); setPromptPreview(prompt); await aiExecute(prompt); };
  return <div className="evaluation-layout"><section className="work-section span-two"><header><div><h2>本地规则检查</h2><span>检查文件、来源登记和输出追溯痕迹（纯本地规则，不调用 AI）</span></div><AppButton tone="primary" icon={running ? <Spinner /> : <ShieldCheck size={16} />} onClick={run} disabled={running}>{running ? "检查中" : "运行本地规则检查"}</AppButton></header>{checks.length === 0 ? <div className="check-row muted"><WarningCircle size={17} color="#7b8b94" /><strong>尚未运行本地规则检查</strong><span>点击运行后生成检查项</span></div> : checks.map((check) => <div className="check-row" key={check.id}><CheckCircle size={17} color={evaluationStatusColor(check.status)} /><strong>{check.title}</strong><span>{evaluationStatusLabel(check.status)} {typeof check.score === "number" && typeof check.max === "number" ? `(${check.score}/${check.max})` : ""}</span>{check.detail ? <small>{check.detail}</small> : null}</div>)}</section><section className="work-section score-section"><header><h2>AI评测</h2><span>调用 AI 引擎抽查数字、口径与推理</span></header><strong className="score">{task.evaluation.score ?? "-"}<small>/100</small></strong><p>{task.evaluation.status}<br />{task.evaluation.checkedAt}</p><div className="inline-actions"><AppButton onClick={copy}>生成调度单</AppButton><AppButton tone="primary" icon={<Sparkle size={15} />} disabled={!canAiExecute} onClick={executeAiEvaluation} title={!aiInstalled?.installed ? "需要安装 WorkBuddy" : aiRunning ? "AI 正在执行中" : "直接调用 WorkBuddy AI 引擎评测"}>✨ 直接执行评测{!aiInstalled?.installed ? "（未安装）" : ""}</AppButton></div></section><section className="work-section span-three"><header><div><h2>评测边界</h2><span>三层检查分工明确</span></div></header><div className="boundary-grid"><div><HardDrives size={24} /><strong>本地规则检查</strong><p>判断文件能否读取、来源是否登记、输出是否留下追溯痕迹。不调用 AI。</p></div><div><Robot size={24} /><strong>AI评测</strong><p>调用 AI 引擎抽查数字、口径、推理、反证和结论边界。</p></div><div><WarningCircle size={24} /><strong>人工确认</strong><p>文件可读不等于业务结论正确，最终规则仍需人确认。</p></div></div></section><PromptPreviewPanel content={promptPreview} source="copy" onClose={() => setPromptPreview("")} />{aiPanelOpen || aiRunning ? <AIStreamPanel events={aiEvents} state={aiState} onCancel={() => { aiCancel(); setAiPanelOpen(false); }} title="AI 直连评测" /> : null}</div>;
}
