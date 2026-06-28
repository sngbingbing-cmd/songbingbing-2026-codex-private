# macOS 发布

## 本地未签名构建

运行 `npm run dist:mac`。该产物用于本机验证，其他 Mac 可能出现 Gatekeeper 提示。

## GitHub Release

运行 `npm run configure:repo -- <owner> <repo>`，提交修改，推送 `v1.0.0` 之类的标签。发布工作流会生成 DMG、ZIP 和自动更新元数据。

## 正式公开分发

配置 Apple Developer ID 签名和公证所需的 GitHub Secrets：`CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`。发布前在真实干净账户上验证首次启动、升级和工作区迁移。
