# Douyin 专属后端下载器与会话管理集成

## Goal

为 Douyin 增加一个专属后端下载器，并把 Douyin 下载所需的 Cookie/登录态管理从浏览器扩展迁移到应用内可控的 Playwright 会话流程，保持现有下载编排可观测、可维护。

## Requirements

- 仅影响 Douyin 路由，不改动 YouTube / Bilibili / 其他平台的既有下载行为。
- 新后端必须能在现有桌面应用运行环境中稳定启动和调用。
- 新后端必须像 `yt-dlp` / `gallery-dl` 一样，支持 bootstart 时自动安装，然后在后续下载中复用已安装结果。
- 新后端采用 Python managed runtime 形态，和现有 `yt-dlp` macOS bootstrap 共用同类安装思路。
- Douyin 的 Cookie 获取与刷新不再依赖浏览器扩展；扩展可继续保留其它功能。
- 应用内必须提供用户可见的 Douyin 登录/刷新入口，并能保存 Playwright 抓取到的会话。
- Douyin 下载时必须优先使用应用托管的会话 Cookie。
- 失败时必须有明确错误和恢复路径，不能把 Douyin 下载链路变成不可诊断的单点失败。
- 必须能纳入现有运行时状态与版本检查体系，至少做到可检测、可诊断。
- 不得破坏当前下载队列、进度事件和完成事件契约。

## Acceptance Criteria

- [ ] Douyin 请求会优先走专属后端下载器。
- [ ] 设置页存在 Douyin 登录/刷新入口，并能成功拉起 Playwright 会话获取 Cookie。
- [ ] 应用能保存并复用 Douyin 登录 Cookie，不再依赖浏览器扩展提供 Douyin Cookie。
- [ ] 使用应用托管 Cookie 时，实测 Douyin 单条视频下载可以成功。
- [ ] Douyin 会话缺失或失效时，系统能给出明确状态或恢复入口。
- [ ] 现有非 Douyin 平台下载行为不受影响。
- [ ] 运行时状态/日志能区分 Douyin 运行时可用性与 Douyin 会话可用性。
- [ ] 新集成通过类型检查/测试验证，且不引入已知回归。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.

## Confirmed Facts

- 仓库当前已经把 Douyin 路由切到了 `douyin-dl`，并集成了 managed runtime 安装与状态检查。
- 仓库已经有运行时依赖管理、侧车二进制管理、设置页、Electron IPC 命令桥和下载编排层。
- 上游 `douyin-downloader` 提供 CLI、Playwright `cookie_fetcher`、以及可选浏览器兜底能力。
- 实测在无完整浏览器会话时，`douyin-dl` 会在 `/aweme/v1/web/aweme/detail/` 被反爬拦截并失败。
- 实测使用 Playwright 抓取完整 Douyin Cookie 后，同一视频链接可成功下载。

## Open Questions

- 第一版 Douyin 会话失效时，是否只提供手动刷新入口，还是要自动提示/自动拉起刷新流程？

## Decision

- 第一版只覆盖单条 Douyin 页面下载。
- 不做批量下载。
- 采用 Python managed runtime 安装。
- Douyin 下载优先使用 `douyin-dl`。
- Douyin Cookie 管理从浏览器扩展中移除，改为应用内 Playwright 获取与保存。
- 浏览器扩展其它功能继续保留。
