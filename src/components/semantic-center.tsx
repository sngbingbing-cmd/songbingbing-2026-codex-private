import { useEffect, useState } from "react";
import {
  ArrowClockwise, BookOpenText, CaretDown, CaretRight, Check, CheckCircle,
  Copy, MagnifyingGlass, Plus, Robot, UploadSimple, WarningCircle
} from "@phosphor-icons/react";
import { api } from "../api";
import { findIncompleteItems, isIncompleteValue, parseMarkdownTable, updateMarkdownTableCell } from "../semantic-table-utils";
import type { AppSnapshot, SemanticCandidate, SemanticSnapshot, StageId } from "../types";
import { AppButton, escapeHtml } from "./ui";

function SemanticProposalEditor({ item, onChange, notify, selected, onToggle }: { item: SemanticCandidate; onChange: (semantic: SemanticSnapshot) => void; notify: (m: string) => void; selected: boolean; onToggle: (id: string) => void }) {
  const [draft, setDraft] = useState(item); const [confirmedBy, setConfirmedBy] = useState("宋冰冰"); const [reason, setReason] = useState("");
  useEffect(() => setDraft(item), [item]);
  const save = async () => { onChange(await api.updateSemanticCandidate(item.id, draft)); notify("候选修改已保存"); };
  const approve = async () => { await save(); onChange(await api.approveSemanticCandidate(item.id, confirmedBy)); notify("已人工确认并写入正式语义表"); };
  const reject = async () => { onChange(await api.rejectSemanticCandidate(item.id, reason)); notify("候选已退回并保留记录"); };
  return <article className="semantic-review-card" style={{ opacity: selected ? 1 : 0.7 }}><header><label className="semantic-checkbox"><input type="checkbox" checked={selected} onChange={() => onToggle(item.id)} /><span className="checkmark" /></label><span>{item.typeLabel || ({ metric: "指标口径", entity: "实体定义", source: "数据源" } as Record<string, string>)[item.type] || item.type}</span><strong>{item.title}</strong></header><label>语义名称<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label>建议定义<textarea value={draft.proposed} onChange={(event) => setDraft({ ...draft, proposed: event.target.value })} /></label><label>证据与来源<textarea value={draft.evidence} onChange={(event) => setDraft({ ...draft, evidence: event.target.value })} /></label><label>适用范围与影响<textarea value={draft.impact} onChange={(event) => setDraft({ ...draft, impact: event.target.value })} /></label><div className="semantic-review-actions"><AppButton onClick={save}>保存修改</AppButton><label>确认人<input value={confirmedBy} onChange={(event) => setConfirmedBy(event.target.value)} /></label><AppButton tone="primary" onClick={approve}>人工确认并发布</AppButton></div><div className="semantic-reject"><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="填写退回原因" /><AppButton tone="danger" disabled={!reason.trim()} onClick={reject}>退回候选</AppButton></div></article>;
}

function IncompleteBar({ content, docName, onRefresh, notify }: { content: string; docName: string; onRefresh: () => Promise<void>; notify: (m: string) => void }) {
  const { colNames, items, dataRows } = parseMarkdownTable(content);
  const [editing, setEditing] = useState<{lineIdx:number;field:string}|null>(null);
  const [val, setVal] = useState('');
  if (colNames.length === 0) return null;
  const incomplete = findIncompleteItems({ colNames, items, dataRows });
  if (incomplete.length === 0) return <div className="incomplete-bar empty">所有字段已完善 <span>✓</span></div>;
  const doSave = async (lineIdx: number, field: string, value: string) => {
    const updated = updateMarkdownTableCell(content, lineIdx, field, value);
    await api.saveFile(`02-权威语义层/${docName}.md`, updated);
    await onRefresh();
    setEditing(null);
    notify(`${field}已更新`);
  };
  const displayName = (row: Record<string,string>) => row[colNames[0]] || row['指标'] || row['标准名称'] || '未命名';
  return <div className="incomplete-bar"><div className="incomplete-bar-header"><strong>待完善条目（{incomplete.length}条）</strong><span>点击空字段直接编辑，回车保存</span></div>{incomplete.map((item) => <div className="incomplete-item" key={item.lineIdx}><div className="incomplete-item-name">{displayName(item.row)}</div><div className="incomplete-item-fields">{colNames.filter((c) => isIncompleteValue(item.row[c] || '')).map((field) => <div className="incomplete-field" key={field}><span className="incomplete-field-label">{field}</span>{editing?.lineIdx === item.lineIdx && editing?.field === field ? <div className="incomplete-field-edit"><input autoFocus value={val} onChange={(e: any) => setVal(e.target.value)} onKeyDown={(e: any) => {if (e.key === 'Escape') setEditing(null); if (e.key === 'Enter') {doSave(item.lineIdx, field, val);}}}/><button className="incomplete-field-save" onClick={() => {doSave(item.lineIdx, field, val);}}>✓</button></div> : <span className="incomplete-field-value" onClick={() => {setEditing({lineIdx:item.lineIdx, field});setVal(item.row[field] || '');}}>{item.row[field] ? item.row[field].slice(0,40)+'…' : '点击填写'}</span>}</div>)}</div></div>)}</div>;
}

