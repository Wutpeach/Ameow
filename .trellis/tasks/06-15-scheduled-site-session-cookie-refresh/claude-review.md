# Claude Review: Scheduled Site Session Cookie Refresh

## Verdict

Claude 认为方案整体技术方向成立：复用现有 `syncSiteSessionFromExtension()` / `SiteSessionManager.importSnapshot()` 路径、把调度状态与 cookie 快照分离、保留下载只读取本地快照的模型，符合现有架构。

## Must-Fix Feedback

- 自动刷新、高级质量探测刷新、手动同步、auth recovery 不应各自维护独立 in-flight 状态。调度器应成为同一站点刷新任务的单一 in-flight authority。
- `site_session_cookie_sync_direct` 直接调用 `manager.importSnapshot()`，绕过 `syncSiteSessionFromExtension()`；实现时必须显式调用 scheduler 的成功/清退避 hook。
- `auth_required` recovery 成功同步后也应清除 scheduler failure/backoff 状态。
- “无本地快照且没有 `user_sync` 激活”的站点必须跳过自动刷新，不能作为可选项。否则启动时可能批量读取用户从未使用过的 seed 站点 cookies。
- 周期性 timer 必须在 app quit/shutdown 时停止，不能写成 “if needed”。
- “自动刷新失败不清除旧快照”应有测试覆盖，不应只依赖当前 `importSnapshot()` 的实现细节。

## Recommended Adjustments

- 调度器暴露一个统一刷新入口，例如 `ensureRefreshed(siteId, options)`，返回已有 in-flight promise 或启动新任务。
- 调度器暴露 `markSuccess(siteId)` / `resetBackoff(siteId)`，由所有成功路径调用。
- 调度器应支持 `now` 注入，保持时间相关测试稳定。
- 每个自动刷新任务应有自身 timeout，避免一个挂起请求永久占用 in-flight slot。
- `refresh-state.json` 应使用 temp-file + rename 原子写入，和现有快照写入模式一致。

## Test Additions

- stale seeded entry with snapshot -> refresh
- `auto_discovered` -> skip
- fresh snapshot -> skip
- extension disconnected -> skip
- no snapshot and no `user_sync` -> skip
- failure sets backoff and old snapshot remains usable
- active backoff -> skip
- success clears backoff
- concurrent refresh joins/skips duplicate
- malformed `refresh-state.json` -> empty state
- deleting `refresh-state.json` does not delete cookie snapshots
- direct extension popup sync clears scheduler backoff
- desktop settings sync clears scheduler backoff
- auth recovery success clears scheduler backoff
- advanced quality probe uses scheduler with bounded wait
- scheduler timer stops on app quit
