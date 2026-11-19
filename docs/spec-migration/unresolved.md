# 迁移时点的验证边界

以下记录解释 2026-11-15 规范迁移所引用的历史报告，保留其失败与未测范围。它们不代表当前产品的待办或整体验收状态；迁移本身没有重新测试产品。当前平台、发行与验证方法见 [CONTRIBUTING](../../CONTRIBUTING.md)及[规范维护](../spec-maintenance.md)。

| 历史来源 | 保留的证据范围 |
| --- | --- |
| TRA-23/26/28 的 pending Review | 章节映射保留当时状态，不能据此补写 Final PASS，也不能将早期 pending 延伸为整个当前产品未验收。 |
| R13 下载取消与 R10 helper isolation | 用户可见文件干净不单独证明进程树、readers、workspace、lease 全部释放；helper 的 PID/module 隔离也不代表原生 suite 已重新运行。 |
| R7/R8 菜单候选、R9 focus | sampled outside input miss 与 actual-blur FAIL 属于当时被冻结的候选；后续诊断没有证明首个失败层。不能恢复失败架构，也不能将这些失败强加给后续实现。 |
| TRA-28 R5 标题栏与置顶 | 四项定向接受和 system move 记录不覆盖精确 foreground/Z-order 时序、多显示器或混合 DPI。 |
| 网络与 T04 离线恢复 | 静态路由、签名缓存、精确版本和推荐缓存恢复各有验证范围；不覆盖所有 PAC/CDN/网站，不保证任意缓存零网络。离线无法获知后来撤销，旧选择重放与跨基线兼容仍按相应规范处理。 |
| 迁移前的界面与平台记录 | 规范格式检查不构成既有 UI 的新验收，Windows 结果也不能代替 macOS、混合 DPI、干净非管理员或 GPU 呈现证据。 |

Ameow 0.5.0 已[正式公开发行](https://github.com/Wutpeach/Ameow/releases/tag/v0.5.0)，并包含 Apple Silicon Mac。早期首发候选的“等待视觉终审/公开上传”和迁移时“仅 Windows 已验证”不再描述当前发行状态。第三方材料的已知缺口仍以 [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES.md)与[版本化清单](../../distribution/notices/rust-dependency-inventory.json)披露，公开发行不消除这些义务。
