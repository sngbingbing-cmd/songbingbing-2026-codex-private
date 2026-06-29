# AI原生数据分析工作台

作者：宋冰冰 & Codex
版本：v1.1.4（macOS / Windows）

一个本地优先的桌面分析工作台。它把资料准备、AI 调度、四件套沉淀、人工验证、正式交付、后台评测和权威语义层放进同一条可追踪流程。应用源代码与业务工作区分离，公开仓库不包含任何真实业务数据。

## 下载安装

请前往 [最新版本下载页](https://github.com/sngbingbing-cmd/songbingbing-2026-codex-private/releases/latest)：

- macOS（Apple 芯片）：下载名称包含 `mac-arm64.dmg` 的文件。
- Windows 10/11（x64）：下载名称包含 `Setup` 和 `windows-x64.exe` 的安装程序。
- Windows 免安装使用：下载名称包含 `windows-x64.zip` 的文件并解压运行。

当前安装包未购买商业代码签名证书。macOS 首次启动时可在“系统设置 -> 隐私与安全性”中确认打开；Windows 出现 SmartScreen 提示时，可选择“更多信息 -> 仍要运行”。

本应用不内置 AI 模型。使用者需要自行准备能够读取本机文件的 Agent，例如 Codex、Claude Code 或其他本地 AI 工具；工作台负责组织资料、生成调度提示词、记录验证过程和沉淀权威语义。

首次启动会在 `~/Documents/AI原生数据分析工作台-应用版` 创建本地工作区和无业务数据的示例任务。业务资料默认只保存在使用者自己的电脑上。

## 本地运行

开发要求：macOS 或 Windows、Node.js 20+、npm 10+。

```bash
npm install
npm run dev
```

开发模式同样使用本机工作区，请勿把真实业务资料提交到源码仓库。

## 构建 macOS 安装包

```bash
npm run dist:mac
```

产物位于 `release/`。未配置 Apple Developer ID 时为未签名构建，适合本机验证；公开分发建议配置签名与公证。

## 构建 Windows 安装包

请在 Windows x64 或 GitHub Actions `windows-latest` 上运行：

```bash
npm run dist:win
```

产物包括可选择安装目录的 NSIS `.exe` 安装器和便携 `.zip`。未配置 Windows 代码签名证书时，SmartScreen 可能显示未知发布者提示。

## 工作流

1. 概览：任务结构、分析状态、语义覆盖与评测状态。
2. 资料：投喂文件并同步到任务 raw 区；关联外部目录（递归盘点、只读引用），AI 调度自动注入路径。
3. 分析：生成首次分析或重分析调度提示词，AI 基于现有材料始终产出报告。
4. 四件套：维护分析请求、来源清单、口径映射、验证清单。
5. 验证：人工确认冲突、缺口和反馈回流。
6. 交付：管理正式输出物。
7. 评测：手动触发轻量 AI 检查和后台抽查。

权威语义中心独立于单个任务，正式定义只能人工确认；AI 可以发现候选、给出依据并推动语义层持续生长。

## GitHub 发布与升级

1. 创建 GitHub 仓库。
2. 运行 `npm run configure:repo -- <GitHub用户名> <仓库名>`。
3. 推送代码并创建 `v*` 标签，GitHub Actions 会同时构建 macOS DMG/ZIP 和 Windows EXE/ZIP。
4. 如需消除系统的未知发布者提示，可在仓库 Secrets 中配置 Apple 签名与公证变量。

应用通过 `electron-updater` 检查公开的 GitHub Releases。详细步骤见 [发布说明](docs/releasing.md)。

## 数据边界

- 源码仓库：应用代码、空白模板、公开文档和测试。
- 用户工作区：原始资料、分析任务、执行回执、权威语义和输出物。
- 应用读写本机工作区；用户主动关联的外部资料目录只做扫描和只读引用。所有工作区相对路径均经过越界校验。

## 验证

```bash
npm run typecheck
npm test
npm run build
```

架构说明见 [docs/architecture.md](docs/architecture.md)，旧版迁移见 [docs/migration.md](docs/migration.md)。