function FormalView({ snapshot, selectedId, setSelectedId, onRefresh, notify }: { snapshot: AppSnapshot; selectedId: string; setSelectedId: (id: string) => void; onRefresh: () => Promise<void>; notify: (m: string) => void }) {
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const selectedDoc = snapshot.semantic.docs.find((d: any) => d.id === selectedId);

  useEffect(() => { setPage(0); setExpandedId(null); }, [query, selectedId]);

  if (!selectedDoc) return <section className="semantic-layout"><div><h2>正式语义文件</h2>{snapshot.semantic.docs.map((doc: any) => <button className={`semantic-doc-row ${doc.id === selectedId ? "selected" : ""}`} key={doc.id} onClick={() => setSelectedId(doc.id)}><BookOpenText size={20} /><span><strong>{doc.title}</strong><small>{doc.count}条正式定义</small></span><CaretRight size={15} /></button>)}</div><div className="semantic-preview-empty">选择左侧文件查看语义条目</div></section>;
  const content = selectedDoc.content || '';
  const parsed = parseMarkdownTable(content);
  if (parsed.colNames.length === 0) return <section className="semantic-layout"><div><h2>正式语义文件</h2>{snapshot.semantic.docs.map((doc: any) => <button className={`semantic-doc-row ${doc.id === selectedId ? "selected" : ""}`} key={doc.id} onClick={() => setSelectedId(doc.id)}><BookOpenText size={20} /><span><strong>{doc.title}</strong><small>{doc.count}条正式定义</small></span><CaretRight size={15} /></button>)}</div><pre className="semantic-raw-preview">{content}</pre></section>;
  const firstCol = parsed.colNames[0];
  const allItems = parsed.items;

  const filtered = query.trim() ? allItems.filter((item) => {
    const row = item.row;
    return (row[firstCol] || '').toLowerCase().includes(query.toLowerCase()) ||
      parsed.colNames.some((c) => (row[c] || '').toLowerCase().includes(query.toLowerCase()));
  }) : allItems;
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const wideCols = new Set<string>();
  allItems.forEach((item) => { parsed.colNames.forEach((c) => { const v = item.row[c] || ''; if (v.length > 60) wideCols.add(c); }); });

  return <section className="semantic-layout"><div><h2>正式语义文件</h2>{snapshot.semantic.docs.map((doc: any) => <button className={`semantic-doc-row ${doc.id === selectedId ? "selected" : ""}`} key={doc.id} onClick={() => setSelectedId(doc.id)}><BookOpenText size={20} /><span><strong>{doc.title}</strong><small>{doc.count}条正式定义</small></span><CaretRight size={15} /></button>)}</div>
    <div className="formal-view-right">
      <h2>{selectedDoc.title}<span className="fvr-count">{filtered.length}/{allItems.length} 条</span></h2>
      <div className="fvr-search"><MagnifyingGlass size={14} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`搜索 ${parsed.colNames.slice(0,3).join(' / ')}…`} /><span className="fvr-search-hint">{filtered.length !== allItems.length ? `筛选 ${filtered.length} 条` : `${allItems.length} 条`}</span></div>
      <IncompleteBar content={content} docName={selectedDoc.title.replace(/\.md$/,'')} onRefresh={onRefresh} notify={notify} />
      <div className="fvr-table-wrap">
        <table className="fvr-table"><thead><tr><th className="fvr-th-name">{firstCol}</th>{parsed.colNames.filter(c => c !== firstCol).slice(0, 2).map(c => <th key={c} className={wideCols.has(c) ? "fvr-th-wide" : ""}>{c}</th>)}<th className="fvr-th-action">操作</th></tr></thead>
        <tbody>{paged.length === 0 ? <tr><td colSpan={4} className="fvr-empty">无匹配结果</td></tr> : paged.map((item, idx) => {
          const row = item.row;
          const rowKey = item.lineIdx;
          const isExp = expandedId === rowKey;
          const hasEmpty = parsed.colNames.some(c => { const v = row[c] || ''; return !v.trim() || /待确认|待补充|未知|todo/i.test(v); });
          return <tr key={rowKey} className={hasEmpty ? "has-empty" : ""}>
            <td className="fvr-td-name"><span className="fvr-exp-icon" onClick={() => setExpandedId(isExp ? null : rowKey)}>{isExp ? <CaretDown size={12} /> : <CaretRight size={12} />}</span><strong title={row[firstCol]} onClick={() => setExpandedId(isExp ? null : rowKey)}>{row[firstCol] || `条目${idx+1}`}</strong></td>
            {parsed.colNames.filter(c => c !== firstCol).slice(0, 2).map(c => <td key={c} className={wideCols.has(c) ? "fvr-td-wide" : ""} title={row[c]}>{wideCols.has(c) && !isExp ? ((row[c] || '').slice(0, 50) + (((row[c]||'').length > 50) ? '…' : '')) : (row[c] || '-')}</td>)}
            <td className="fvr-td-action"><button className="fvr-btn-detail" onClick={() => setExpandedId(isExp ? null : rowKey)}>{isExp ? '收起' : '详情'}</button></td>
          </tr>;
        })}</tbody></table>
        {expandedId ? (() => {
          const item = paged.find((it) => it.lineIdx === expandedId);
          if (!item) return null;
          const row = item.row;
          return <div className="fvr-detail-card"><header><strong>{row[firstCol]}</strong><button onClick={() => setExpandedId(null)}>✕</button></header><dl>{parsed.colNames.filter(c => c !== firstCol).map(c => <div key={c} className={`fvr-dl-row ${!row[c]?.trim() ? 'empty' : ''}`}><dt>{c}</dt><dd dangerouslySetInnerHTML={{ __html: escapeHtml(row[c] || '<em>待完善</em>').replace(/\n/g, '<br/>') }} /></div>)}</dl></div>;
        })() : null}
      </div>
      {totalPages > 1 ? <div className="fvr-pagination"><button disabled={safePage <= 0} onClick={() => setPage(p => p - 1)}>‹ 上一页</button><span>{safePage + 1} / {totalPages}</span><button disabled={safePage >= totalPages - 1} onClick={() => setPage(p => p + 1)}>下一页 ›</button></div> : null}
    </div>
  </section>;
}

