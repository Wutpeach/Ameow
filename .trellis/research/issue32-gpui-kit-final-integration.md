# #32 GPUI Kit 最终整合检查点

2026-11-10，按 [#32 最终整合授权](https://github.com/Wutpeach/Ameow/issues/32#issuecomment-6760659657)，在迁移工作树完成 main acd8c7db 的可追踪整合：合并 45b9f3f0，干净检出 GPL 字节哈希修复 9e93d163。Rust/CI/发行统一 1.98.1，Kit、AccessKit 与永久更新两边成果保留。

Windows 工程验证通过：380/0/19，发行边界 4/4、Inno 双资产 6/6；用户完成设置/失败恢复、0.5.0→0.5.1 Ready 重启及 Gallery 定向检查。119 场景未全量复测。Medium Shell 图标两版本均 0x80070005，托盘菜单延迟/动画观察未定位，不记已修复。9 项许可材料缺口、Gate B blocked、磁吸收起硬归零和原有 DPI/macOS 限制继续保留。

主线 1,607 个保全文件一致，未 push 或合并 main，未发行、动生产密钥或关闭 Issue。独立干净工作树已证明当时 main 可 fast-forward；最终 main 整合仍待网页复核和明确授权。下一会话先读 [完整报告](../../docs/evidence/issue32/final-integration-report.md) 及 [机器摘要](../../docs/evidence/issue32/final-integration-validation.json)，不要重复完整测试来恢复上下文。

## 真实 Shell 补验与最终清理决定（2026-11-10）

按 [6761747164](https://github.com/Wutpeach/Ameow/issues/32#issuecomment-6761747164) 重新实测：15:39 的真实任务栏/通知区仍属 Explorer PID 15028、Session 1、High；只有一个活动桌面，无普通 Medium Explorer 会话。未启动或提升应用、未重启 Explorer/改环境；没有新的 NIM_ADD 或真实交互样本，不称 0x80070005 再次复现或已定位。Shell、延迟与动画继续 PENDING。三个父/当前版本均有 130ms 淡入，关闭路径直接 remove_window；静态源码不代表动画实测。见 [补验报告](../../docs/evidence/issue32/tray-shell-followup-20261110.md)。

用户明确：未来正式合入 main 且合并结果验收通过后，移除迁移 Worktree 与已完全合并分支，不额外保留备份分支/Worktree/重复仓库；正常 Git 历史和必要证据保留，不删除未合并或他人 dirty 工作。本轮不合并、不 push、不清理，等待网页侧复核。
