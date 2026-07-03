import { ArrowClockwise, CheckCircle, ClockCounterClockwise, Copy, Files, FolderOpen } from "@phosphor-icons/react";
import { AppButton } from "./ui";
import type { TaskDetail } from "../types";

export function PromptPreviewPanel({ content, source, onClose }: { content: string; source?: "copy" | "dispatch" | null; onClose: () => void }) {
  return content ? <section className="prompt-preview-panel"><header><div><strong>调度单预览</strong><span>{source === "dispatch" ? "已登记执行，等待外部 Agent 回执" : "仅预览并复制，尚未登记执行"}</span></div><div className="inline-actions"><AppButton icon={<Copy size={14} />} onClick={async () => { try { await navigator.clipboard.writeText(content); } catch { /* Electron */ } }}>再次复制</AppButton><AppButton onClick={onClose}>收起</AppButton></div></header><pre>{content}</pre></section> : null;
}

export function ReceiptPane({ task, onReveal, onRefresh }: { task: TaskDetail; onReveal: () => void; onRefresh: () => void }) {
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
