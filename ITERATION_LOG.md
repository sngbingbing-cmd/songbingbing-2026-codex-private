# 迭代日志

## v1.0.0 - 2026-06-28

作者：宋冰冰 & Codex

### 定位

从本地网页工作台演进为可安装、可升级、可公开维护的 macOS 桌面应用；旧版代码和业务工作区保持不变。

### 完成

- 建立 Electron + React + TypeScript 独立项目和安全 IPC 桥。
- 完整实现 01 概览、02 资料、03 分析、04 四件套、05 验证、06 交付、07 评测。
- 加入跨任务权威语义中心，正式语义由人工确认，AI 负责候选、证据和回流。
- 新建任务自动生成 inbox、raw、working、notes、outputs、validation 和四件套模板。
- 支持文件选择、raw 同步、Finder 打开、任务归档/恢复、提示词生成、执行回执和轻量评测。
- 默认工作区改为 `~/Documents/AI原生数据分析工作台-应用版`，与旧版隔离。
- 加入 GitHub Actions、Release 自动更新配置、公开仓库文档、MIT 许可证和数据隔离规则。
- 生成 Apple Silicon DMG/ZIP 和专属应用图标。

### 验证

- TypeScript 类型检查通过。
- Workspace Service 73 项测试通过。
- 生产构建与 macOS 打包通过。
- 打包应用首次启动、语义中心和 Finder 跳转实机通过。
- Product Design 对照验收通过，详见 `design-qa.md`。

### 已知边界

- 当前构建未使用 Apple Developer ID 签名和公证，公开分发前需要配置凭据。
- GitHub 仓库 owner 仍为占位符，建仓后运行 `npm run configure:repo -- <owner>`。
- 当前 AI 调度以结构化提示词与执行回执为核心，后续可增加可插拔模型/Agent 适配器。
