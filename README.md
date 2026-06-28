# AI原生数据分析工作台

作者：宋冰冰 & Codex
版本：v1.0.0（macOS MVP）

一个本地优先的桌面分析工作台。它把资料准备、AI 调度、四件套沉淀、人工验证、正式交付、后台评测和权威语义层放进同一条可追踪流程。应用源代码与业务工作区分离，公开仓库不包含任何真实业务数据。

## 本地运行

要求：macOS、Node.js 20+、npm 10+。

```bash
npm install
npm run dev
```

首次启动会在 `~/Documents/AI原生数据分析工作台` 创建空白工作区和一个无业务数据的示例任务。

## 构建 macOS 安装包

```bash
npm run dist:mac
```

产物位于 `release/`。未配置 Apple Developer ID 时为未签名构建，适合本机验证；公开分发建议配置签名与公证。

## 工作流

1. 概览：任务结构、分析状态、语义覆盖与评测状态。
2. 资料：投喂文件并同步到任务 raw 区。
3. 分析：生成首次分析或重分析调度提示词，AI 基于现有材料始终产出报告。
4. 四件套：维护分析请求、来源清单、口径映射、验证清单。
5. 验证：人工确认冲突、缺口和反馈回流。
6. 交付：管理正式输出物。
7. 评测：手动触发轻量 AI 检查和后台抽查。

权威语义中心独立于单个任务，正式定义只能人工确认；AI 可以发现候选、给出依据并推动语义层持续生长。

## GitHub 发布与升级

1. 创建 GitHub 仓库。
2. 运行 `npm run configure:repo -- <GitHub用户名> <仓库名>`。
3. 推送代码并创建 `v*` 标签，GitHub Actions 会构建 DMG 和 ZIP。
4. 在仓库 Secrets 中配置 Apple 签名与公证变量后，可发布供他人直接安装的可信版本。

应用通过 `electron-updater` 检查 GitHub Releases。仓库地址未配置时，检查更新会安全返回“当前版本”。详细步骤见 [发布说明](docs/releasing.md)。

## 数据边界

- 源码仓库：应用代码、空白模板、公开文档和测试。
- 用户工作区：原始资料、分析任务、执行回执、权威语义和输出物。
- 应用只读写用户明确选择的工作区；所有相对路径均经过越界校验。

## 验证

```bash
npm run typecheck
npm test
npm run build
```

架构说明见 [docs/architecture.md](docs/architecture.md)，旧版迁移见 [docs/migration.md](docs/migration.md)。
