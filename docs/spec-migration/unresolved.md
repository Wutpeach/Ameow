# 保留的未决与验证边界

本次仅迁移规范与集成，没有重新测试产品，也没有改变历史报告的验收结论。以下项目不阻止文档迁移完成，不能因文档合并而自动获得 PASS 或重开实现。

| 边界 | 目前能说明什么 | 不能推导什么 |
| --- | --- | --- |
| TRA-23/26/28 历史 pending Review | 迁移映射保留原路径与章节摘要；外部备份已按用户要求移出，已提交来源按 Git 历史读取。已明确的 R8、R13 与后续用户决定按各自范围采用 | 不将某份早期 pending 当成整个当前产品仍未验收，也不在本次替这些轮次补写 Final PASS；不保证未跟踪原文仍可恢复 |
| GPUI Cancel 与进程结算 | R13 记录真实 Downloading Cancel 的用户反馈；进程/lease/thread/file 事实仍需要相应工程证据 | 用户可见文件干净不单独证明进程树、readers、workspace、lease 全部释放 |
| R10 test helper isolation | 当前 helper 已按 PID/module 隔离，保留测试规则 | 原章节 awaiting Review 不在本次改成已验收；本次不重新运行原生 suite |
| R7/R8 菜单候选与 R9 focus | R7 sampled outside input miss、R8 actual-blur FAIL 为被冻结候选的真实失败；R9 后续诊断未证明首个失败层，后续有用户局部交互反馈 | 不恢复失败 Popup/polling 架构，不把失败强加给当前新实现，也不发明 root cause 或全菜单 PASS |
| 设置窗口标题/置顶 | TRA-28 R5 有四项用户定向接受和真实 system move 工程记录 | 精确 foreground/Z-order 时序、多显示器/混合 DPI 没有完整独立记录 |
| 平台与环境 | Windows x64/MSVC 为已验证目标 | macOS/Linux native、混合 DPI、干净非管理员、GPU present 等未覆盖项目不因重命名或文档迁移通过 |
| 网络支持 | 当前静态有效路由、原生恢复、有限安全分类及真实样本各有范围 | 不保证所有 PAC/bypass/CDN 动态请求、所有公网网站、HTTP429/bot 拒绝或任意缓存目录零网络 |
| T04 离线选择 | 签名缓存/精确版本与推荐缓存 Restore 有已记录验收 | 离线无法知道后来撤销，不能阻止真实旧选择重放；跨应用基线变化兼容仍未独立验证 |
| 发行 | 当前文档明确取消 Gate A/B 和私有审核文件，但保留真实生产签名/源码身份/材料哈希 | 不表示第三方权利已确认、视觉终审已结束或公网 HTTPS 验证已完成；9 项原文缺口等继续按 first-rust-release.md 披露 |
| 现有未提交 UI | DESIGN.md 与相关 Rust 文件在迁移前已有改动，本次保持字节不变 | 不把本次 OpenSpec 格式通过当作这些 UI 改动的新验收 |

后续需要处理这些问题时，应从当前授权、相关能力规范及源证据开始，不自动恢复历史轮次的实现/发行权限。
