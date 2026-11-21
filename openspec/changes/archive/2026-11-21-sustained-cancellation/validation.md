# Validation

Windows 2026-11-21，本 change 基线为 PR74 的 381aaab369464c91a8ef8eea6552dbe31d40c2e2。全部本机构建使用独立 D:/Ameow-handoffs/windows-cancel-fix-20261121/target。

- cargo test --locked --offline --features cancel-fixture --lib：251 通过、12 ignored。完整 13 项原生故障取消回归包含 Held 写入器、持续 query/terminate 故障、driver 再次 panic、显式重试、真实结算屏障及其他 Job 隔离。队列回归包括发布仲裁、文件提交后尚未 join、原子 attempt 回执与外层 join 后释放 slot。
- cargo test --locked --offline --features cancel-fixture --bin ameow：最终 209 通过、2 ignored。覆盖即时发送、持续取消、拒绝恢复与旧/新 attempt 回执。初次组合运行有一项 transport 失败提示测试失败，移除基于旧快照猜测原因后最终通过；真实拒绝消费权威回执。
- cargo check --locked --offline --all-targets：普通默认特性通过；cargo build --locked --offline --features cancel-fixture --bin ameow --bin ameow-cli 通过。
- 推荐 Runtime 实际工具：yt-dlp 2026.08.19、FFmpeg 9.0.2、Deno 2.9.7。最终源码重编译后，正式队列本地 native HLS、两次 503 原生重试、FFmpeg 子进程三例通过；独立进程观察器确认真实租约 FFmpeg 可执行文件及祖先链。受理时立即投影取消事实，原生结算后保留 owner 两秒再返回，slot 仅外层 join 后释放；另一 Job 成功交付。终态后两秒无新增目标 HTTP/工作区，目标诊断/输出/stage 名称、大小和 mtime 无变化，所有本轮 PID 退出。
- 独立只读技术审查 PASS。OpenSpec 主规范与 delta 已同步且 strict 校验通过。

真实界面可操作入口位于交接目录 REVIEW.md / Start-Review.ps1，绑定冻结 review-candidate/ameow.exe（SHA-256 27C1D61CB9A4FE7AF1EF1A0D21275316D670C3BAAB746808C2FD26A9C3266F3B）。来源正在按集中桌面安排验收，不将纯状态测试或构建称作原生窗口视觉验收。使用真实协调器和受管工具，仅合成身份与本机媒体源；取消后两秒 owner 延迟是 fixture 的人为观测窗口，不是产品停止耗时。

Mac 共享队列/UI 在独立目录 /Users/aaww/ameow-windows-cancel-crosscheck-20261121-zealous（源码固定 853393f1）通过 cargo check --locked --offline --lib --bin ameow --bin ameow-cli，四项取消 UI 状态回归均通过，driver 50997 已退出。Windows CI run 44858553377 / job 136706356784 对实现提交 853393f1 SUCCESS。本轮不重跑 Mac 产品验证、不改 PR74 Mac 源码，不触碰其他候选、日常 App、用户队列或真实公网下载。0.5.1 非阻塞决定保持。

详细运行日志、身份/hash、三例最终原始证据、进程退出与界面入口均在 D:/Ameow-handoffs/windows-cancel-fix-20261121，最终技术报告记录提交、PR 与 CI。
