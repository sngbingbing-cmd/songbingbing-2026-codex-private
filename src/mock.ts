import type { AppSnapshot, ExternalSourceInfo, TaskDetail, TaskSummary } from "./types";

const taskRows: TaskSummary[] = [
  { id: "20260624_示例经营分析", name: "20260624_示例经营分析", path: "/Users/demo/Documents/AI原生数据分析工作台/04-分析任务/20260624_示例经营分析", stage: "analysis", stageLabel: "03 分析", archived: false, status: "active", rawCount: 127, outputCount: 8, updatedAt: "06-24", warningCount: 1 },
  { id: "20260624_半年度收缴专项", name: "20260624_半年度收缴专项", path: "/workspace/04-分析任务/20260624_半年度收缴专项", stage: "analysis", stageLabel: "03 分析", archived: false, status: "active", rawCount: 98, outputCount: 5, updatedAt: "06-24" },
  { id: "20260624_OKR6月进展", name: "20260624_OKR6月进展", path: "/workspace/04-分析任务/20260624_OKR6月进展", stage: "analysis", stageLabel: "03 分析", archived: false, status: "active", rawCount: 76, outputCount: 3, updatedAt: "06-24" },
  { id: "20260623_会员战略分析", name: "20260623_会员战略分析", path: "/workspace/04-分析任务/20260623_会员战略分析", stage: "data", stageLabel: "02 资料", archived: false, status: "ready", rawCount: 43, outputCount: 0, updatedAt: "06-23" },
  { id: "20260623_示例区域分析", name: "20260623_示例区域分析", path: "/workspace/04-分析任务/20260623_示例区域分析", stage: "data", stageLabel: "02 资料", archived: false, status: "ready", rawCount: 22, outputCount: 0, updatedAt: "06-23" },
  { id: "20260623_区域半年分析", name: "20260623_区域半年分析", path: "/workspace/04-分析任务/20260623_区域半年分析", stage: "validation", stageLabel: "05 验证", archived: false, status: "waiting", rawCount: 64, outputCount: 6, updatedAt: "06-23", warningCount: 2 },
  { id: "20260620_品质提升专项复盘", name: "20260620_品质提升专项复盘", path: "/workspace/04-分析任务/20260620_品质提升专项复盘", stage: "delivery", stageLabel: "06 交付", archived: true, status: "ready", rawCount: 88, outputCount: 7, updatedAt: "06-20" },
  { id: "20260618_人效分析专题", name: "20260618_人效分析专题", path: "/workspace/04-分析任务/20260618_人效分析专题", stage: "delivery", stageLabel: "06 交付", archived: true, status: "ready", rawCount: 66, outputCount: 6, updatedAt: "06-18" }
];

export const mockDetail: TaskDetail = {
  ...taskRows[0],
  inboxFiles: [],
  rawFiles: [
    { name: "输入补充任务.md", path: "/raw/输入补充任务.md", sizeKb: 3.2, modifiedAt: "2026-06-24", type: "md", trust: "A" },
    { name: "经营单元责任口径.xlsx", path: "/raw/经营单元责任口径.xlsx", sizeKb: 18.4, modifiedAt: "2026-06-24", type: "xlsx", trust: "A" },
    { name: "202605组织归属.xlsx", path: "/raw/202605组织归属.xlsx", sizeKb: 45.7, modifiedAt: "2026-06-24", type: "xlsx", trust: "A" },
    { name: "收缴清欠单位口径表.xlsx", path: "/raw/收缴清欠单位口径表.xlsx", sizeKb: 22.1, modifiedAt: "2026-06-24", type: "xlsx", trust: "B" },
    { name: "报告接收方展示说明.md", path: "/raw/报告接收方展示说明.md", sizeKb: 2.1, modifiedAt: "2026-06-24", type: "md", trust: "B" }
  ],
  outputs: [
    { name: "示例经营分析_初版.md", path: "/outputs/示例经营分析_初版.md", sizeKb: 14.2, modifiedAt: "2026-06-24", type: "md" },
    { name: "示例经营分析_管理层版.docx", path: "/outputs/示例经营分析_管理层版.docx", sizeKb: 86.4, modifiedAt: "2026-06-24", type: "docx" }
  ],
  notes: [],
  requiredDocs: [
    { name: "分析请求.md", path: "/task/分析请求.md", filled: true, content: "# 分析请求\n\n回答示例经营单元的现状、关键缺口、风险与行动优先级。" },
    { name: "来源清单.md", path: "/task/来源清单.md", filled: true, content: "# 来源清单\n\n已登记5份正式资料。" },
    { name: "口径映射.md", path: "/task/口径映射.md", filled: true, content: "# 口径映射\n\n收入、毛利、收缴采用202605责任口径。" },
    { name: "验证清单.md", path: "/task/验证清单.md", filled: false, content: "# 验证清单\n\n- [ ] 收缴清欠单位待确认" }
  ],
  validation: [
    { id: "v1", title: "分析请求仍需明确报告接收方", description: "影响输出层级和行动建议颗粒度", status: "pending", source: "分析请求.md" },
    { id: "v2", title: "收缴清欠单位口径待确认", description: "当前报告按万元展示，需业务确认", status: "warning", source: "口径映射.md" }
  ],
  sourceCoverage: 87,
  semanticCoverage: 95,
  inputCompleteness: "高",
  firstRun: { status: "未执行" },
  reanalysis: { status: "未执行" },
  evaluation: { status: "需关注", score: 78, checkedAt: "2026-06-24 09:45", checks: [] },
  semanticConflicts: 2,
  domainSkill: "通用经营分析",
  prompt: ""
};

export const mockSnapshot: AppSnapshot = {
  version: "1.1.0",
  workspacePath: "/Users/demo/Documents/AI原生数据分析工作台",
  workspaceName: "示例工作区",
  tasks: taskRows,
  selectedTask: mockDetail,
  semantic: {
    docs: [
      { id: "metrics", title: "指标口径", count: 23, incomplete: 4, content: "收入、毛利、收缴率、清欠回款等正式定义。" },
      { id: "entities", title: "实体字典", count: 18, incomplete: 2, content: "战区、阵地、项目和经营主题标准名称。" },
      { id: "sources", title: "数据源登记", count: 12, incomplete: 0, content: "权威源、辅助源和参考源登记。" }
    ],
    pending: [
      { id: "p1", type: "指标", title: "组织调整后经营口径", proposed: "责任口径以最新正式组织归属为准。", evidence: "组织映射表.xlsx", impact: "影响3个分析任务" },
      { id: "p2", type: "实体", title: "示例区域别名", proposed: "区域简称映射为正式组织名称。", evidence: "正式组织清单", impact: "影响1个任务" }
    ]
  },
  update: { status: "current" }
};

export const mockExternalSources: ExternalSourceInfo[] = [
  {
    path: "/Users/demo/Desktop/19人上半年材料",
    label: "19人上半年工作材料",
    lastScannedAt: "2026-06-29T08:30:00.000Z",
    totalFiles: 127,
    totalSizeKb: 18240.5,
    topLevelItems: [
      { name: "张三-财务负责人", isDirectory: true },
      { name: "李四-项目经理", isDirectory: true },
      { name: "王五-专项负责人", isDirectory: true },
      { name: "汇总说明.md", isDirectory: false },
    ],
    anomalies: [],
    scanStatus: "ok",
  },
];
