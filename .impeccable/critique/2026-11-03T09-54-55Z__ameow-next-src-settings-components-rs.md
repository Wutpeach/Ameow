---
max_score: 40
p1_count: 0
total_score: 27
na_heuristics:
p0_count: 0
target: Ameow Next 组件页状态区与版本详情（用户原生截图）
target_identity: "file:D:\\Ameow-worktrees\\tra26-r7-stage-b\\ameow-next\\src\\settings_components.rs"
target_fingerprint: "sha256:43f27db2359d497748aaff7b57f9c67ba0ceee8c73bbefc683c4084f38dc9a06"
target_path: "D:\\Ameow-worktrees\\tra26-r7-stage-b\\ameow-next\\src\\settings_components.rs"
timestamp: 2026-11-03T09-54-55Z
slug: ameow-next-src-settings-components-rs
---
Method: design review only (detector not applicable, native platform)

# Ameow Next 组件页局部 Critique

原生 Rust / GPUI 设置界面，Operate 模式；依据用户提供的一张完整截图、两张标注裁图及当前 settings_components.rs、settings_window.rs。主视觉证据位于 evidence/settings-critique-followup-20261103/。未使用示意组件或 Web 检测器。当前开发版已应用户请求启动，未发送桌面输入。

设计结论：按钮组右对齐；版本详情减少重复标题，拉开实际内容与辅助来源信息的层级。保留现有中性色、细描边、字号和 Lucide 图标。当前状态区已把错误与恢复操作联系起来，后续集中修正局部排版。

| 评审项 | 得分 / 4 | 主要依据 |
|---|---:|---|
| 状态可见性 | 3 | 失败、原因及组件不可用状态清楚 |
| 用语贴近日常理解 | 3 | 重新准备仍偏工程用语 |
| 用户控制 | 3 | 详情可收起，代码保留键盘路径 |
| 一致性 | 2 | 状态区操作靠左，其他行操作靠右 |
| 错误预防 | 3 | 操作条件及确认机制保留 |
| 易于识别 | 3 | 展开箭头明确，内部层级偏平 |
| 操作效率 | 3 | 恢复入口直接可见 |
| 简洁与美观 | 2 | 版本反复出现，辅助信息占重较高 |
| 错误恢复 | 3 | 重试和复制诊断均可找到 |
| 帮助信息 | 2 | 提示已有实现，悬停行为待确认 |
| 合计 | 27/40 | 本次仅评价组件页及相关提示 |

## Priority Issues

1. P2 — 状态区按钮组缺少统一右侧落点。截图直接确认；代码 actions 默认从左排列。保留上方状态和原因，下方按钮组整体右对齐，顺序为复制诊断、重试。避免将英文按钮硬塞进标题行。建议 impeccable layout。
2. P2 — 版本详情、版本来源、版本选择连续出现且层级相近。截图及固定 84px 标签列均确认，实际值被类别标题压低。保留一个展开入口，内部改为说明式主次两行：跟随 Ameow 推荐版本；版本信息来自 PyPI · yt-dlp。当前版本号只在实际存在时显示。建议 impeccable distill、typeset。
3. P3 — 重新准备与失败场景衔接不直接。按钮实际执行重试，改为重试，与原因说明的下一步一致；不改变命令与允许条件。建议 impeccable clarify。

## Layout alternatives

A（推荐）：保留版本信息展开行，展开后使用主说明与次说明，不再使用重复标签表格。版本选择方式采用跟随推荐或保留用户选择等描述，避免在组件不可用时暗示某版本已经安装。无需新浮窗路径。
B：yt-dlp 行提供详情入口，点击打开小面板。列表更短，但需要额外验证浮窗定位、焦点、Escape 和点击外部关闭；不推荐仅以 hover 承载必要信息。

## Strengths, cognitive load and personas

保留侧栏图标及文字、紧凑控件、状态图标及可执行恢复入口。没有任何决定点超过四个选项；分组已有改善，层级及操作一致性两项造成额外阅读成本，认知负担为中等。失败态的情绪低点已有明确状态与恢复入口，不需要更大红色面积；统一按钮落点和更直接的重试文案有助于结束这一过程。
初次使用者可能把推荐策略误读为当前可用版本；熟练用户会受恢复操作位置与名称不统一影响。无证据支持缩小字号或打乱对齐。

## Evidence boundaries and unresolved interaction

三个排版发现为截图直接确认，键盘与操作条件来自源码，本次未重新进行完整交互验收。用户已在重新启动的当前开发版中实测确认“复制按钮的问题修好了”。该问题按用户确认关闭，不计入本轮待修复缺陷或 P1。源码 tooltip 已限定到路径文字，GPUI 0.2.2 普通 tooltip 在移出时隐藏，只有 hoverable tooltip 具有 500ms 隐藏延迟；当前使用的是普通 tooltip。先前未确认时没有将残留归因为正常延迟。未改 UI 源码；未执行测试或声称视觉验收通过。
