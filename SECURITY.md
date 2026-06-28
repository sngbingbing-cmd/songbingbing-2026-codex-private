# 安全策略

请通过 GitHub Security Advisory 私下报告安全问题，不要在公开 Issue 中附业务数据。

应用使用 Electron context isolation、关闭 renderer Node 集成，并通过白名单 IPC 访问本地文件。工作区服务拒绝任何越过工作区根目录的路径。
