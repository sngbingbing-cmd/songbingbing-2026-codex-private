import { CheckCircle, File, FileCsv, FileDoc, FileMd } from "@phosphor-icons/react";
import type { FileEntry } from "../types";

export function IconForFile({ file }: { file: FileEntry }) {
  const props = { size: 20, weight: "duotone" as const };
  if (file.type === "xlsx" || file.type === "csv") return <FileCsv {...props} color="#2d9b65" />;
  if (file.type === "docx") return <FileDoc {...props} color="#5c78aa" />;
  if (file.type === "md") return <FileMd {...props} color="#54789b" />;
  return <File {...props} />;
}

export function Spinner() { return <span className="spinner" aria-label="加载中" />; }

export function AppButton({ children, icon, tone = "default", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode; tone?: "default" | "primary" | "ghost" | "danger" }) {
  return <button className={`button button-${tone}`} {...props}>{icon}{children}</button>;
}

export function PromptSection({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return <section className="prompt-section"><h3>{number}. {title}</h3>{children}</section>;
}

export function Progress({ label, value }: { label: string; value: number }) {
  return <div className="progress-row"><span>{label}</span><i><b style={{ width: `${value}%` }} /></i><strong>{value}%</strong></div>;
}

export function escapeHtml(text: string): string {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function trustSummary(rawFiles: FileEntry[]) {
  if (rawFiles.length === 0) return { label: "无文件", color: "#7b8b94" };
  const trusts = rawFiles.map((f) => f.trust || "C");
  const minTrust = trusts.reduce((min, t) => (t < min ? t : min), "A" as string);
  if (minTrust === "A") return { label: "高可信（A级）", color: "#4f9d76" };
  if (minTrust === "B") return { label: "可信（B级）", color: "#c08a30" };
  return { label: "需谨慎（C级）", color: "#c44" };
}

export function evaluationStatusColor(status: string | undefined) {
  if (status === "pass") return "#4c9d78";
  if (status === "warn") return "#c08a30";
  if (status === "fail") return "#c44";
  return "#7b8b94";
}

export function evaluationStatusLabel(status: string | undefined) {
  if (status === "pass") return "通过";
  if (status === "warn") return "警告";
  if (status === "fail") return "不通过";
  return "未检查";
}
