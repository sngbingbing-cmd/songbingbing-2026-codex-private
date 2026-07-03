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

export interface EvaluationCheck {
  id: string;
  title: string;
  status: "pass" | "warn" | "fail";
  detail?: string;
  score?: number;
  max?: number;
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
  evaluation: { status: string; score?: number; checkedAt?: string; checks?: EvaluationCheck[] };
  semanticConflicts: number;
  domainSkill: string;
  skillId?: string;
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

// ── AI Executor ────────────────────────────────────────────
export type AIExecutionState = "idle" | "checking" | "running" | "completed" | "error" | "cancelled";

export interface AIStreamEvent {
  taskId: string;
  type: string;          // "assistant" | "tool_use" | "tool_result" | "system" | "raw_text" | "result"
  subtype?: string | null; // "started" | "cancelled" etc.
  content: string;
  toolName?: string | null;
}

export interface AIExecutionResult {
  taskId: string;
  outputLength: number;
  exitCode: number;
}

export interface AIInstallationInfo {
  installed: boolean;
  cliPath: string | null;
  platform: string;
  appPath?: string | null;
}

// ── Domain Skill ──────────────────────────────────────────────
export interface SkillCapability {
  id: string;       // e.g. "dataAnalysis"
  label: string;    // e.g. "数据计算"
  description: string;
}

export interface DomainSkill {
  id: string;             // filename without extension, e.g. "物业费收缴率分析"
  name: string;           // display name
  description: string;    // one-line summary
  domain: string;         // domain category, e.g. "经营分析", "成本管理"
  version: string;        // "1.0"
  content: string;        // full markdown body
  capabilities?: SkillCapability[];     // what this skill can do
  agentSkillMapping?: Record<string, string>; // agentType → skillId, e.g. {"workbuddy":"onewo-site-business-analysis"}
  createdAt: string;
  updatedAt: string;
  sourceTaskId?: string;  // which task this was precipitated from
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
  // Skill
  listSkills(): Promise<DomainSkill[]>;
  getSkill(skillId: string): Promise<DomainSkill | null>;
  saveSkill(skill: DomainSkill): Promise<DomainSkill>;
  deleteSkill(skillId: string): Promise<void>;
  setTaskSkill(taskId: string, skillId: string | null): Promise<TaskDetail>;
  precipitateSkill(taskId: string, skillDraft: { name: string; description: string; domain: string }): Promise<{ prompt: string }>;
  savePrecipitatedSkill(taskId: string, skillContent: string): Promise<DomainSkill>;
  // AI Executor
  checkAiInstallation(): Promise<AIInstallationInfo>;
  executeAiAnalysis(taskId: string, prompt: string, options?: Record<string, unknown>): Promise<{ started: boolean; taskId: string }>;
  cancelAiExecution(): Promise<{ cancelled: boolean; taskId?: string }>;
  onAiEvent(callback: (event: AIStreamEvent) => void): void;
  onAiComplete(callback: (result: AIExecutionResult) => void): void;
  onAiError(callback: (error: { taskId: string; error: string; stderr?: string; partialOutput?: string }) => void): void;
  removeAiListeners(): void;
}

declare global {
  interface Window { workbench?: WorkbenchApi }
}
