# 验证记录

2026-11-19，基于 origin/main d6331a8b，关联 Refs #56、Refs #57。这是工程验证，产品验收仍交来源任务。

- Windows：菜单新回归在旧成功回执上先失败；修复后 cargo test --locked --bin ameow 为 196 passed、2 ignored，cargo check --locked --all-targets 通过。
- Windows 隔离原生 host：使用现有 native_acceptance::settings_and_tray 和真实设置 owner，仅写任务独立目录，不启动下载/组件准备。实际鼠标消息依次选择 Highest、Saver、Balanced，截图和持久化回执一致，menu_page 始终 primary；Esc、右上关闭、设置入口均关闭。实际点击任务自建外部窗口后确认该窗口确获前台，Full 菜单关闭，随后收起。测试正常返回，恢复测试前光标。证据位于任务树 ignored evidence/full-menu-win-01 和 full-menu-win-02。
- Mac：焦点模式回归在原 Borderless 转换上先失败；保留 GPUI 创建时的 NonactivatingPanel 位后 cargo test --offline --locked --bin ameow 为 196 passed，开发构建通过。工作树及 target 隔离，依赖缓存从已知开发缓存克隆，未修改旧树或旧 target。
- Mac 限制：受管 SSH 确认系统锁屏；没有真实点击 Full、Command+V、剪贴板读取、URL 受理或连续画质选择的手势验收。焦点位回归不是手势证据。解锁后须在任务隔离实例点击 Full，粘贴一条受控公开链接，确认进入既有受理/反馈；再连续选择画质并检查正常关闭。
- OpenSpec：主规范九项与 full-quality-stays-open change 的 strict 校验均通过。Mac 粘贴恢复既有合同，不新增空规范。

本地检查未新增错误；保留既有 unused/dead-code 编译警告。未合并、发行、修改已发布 Tag 或更改 Issue/Project 状态。
