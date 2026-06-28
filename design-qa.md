# Design QA

- source visual truth path: `design/final-direction.png`
- implementation screenshot path: `design/qa-implementation.png`
- viewport: 1440 x 1024 CSS pixels, macOS desktop
- state: 03 分析 / 首次分析调度单；实现使用公开仓库可接受的匿名演示数据
- full-view comparison evidence: `design/qa-comparison.png`
- focused region comparison evidence: `design/qa-focused-workspace.png`（输入、提示词编辑器、执行回执与底部操作区）
- privacy note: 对照截图仅保留在本机，不纳入公开 Git 仓库

**Findings**

- No actionable P0/P1/P2 mismatch remains.
- [P3] 品牌文案存在有意差异
  Location: 顶部品牌栏。
  Evidence: 视觉目标保留旧版组织品牌；实现使用公开项目名、作者“宋冰冰 & Codex”和 v1.0.0。
  Impact: 不影响结构或可用性，且避免公开仓库错误使用组织品牌。
  Fix: 无需修复；属于公开分发边界的主动调整。

**Required Fidelity Surfaces**

- Fonts and typography: 中文系统字体层级、字重、行高、截断和密集小字号与目标一致；无负字距，长任务名正确截断。
- Spacing and layout rhythm: 全局栏、任务栏、七阶段、三栏工作面和状态栏均对齐；底部操作区已调整为视口内持续可见。
- Colors and visual tokens: 深色导航、浅灰画布、白色工作区、青绿色主操作和橙色提示与目标一致；没有渐变。
- Image quality and asset fidelity: 当前界面不依赖照片或插画；图标统一使用 Phosphor，macOS 应用图标也由同一图标库生成，未使用占位图或手绘 SVG。
- Copy and content: 七阶段、语义冲突、AI 评测、执行回执和“不因资料缺口阻塞报告”的工作台语义均完整保留。

**Patches Made Since Previous QA Pass**

- 使用 macOS 原生窗口控制按钮，移除重复模拟按钮。
- 将作者和版本放入品牌栏。
- 接通顶部搜索、工作区切换、继续分析、后台抽查、语义冲突和评测入口。
- 增加语义条目选择与 Markdown 预览。
- 缩短分析画布并固定底部操作区，避免被状态栏遮挡。

**Open Questions**

- Apple Developer ID 签名与公证需要仓库所有者后续提供凭据，不影响本机未签名构建。

**Implementation Checklist**

- [x] 参考图与实现同屏比较
- [x] 关键工作区局部放大比较
- [x] 原生 Electron 窗口实机检查
- [x] 七阶段与语义中心关键入口检查
- [x] TypeScript、单测和生产构建通过

**Follow-up Polish**

- 公共仓库确定后，可把正式仓库名和签名后的更新源写入发布配置。

final result: passed
