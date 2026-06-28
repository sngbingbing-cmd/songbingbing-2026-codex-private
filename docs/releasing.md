# macOS 与 Windows 发布

## 本地未签名构建

运行 `npm run dist:mac`。该产物用于本机验证，其他 Mac 可能出现 Gatekeeper 提示。

Windows x64 请在 Windows 主机运行 `npm run dist:win`。生成 NSIS 安装器和 ZIP；没有 Authenticode 证书时可能出现 SmartScreen 提示。

当前仓库为私有仓库时，GitHub Release 下载需要登录；应用内自动更新也无法匿名读取私有 Release。仓库公开后可直接启用更新，私有阶段建议从 Release 页面手动下载安装。

## GitHub Release

运行 `npm run configure:repo -- <owner> <repo>`，提交修改，推送 `v1.0.0` 之类的标签。发布工作流会在原生 macOS/Windows Runner 上生成 DMG、EXE、ZIP 和自动更新元数据，再统一写入 GitHub Release。

## 正式公开分发

配置 Apple Developer ID 签名和公证所需的 GitHub Secrets：`CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`。发布前在真实干净账户上验证首次启动、升级和工作区迁移。
