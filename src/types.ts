export type StageId = "overview" | "data" | "analysis" | "four-piece" | "validation" | "delivery" | "evaluation";
export type GlobalView = "tasks" | "semantic" | "evaluation" | "settings";
export type StatusTone = "ok" | "warning" | "danger" | "muted" | "active";
export type PromptKind = "analysis" | "reanalysis" | "four-piece" | "evaluation" | "html" | "skill";

export interface FileEntry {
  name: string;
  path: string;
  sizeKb: number;
  modifiedAt: string;
  type?: string;
  trust?: "A" | "B" | "C";
}

export interface TaskSummary {
  id: string;
  name: string;
  path: string;
  stage: StageId;
  stageLabel: string;
  archived: boolean;
  status: "active" | "waiting" | "ready" | "warning";
  rawCount: number;
  outputCount: number;
  updatedAt: string;
  warningCount?: number;
}

export interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  status: "pending" | "resolved" | "warning";
  source?: string;
}

export interface TaskDetail extends TaskSummary {
  inboxFiles: FileEntry[];
  rawFiles: FileEntry[];
  outputs: FileEntry[];
  notes: FileEntry[];
  requiredDocs: Array<{ name: string; path: string; filled: boolean; content?: string }>;
  validation: ChecklistItem[];
  sourceCoverage: number;
  semanticCoverage: number;
  inputCompleteness: "高" | "中" | "低";
  firstRun: { status: string; time?: string; receipt?: string };
  reanalysis: { status: string; time?: string; receipt?: string };
  evaluation: { status: string; score?: number; checkedAt?: string; checks?: ChecklistItem[] };
  semanticConflicts: number;
  domainSkill: string;
  prompt?: string;
}

export interface SemanticSnapshot {
  docs: Array<{ id: string; title: string; count: number; incomplete: number; content: string }>;
  pending: SemanticCandidate[];
}

export interface SemanticCandidate {
  id: string;
  type: "metric" | "entity" | "source" | string;
  typeLabel?: string;
  title: string;
  proposed: string;
  evidence: string;
  impact: string;
  details?: Record<string, string>;
  status?: string;
}

export interface AppSnapshot {
  version: string;
  workspacePath: string;
  workspaceName: string;
  tasks: TaskSummary[];
  selectedTask?: TaskDetail;
  semantic: SemanticSnapshot;
  update: { status: "idle" | "checking" | "available" | "downloading" | "downloaded" | "installing" | "current" | "error"; version?: string };
}

export interface ExternalSourceInfo {
  path: string;
  label: string;
  lastScannedAt: string;
  totalFiles: number;
  totalSizeKb: number;
  topLevelItems: Array<{ name: string; isDirectory: boolean }>;
  anomalies: string[];
  scanStatus: "ok" | "has_anomalies";
}

export interface PromptDraft {
  goal: string;
  thinking: string;
  verification: string;
}

export interface WorkbenchApi {
  getSnapshot(): Promise<AppSnapshot>;
  selectWorkspace(): Promise<AppSnapshot | null>;
  createTask(name: string): Promise<TaskDetail>;
  getTask(id: string): Promise<TaskDetail>;
  archiveTask(id: string, archived: boolean): Promise<void>;
  pickFiles(id: string, zone: "inbox" | "raw" | "validation" | "notes/four-piece-support"): Promise<TaskDetail>;
  syncFiles(id: string): Promise<TaskDetail>;
  readFile(path: string): Promise<string>;
  saveFile(path: string, content: string): Promise<void>;
  revealPath(path: string): Promise<void>;
  generatePrompt(id: string, kind: PromptKind, draft?: PromptDraft): Promise<string>;
  generateSemanticPrompt(): Promise<string>;
  createSemanticCandidate(input: Partial<SemanticCandidate>): Promise<SemanticSnapshot>;
  updateSemanticCandidate(id: string, patch: Partial<SemanticCandidate>): Promise<SemanticSnapshot>;
  approveSemanticCandidate(id: string, confirmedBy: string): Promise<SemanticSnapshot>;
  approveSemanticCandidates(ids: string[], confirmedBy: string): Promise<SemanticSnapshot>;
  rejectSemanticCandidate(id: string, reason: string): Promise<SemanticSnapshot>;
  rejectSemanticCandidates(ids: string[], reason: string): Promise<SemanticSnapshot>;
  uploadSemanticMaterials(): Promise<number>;
  generateWordReport(id: string): Promise<{ outputPath: string; outputName: string; sourcePath: string; task: TaskDetail }>;
  dispatchPrompt(id: string, kind: "analysis" | "reanalysis", draft?: PromptDraft): Promise<string>;
  getExternalSources(id: string): Promise<ExternalSourceInfo[]>;
  linkExternalSource(id: string, sourcePath: string, label?: string): Promise<ExternalSourceInfo>;
  refreshExternalSource(id: string, sourcePath: string): Promise<ExternalSourceInfo>;
  unlinkExternalSource(id: string, sourcePath: string): Promise<{ ok: boolean }>;
  revealExternalSource(id: string, sourcePath: string): Promise<void>;
  pickDirectory(): Promise<string | null>;
  writeFeedback(id: string, category: string, content: string): Promise<TaskDetail>;
  runEvaluation(id: string): Promise<TaskDetail>;
  checkForUpdates(): Promise<{ status: string; version?: string }>;
  downloadUpdate(): Promise<{ downloaded: boolean }>;
  installUpdate(): Promise<void>;
}

declare global {
  interface Window { workbench?: WorkbenchApi }
}
