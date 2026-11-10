# #32 真实 Explorer 托盘补验｜环境受限（2026-11-10）

依据[补验授权](https://github.com/Wutpeach/Ameow/issues/32#issuecomment-6761747164)，在现有 `feature/gpui-kit-migration` / `a62e0c3a0e02a09ca78579e29c67f17e407971ea` 进行本轮核对。结果为 **ENVIRONMENT_BLOCKED / Shell PENDING**，未获得新的真实托盘交互或动画 PASS。

## 本轮实际操作与证据

2026-11-10 15:39:59（UTC+8），复用已验证的 Win32/WTS/令牌只读检查器，重新枚举真实 Shell HWND、所属进程、活动会话与令牌；未调用其启动方法。旧报告中的无关历史窗口 ID 已从本轮检查器去除。

| 对象 | 本轮实测 |
| --- | --- |
| 活动桌面 | Session 1 / Console / Active；另只有 Session 0 / Services / Disconnected。 |
| 桌面 Shell | GetShellWindow → Progman HWND 67686 → Explorer PID 15028。 |
| 主任务栏 | Shell_TrayWnd HWND 133072，owner PID 15028，可见。 |
| 副任务栏 | Shell_SecondaryTrayWnd HWND 23462436，owner PID 15028，可见。 |
| 通知区溢出窗 | NotifyIconOverflowWindow HWND 463504，owner PID 15028，本次隐藏。 |
| 真正任务栏宿主 | PID 15028、Session 1、elevated=1、integrity=12288（High）、restricted=0。 |
| 另一 Explorer | PID 28408，同为 Session 1 / elevated=1 / High，不能提供普通用户 Shell。 |
| 检查进程 | Session 1 / High；EnableLUA=1，未把环境称为关闭 UAC。 |
| 当前 Ameow | 未发现进程或 AmeowTrayOwner 窗口；本轮未启动新实例。 |

本轮证据根：`D:/Ameow-kit-tray-evidence-20261110-153956`。

- `inspect-shell.ps1`：实际运行的只读检查器。
- `shell-environment-current.json` / `inspect-shell.log`：完整本轮环境回执，含时间、窗口归属、会话和进程令牌。
- `animation-source-comparison.json`：三个已提交版本的动画/关闭源码对照，非运行时证据。
- `preservation-before.json`：main 与迁移基线保护核对。
- [机器摘要](tray-shell-followup-20261110.json)。

## 结论与未验证项

本机目前没有可用的普通 Medium Explorer 活动桌面，无法建立 Explorer 与非提升 Ameow 匹配的普通用户补验条件。遵照本轮环境边界，没有强制重启/替换 Explorer、启动 High Ameow、修改 UAC/注册表/全局权限、切换或创建桌面会话，也未用 Gallery/测试宿主/fallback anchor 绕过真实 Shell 入口。

前轮普通 Medium 的 0.5.0 / 0.5.1 均有 `Shell_NotifyIcon` 注册失败及 `0x80070005` 记录。本轮只有新的环境回执，**没有重新调用 NIM_ADD，不称重新复现，也不能证明 High Explorer 是错误的唯一原因，更不能归因于 GPUI Kit**。源码仍在 NIM_ADD 返回 false 后读取 Win32 错误，未凭这段代码推断实际错误根因。

注册成功、图标真实点击、打开响应耗时、菜单延迟、130ms 淡入的可见效果、关闭效果、Reduced Motion、点击命中和真实托盘退出均 **NOT VERIFIED**。不存在可交付为这些项目 PASS 的新录像、截图或时序样本。

源码有限对照事实：迁移整合前 `580acfc1`、main `acd8c7db` 与当前 `a62e0c3a` 均保留 130ms `tray-fade-in`，Reduced Motion 分支直接返回静态内容；公共关闭路径均直接 `window.remove_window()`，没有对应的 130ms 退场实现。因此不能把关闭淡出说成已有且已验证；也没有证据把该关闭方式认定为本次迁移引入的回归。本轮未增加动画或改托盘。

**本轮结果不足以解除真实托盘验收项或批准最终合并。** 此前工程联合验证继续有效；建议网页侧保留 Shell PENDING，决定如何在普通 Explorer 会话补验，再评审最终合并。没有重复 380/0/19、发行 4/4、双资产 6/6、更新 Ready 或全场景测试。

## 保全与已确认的后续清理决定

本轮没有产品源码修改、本地提交或 push；仅新增本报告/摘要并更新交接资料。main 仍为 acd8c7db，原有 15 条 dirty 状态、空暂存区及原清单 1,607 个文件哈希一致；迁移 HEAD 保持 a62e0c3a。原 EXE、历史证据、两个工作树和分支保留。

用户已明确后续顺序：托盘补验与网页复核 → 明确授权合入 main → 保护未提交工作并安全合并 → main 验收通过 → 移除 `D:/Ameow-gpui-kit` 和已完全合并的 `feature/gpui-kit-migration`。无需额外备份分支、Worktree 或重复仓库；保留正常 Git 合并历史及必要历史证据，不删除未合并工作。**本轮不执行合并或清理**。未创建 Tag/Release、操作生产密钥、解除 Gate B、关闭 Issue 或变更 Project。
