# 定时自动刷新站点登录态 Cookies

## Goal

提升站点登录态 cookies 的稳定性：Ameow 在后台定时刷新已授权站点的本地登录态快照，减少用户遇到 cookies 过期后才手动同步的频率。

## User Value

- 用户主动同步一次登录态后，后续下载更不容易因为 cookies 过期失败。
- 下载仍然使用 Ameow 已保存的本地 cookies 快照，不退回到“每次下载实时从浏览器读取 cookies”的模式。
- 自动刷新作为内置功能默认开启，不增加用户配置负担。

## Confirmed Facts

- 当前登录态同步由浏览器扩展读取 cookies，Electron 主进程过滤并保存到 `site-sessions/<siteId>.json`。
- 下载执行时通过 `getDownloadCookies()` 读取本地保存的 Netscape cookie 快照并注入 `intent.cookies`。
- 当前已有两类场景触发刷新：
  - `auth_required` 下载失败后，符合授权条件时尝试同步并重试一次。
  - YouTube / Bilibili 高级质量探测前，如果快照超过 24 小时，尝试刷新。
- 当前没有常驻后台定时刷新机制。
- 用户已确认：自动刷新默认开启，作为内置功能，不需要暴露开关。

## Requirements

- 新增 Electron 主进程中的站点登录态自动刷新调度器。
- 自动刷新默认开启，不提供用户可见开关。
- 自动刷新只处理已授权、合理可刷新、已有保存意义的站点：
  - `syncAuthorization` 为 `seeded` 或 `user_enabled`。
  - `autoSyncAllowed === true`。
  - 不自动刷新未授权的 `auto_discovered` 站点。
  - 必须已有本地快照，或 `discoverySources` 包含 `user_sync`。
  - 无本地快照且没有 `user_sync` 激活的站点必须跳过，避免启动后批量读取用户从未使用过的 seed 站点 cookies。
- 刷新触发点：
  - App 启动后延迟检查一轮。
  - 浏览器扩展连接后检查一轮。
  - 后台定时检查，例如每 6 小时检查过期站点。
- 刷新 TTL：
  - 默认 24 小时。
  - 未过期快照不刷新。
- 失败处理：
  - 自动刷新失败不清除旧快照。
  - 自动刷新失败不阻塞下载。
  - 自动刷新失败应记录状态并进入退避，避免反复请求扩展。
  - 推荐退避：15 分钟 -> 1 小时 -> 6 小时，上限 6 小时。
- 并发处理：
  - 同一站点同一时间只允许一个刷新任务。
  - 自动刷新、高级质量探测刷新、手动同步、auth recovery 应共享同一个 in-flight 归并机制，避免重复请求扩展。
  - 手动同步优先；手动同步成功后应重置自动刷新失败退避。
- 下载行为：
  - 下载继续使用当前已保存快照。
  - 下载开始时不强制等待自动刷新完成。
  - 不实现“每次下载都获取 cookies”。
- 高级质量探测前刷新：
  - 现有 YouTube / Bilibili 高级质量探测前刷新逻辑应与新的调度机制协调，避免重复刷新和重复状态管理。

## Acceptance Criteria

- [x] App 启动后，符合条件且快照超过 24 小时的站点会在后台尝试自动刷新。
- [x] 浏览器扩展连接后，符合条件且过期的站点会在后台尝试自动刷新。
- [x] 定时检查会周期性发现过期快照并刷新。
- [x] 自动刷新成功后，本地 `site-sessions/<siteId>.json` 的 `capturedAtMs` 和 cookies 内容按现有保存逻辑更新。
- [x] 扩展未连接、无 cookies、保存失败等错误不会清除旧快照，也不会中断下载。
- [x] 连续失败会进入退避；退避期间不会持续请求扩展。
- [x] 自动刷新失败后，旧 cookie 快照仍保留且仍可被下载读取。
- [x] 手动同步仍然可用，且成功后会清除该站点自动刷新失败退避。
- [x] 扩展 popup 的 `site_session_cookie_sync_direct` 同步成功后也会清除该站点自动刷新失败退避。
- [x] `auth_required` recovery 自动同步成功后会清除该站点自动刷新失败退避。
- [x] `auto_discovered` 未授权站点不会被自动刷新，只保留现有 pending-action 提示路径。
- [x] 无本地快照且没有 `user_sync` 激活的 seed/catalog 站点不会被自动刷新。
- [x] 没有新增用户可见的自动刷新开关。
- [x] 自动刷新周期 timer 会在 app 退出时停止。
- [x] 现有 `auth_required` 恢复和高级质量探测逻辑仍能通过测试。

## Out Of Scope

- 不新增 UI 设置开关。
- 不在每次下载前强制读取浏览器 cookies。
- 不改变扩展读取 cookies 的权限模型。
- 不改变现有 snapshot 文件主格式，除非实现需要少量兼容字段或旁路状态文件。
- 不自动打开浏览器登录页面或执行站点登录流程。

## Resolved Planning Decisions

- 自动刷新运行状态优先保存在独立的 `site-sessions/refresh-state.json`，不写入 cookie snapshot。
- 初始常量采用集中定义：启动延迟约 30 秒，检查间隔约 6 小时，刷新 TTL 24 小时，失败退避 15 分钟 -> 1 小时 -> 6 小时。
