# 验证记录

2026-11-19，基于 origin/main d6331a8b，关联 Refs #56、Refs #57。工程检查及 Mac 隔离实例的真实用户产品验收均已完成；以下区分自动检查和用户操作证据。

- Windows：菜单新回归在旧成功回执上先失败；修复后 cargo test --locked --bin ameow 为 196 passed、2 ignored，cargo check --locked --all-targets 通过。
- Windows 隔离原生 host：使用现有 native_acceptance::settings_and_tray 和真实设置 owner，仅写任务独立目录，不启动下载/组件准备。实际鼠标消息依次选择 Highest、Saver、Balanced，截图和持久化回执一致，menu_page 始终 primary；Esc、右上关闭、设置入口均关闭。实际点击任务自建外部窗口后确认该窗口确获前台，Full 菜单关闭，随后收起。测试正常返回，恢复测试前光标。证据位于任务树 ignored evidence/full-menu-win-01 和 full-menu-win-02。
- Mac：焦点模式回归在原 Borderless 转换上先失败；保留 GPUI 创建时的 NonactivatingPanel 位后 cargo test --offline --locked --bin ameow 为 196 passed，开发构建通过。工作树及 target 隔离，依赖缓存从已知开发缓存克隆，未修改旧树或旧 target。
- Mac 真实用户验收：用户解锁后，在本任务正常启动的隔离实例 PID 93112 上亲手展开并点击 Full、粘贴公开复现链接、连续选择最高→省流→均衡，明确反馈“两项都正常”。反馈由来源会话 6ab73dcd-a4bd-4b02-b82f-de717b34fcb2 转交，适用精确 source 97f075bfbc1c8060715c15d1323b51f727d0d4cc，体验 EXE SHA-256 为 bf07973b6e2db9816cc228c1804124d67c120034ed05b99ec4a92b9401718786。体验版使用已有 app-update-fixture 特性隔离更新根，未启用 UI 控制目录；runtime、settings、output 和 updates 均为任务独立目录。
- Mac 代理覆盖边界：初次因锁屏无法操作；解锁后同一受管 SSH 通道的辅助功能、事件发送及屏幕捕获权限仍为 false，当前任务原生桌面 provider 也未启用。代理没有注入键鼠、调用内部 Submit 冒充手势或取得 Mac 手势截图；上述产品验收来自真实用户反馈。剪贴板由用户正常使用，本轮代理未读取、修改或执行恢复。
- Mac 收尾：用户已自行退出实例。原有 queue 回执记录一次 submit，任务 1 为 Success、slot_owned=false、resources_released=true；最终 stopped=true、active_slots=0、preparing=false。PID 93112 已不存在，任务目录下无残留参与进程，启动日志无错误。保留单份体验 EXE、review.command、独立缓存与必要小回执。
- OpenSpec：主规范九项与 full-quality-stays-open change 的 strict 校验均通过。Mac 粘贴恢复既有合同，不新增空规范。

原修复 head 的 GitHub CI 44477341705 全部成功。本次验收与规范归档不更改产品源码、不重新编译体验 EXE或重复原生测试矩阵；收尾 head 的 CI 和合并收据以 PR #58 的真实记录为准。保留既有 unused/dead-code 编译警告。未发行或修改已发布 Tag/feeds；Issue/Project 状态由原唯一记录任务维护。