export function SemanticCenter({ snapshot, onBack, onRefresh, onSemanticChange, notify }: { snapshot: AppSnapshot; onBack: () => void; onRefresh: () => Promise<void>; onSemanticChange: (semantic: SemanticSnapshot) => void; notify: (m: string, tone?: import("../types").ToastTone) => void }) {
  const [selectedId, setSelectedId] = useState(snapshot.semantic.docs[0]?.id || "");
  const [tab, setTab] = useState<"intake" | "review" | "formal">("intake");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<Partial<SemanticCandidate>>({ type: "metric", title: "", proposed: "", evidence: "", impact: "" });
  const [promptPreview, setPromptPreview] = useState("");
  const createCandidate = async () => { const next = await api.createSemanticCandidate(form); onSemanticChange(next); setForm({ type: form.type || "metric", title: "", proposed: "", evidence: "", impact: "" }); setTab("review"); notify("人工录入已进入待确认候选"); };
  const previewMaintenancePrompt = async () => { setPromptPreview(await api.generateSemanticPrompt()); };
  return <main className="global-content">
    <header className="global-content-head"><div><h1>权威语义中心</h1><p>人工或材料进入候选区，AI负责整理，只有人工确认后才能写入正式语义。</p></div><div className="inline-actions"><AppButton icon={<ArrowClockwise size={16} />} onClick={onRefresh}>刷新</AppButton><AppButton onClick={onBack}>返回任务</AppButton></div></header>
    <section className="semantic-flow"><span>1 人工录入 / 上传材料</span><CaretRight size={14} /><span>2 AI 整理候选</span><CaretRight size={14} /><span>3 人工修改与确认</span><CaretRight size={14} /><strong>4 发布正式语义</strong></section>
    <div className="semantic-summary"><div><span>正式条目</span><strong>{snapshot.semantic.docs.reduce((sum, doc) => sum + doc.count, 0)}</strong></div><div><span>待确认</span><strong>{snapshot.semantic.pending.length}</strong></div><div><span>待完善字段</span><strong onClick={() => { setTab("formal"); setSelectedId(snapshot.semantic.docs[0]?.id || ""); }} style={{cursor: 'pointer', textDecoration: 'underline dotted', color: '#126d74'}} title="点击跳转正式语义，查看缺失条目">{snapshot.semantic.docs.reduce((sum, doc) => sum + doc.incomplete, 0)}</strong></div></div>
    <nav className="semantic-tabs"><button className={tab === "intake" ? "active" : ""} onClick={() => setTab("intake")}>录入与材料</button><button className={tab === "review" ? "active" : ""} onClick={() => setTab("review")}>候选确认 ({snapshot.semantic.pending.length})</button><button className={tab === "formal" ? "active" : ""} onClick={() => setTab("formal")}>正式语义</button></nav>
    {tab === "intake" ? <section className="semantic-intake"><div className="semantic-form"><header><div><h2>人工录入候选</h2><span>录入后仍需在“候选确认”中人工发布</span></div></header><label>语义类型<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="metric">指标口径</option><option value="entity">实体定义</option><option value="source">数据源</option></select></label><label>语义名称<input value={form.title || ""} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="例如：物业费收缴率" /></label><label>建议定义<textarea value={form.proposed || ""} onChange={(event) => setForm({ ...form, proposed: event.target.value })} placeholder="填写定义、计算方式或数据源说明" /></label><label>证据与来源<textarea value={form.evidence || ""} onChange={(event) => setForm({ ...form, evidence: event.target.value })} placeholder="文件、制度、责任人或任务路径" /></label><label>适用范围与影响<textarea value={form.impact || ""} onChange={(event) => setForm({ ...form, impact: event.target.value })} /></label><AppButton tone="primary" disabled={!form.title?.trim() || !form.proposed?.trim()} onClick={createCandidate}>保存为待确认候选</AppButton></div><div className="semantic-ai-intake"><header><div><h2>上传材料，由 AI 整理</h2><span>支持制度、口径表、说明文档和历史任务材料</span></div><AppButton icon={<UploadSimple size={16} />} onClick={async () => { const count = await api.uploadSemanticMaterials(); notify(count ? `已上传 ${count} 个材料文件` : "未选择文件"); }}>上传文件</AppButton></header><AppButton icon={<Robot size={16} />} onClick={previewMaintenancePrompt}>生成 AI 维护提示词</AppButton><pre className={promptPreview ? "prompt-preview" : "prompt-preview empty"}>{promptPreview || "上传材料后生成提示词。AI只能把整理结果写入待确认建议，不能修改正式语义。"}</pre><AppButton disabled={!promptPreview} tone="primary" icon={<Copy size={15} />} onClick={async () => { await navigator.clipboard.writeText(promptPreview); notify("AI语义维护提示词已复制"); }}>复制提示词</AppButton></div></section> : null}
    {tab === "review" ? <section className="semantic-review-list">{snapshot.semantic.pending.length ? <><header className="semantic-batch-bar"><label className="semantic-checkbox"><input type="checkbox" checked={selectedIds.size === snapshot.semantic.pending.length} onChange={() => { if (selectedIds.size === snapshot.semantic.pending.length) setSelectedIds(new Set()); else setSelectedIds(new Set(snapshot.semantic.pending.map((item) => item.id))); }} /><span className="checkmark" /></label><span>全选（{selectedIds.size}/{snapshot.semantic.pending.length}）</span><AppButton tone="primary" disabled={!selectedIds.size} onClick={async () => { const ids = Array.from(selectedIds); try { const approved = await api.approveSemanticCandidates(ids, "宋冰冰"); onSemanticChange(approved); setSelectedIds(new Set()); notify(`已确认发布 ${ids.length} 条`); } catch (e: any) { notify(e.message || "批量确认失败", "error"); } }}>批量确认发布</AppButton><AppButton tone="danger" disabled={!selectedIds.size} onClick={async () => { const ids = Array.from(selectedIds); try { const rejected = await api.rejectSemanticCandidates(ids, "批量退回"); onSemanticChange(rejected); setSelectedIds(new Set()); notify(`已退回 ${ids.length} 条`); } catch (e: any) { notify(e.message || "批量退回失败", "error"); } }}>批量退回</AppButton></header>{snapshot.semantic.pending.map((item) => <SemanticProposalEditor key={item.id} item={item} onChange={onSemanticChange} notify={notify} selected={selectedIds.has(item.id)} onToggle={(id) => { setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }} />)}</> : <div className="semantic-empty"><CheckCircle size={28} /><strong>没有待确认候选</strong><span>从人工录入或 AI 整理开始。</span></div>}</section> : null}
    {tab === "formal" ? <FormalView snapshot={snapshot} selectedId={selectedId} setSelectedId={setSelectedId} onRefresh={onRefresh} notify={notify} /> : null}
  </main>;
}

export { FormalView };
