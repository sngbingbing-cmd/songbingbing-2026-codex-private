import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle, Robot, Sparkle, Spinner, X } from "@phosphor-icons/react";
import { api } from "../api";
import type { AIExecutionState, AIInstallationInfo, AIStreamEvent, TaskDetail, ToastTone } from "../types";
import { AppButton } from "./ui";

// ── AI execution hook (shared by all stages with ✨ direct execution) ──
export function useAiExecution(taskId: string, kind: string, notify?: (m: string, tone?: ToastTone) => void, refresh?: (task: TaskDetail) => void) {
  const [aiState, setAiState] = useState<AIExecutionState>("idle");
  const [aiEvents, setAiEvents] = useState<AIStreamEvent[]>([]);
  const [aiInstalled, setAiInstalled] = useState<AIInstallationInfo | null>(null);

  useEffect(() => {
    api.checkAiInstallation().then(setAiInstalled).catch(() => setAiInstalled({ installed: false, cliPath: null, platform: 'unknown' }));
  }, []);

  useEffect(() => {
    // Each on* call returns a precise unsubscribe for this callback.
    const unsubscribers: Array<() => void> = [];
    unsubscribers.push(api.onAiEvent((event: AIStreamEvent) => {
      if (event.taskId !== taskId) return;
      setAiEvents((prev) => [...prev, event]);
      if (event.type === 'system' && event.subtype === 'started') setAiState("running");
      if (event.type === 'system' && event.subtype === 'cancelled') setAiState("cancelled");
    }));
    unsubscribers.push(api.onAiComplete((result) => {
      if (result.taskId !== taskId) return;
      setAiState("completed");
      const label = kind === 'reanalysis' ? '重分析' : kind === 'four-piece' ? '四件套补齐' : kind === 'evaluation' ? '评测' : kind === 'html' ? 'HTML生成' : '分析';
      notify?.(`AI 直连${label}完成，结果已自动写入 outputs/`);
      if (refresh) api.getTask(taskId).then(refresh);
    }));
    unsubscribers.push(api.onAiError((error) => {
      if (error.taskId !== taskId) return;
      setAiState("error");
      notify?.(`AI 执行失败：${error.error}`, "error");
    }));
    return () => { unsubscribers.forEach((fn) => fn()); };
  }, [taskId]);

  const execute = async (prompt: string) => {
    setAiState("checking");
    setAiEvents([]);
    try {
      const result = await api.executeAiAnalysis(taskId, prompt, { maxTurns: 10, permissionMode: 'acceptEdits', kind });
      if (result.started) {
        setAiState("running");
        notify?.("AI 引擎已启动");
      } else {
        setAiState("error");
        notify?.("AI 引擎启动失败", "error");
      }
    } catch (error: any) {
      setAiState("error");
      notify?.(error.message || "AI 执行失败", "error");
    }
  };

  const cancel = async () => {
    await api.cancelAiExecution();
    setAiState("cancelled");
    notify?.("AI 执行已取消", "info");
  };

  return { aiState, aiEvents, aiInstalled, execute, cancel };
}

export function AIStreamPanel({ events, state, onCancel, title }: { events: AIStreamEvent[]; state: AIExecutionState; onCancel: () => void; title: string }) {
  const lastEvents = events.slice(-200);
  const statusLabel = state === "running" ? "AI 执行中…" : state === "checking" ? "正在启动…" : state === "completed" ? "执行完成" : state === "error" ? "执行失败" : state === "cancelled" ? "已取消" : "就绪";
  const statusColor = state === "running" || state === "checking" ? "#4f9d76" : state === "completed" ? "#4f9d76" : state === "error" ? "#c44" : "#7b8b94";

  return createPortal(
    <div className="ai-overlay" onClick={state === "running" ? undefined : onCancel}>
      <div className="ai-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ai-modal-head">
          <div className="ai-modal-title"><Sparkle size={20} color={statusColor} /><strong>{title}</strong><span className="ai-status-badge" style={{ color: statusColor, borderColor: statusColor }}>{statusLabel}</span></div>
          <div className="ai-modal-actions">
            {state === "running" ? <AppButton tone="danger" icon={<X size={15} />} onClick={onCancel}>取消执行</AppButton>
            : <AppButton tone="ghost" icon={<X size={15} />} onClick={onCancel}>关闭</AppButton>}
          </div>
        </header>
        <div className="ai-modal-body" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
          {lastEvents.length === 0 ? <div className="ai-modal-empty"><Spinner /><span>等待 AI 响应…</span></div> : lastEvents.map((event, index) => {
            const content = typeof event.content === 'string' ? event.content : JSON.stringify(event.content);
            const time = event.timestamp ? new Date(event.timestamp).toLocaleTimeString('zh-CN', { hour12: false }) : new Date().toLocaleTimeString('zh-CN', { hour12: false });
            if (event.type === "assistant") return <div key={index} className="ai-event ai-event-assistant"><div className="ai-event-meta"><Robot size={14} color="#4f9d76" /><span className="ai-event-label">AI</span><span className="ai-event-time">{time}</span></div><div className="ai-event-content">{content}</div></div>;
            if (event.type === "tool_use") return <div key={index} className="ai-event ai-event-tool"><div className="ai-event-meta"><span className="ai-tool-icon">🔧</span><span className="ai-event-label">工具调用</span><span className="ai-event-time">{time}</span></div><div className="ai-event-content">{event.toolName || content}</div></div>;
            if (event.type === "tool_result") return <div key={index} className="ai-event ai-event-result"><div className="ai-event-meta"><span className="ai-result-icon">📋</span><span className="ai-event-label">执行结果</span><span className="ai-event-time">{time}</span></div><div className="ai-event-content"><small>{content.slice(0, 500)}{content.length > 500 ? '…' : ''}</small></div></div>;
            if (event.type === "system") return <div key={index} className="ai-event ai-event-system"><div className="ai-event-meta"><span className="ai-sys-icon">⚙</span><span className="ai-event-time">{time}</span></div><div className="ai-event-content">{content}</div></div>;
            if (event.type === "result") return <div key={index} className="ai-event ai-event-result"><div className="ai-event-meta"><CheckCircle size={14} color="#4f9d76" /><span className="ai-event-label">最终结果</span></div><div className="ai-event-content">{content}</div></div>;
            return <div key={index} className="ai-event ai-event-raw"><div className="ai-event-meta"><span className="ai-raw-icon">📝</span><span className="ai-event-time">{time}</span></div><div className="ai-event-content">{content}</div></div>;
          })}
        </div>
        <footer className="ai-modal-foot">
          <span>{lastEvents.length} 条事件</span>
          <span className="ai-foot-hint">{state === "running" ? "AI 正在执行，请勿关闭窗口" : "执行已结束"}</span>
        </footer>
      </div>
    </div>,
    document.body
  );
}

// Helper: standard AI execution capability flags for a stage
export function aiCapability(aiInstalled: AIInstallationInfo | null, aiState: AIExecutionState) {
  const aiRunning = aiState === "running" || aiState === "checking";
  const canAiExecute = !!aiInstalled?.installed && (aiState === "idle" || aiState === "completed" || aiState === "error" || aiState === "cancelled");
  return { aiRunning, canAiExecute };
}
