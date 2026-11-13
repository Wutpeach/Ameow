# 去除展开回弹与 Basic 2 收起适配

日期：2026-11-12。用户复验后仍感觉展开有停顿，要求移除展开弹性，并认为 Full→Compact 弹性过强；随后明确选择 Morphing Dialog Basic 2 的克制手感作为收起参考。此反馈覆盖此前保留完整 Converged 落定曲线的方向。当前修改未提交、未推送，原生手感待用户验收。

## 参考与修改

- 官方示例：https://motion-primitives.com/docs/morphing-dialog ，Basic 2。已读取 `app/docs/morphing-dialog/morphing-dialog-basic-2.tsx`，GitHub 提交 `120f64f6ca60348e251f929e9c81f11ccbe45eda`；示例明确使用 `type: spring`、`stiffness: 200`、`damping: 24`，质量使用默认 1。
- 旧默认展开到达 Full 后，仍追加约 2.5px、170ms 的尺寸脉冲；此时磁吸渐入已结束，整体位移与额外尺寸变化同时发生。该叠加存在于代码，不据此断言是所有主观顿感的唯一原因。
- 默认 Converged 展开继续沿用原来的行进与落定插值，到位后直接结束，不再追加尺寸脉冲。磁吸继续保持现有 6px、单个整体对象、展开末段渐入及上轮修复的收起连续性。
- 默认收起的整个行进采用参考的 200/24 弹簧参数，替代原来的 520/40；同时去掉收起到位后的额外尺寸脉冲。保留 Ameow 的原生尺寸约束、末段落定与事件时间处理，因此这是对参考手感的适配，不是网页布局动画的逐帧复制。
- 历史 ASoft、ACrisp、Baseline、B 模式继续保留原行为；主窗绘制节奏和低动态效果处理不变。没有新增或删除 UI 场景，现有 113 项 Gallery 目录无需调整。实际移入/移出仍用普通悬浮窗验收。

## 集中检查

- `cargo test --locked --bin ameow --quiet`：167 通过、0 失败、2 忽略。覆盖无展开脉冲、可见尺寸单调收起、参考弹簧在约 100ms 时仍保留约一半行程、事件反向连续、减少动态效果及磁吸衔接。已有历史候选行为测试仍通过。
- 相同回归放在修改前实现上，按预期失败：展开到位后仍产生非零尺寸脉冲。原始结果保存在 `before-regression.log`。
- `cargo build --locked --bin ameow` 与相关文件 `git diff --check` 通过。
- 最终 EXE 进行一次 3.9 秒的原生周期探针：877 个应用 Render 样本，两次收起，实际 Surface 范围为 60–200px，额外尺寸脉冲为 0，没有 settle 脉冲帧；退出码 0，前台 HWND 保持原值。
- 最终 EXE 无窗口读取的 113 个场景与 JSON 一致。

## 产物与限制

最终 EXE：`D:/Ameow/target/debug/ameow.exe`。

SHA256：`78df8ceb2b042f35c1a03372a83aa51908605dc7587bd107e90d0ffd3ae3705f`。

原始证据、旧 EXE 与源码、冻结的新 EXE：`D:/Ameow/target/ui-review/2026-11-12-window-settle/`，回执为 `validation.json`。

未使用 computer、未注入鼠标或键盘。原生探针证明实际窗口经过了这些尺寸与状态，不能证明真实鼠标路径下的磁吸体验或显示器呈现帧率。展开是否仍有顿感、收起是否符合 Basic 2 的克制手感，等待用户原生验收。
