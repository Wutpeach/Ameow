# Compact 按实际尺寸校准回弹

日期：2026-11-12。用户复验认为 Full→Compact 的弹性不明显，要求针对 Ameow 的窗口尺寸调整，而不是直接复用网页示例参数。当前修改未提交、未推送；本版交付后用户明确反馈“手感不错，这个pass了”，原生手感验收通过。

## 根因与修改

- Full Surface 为 200px，Compact 为 60px，原生窗口分别为 228px 和 80px。上一版虽然采用 Basic 2 的 200/24 弹簧，但末段 Landing 插值与 fullness 下界会在 Compact 到位前结束运动，实际 Surface 从未低于 60px。
- 默认 Converged 收起改为 200/22，保持 mass=1。收起直接沿弹簧过零并自然回正，取消这一方向的 Landing 接管；正常行程压缩约 2–3px，下界保护为 3px。没有追加到位脉冲。
- 负 fullness 仅作用于可见 Surface，原生窗口继续保持最小 80px、gutter 10px。Surface 绘制与交互区域使用同一位置，在 Compact 中心周围压缩；圆角随实际尺寸钳制。阴影、原生 anchor、尺寸范围和磁吸幅度不变。
- 压缩期间重新展开时，将当前可见尺寸和速度转交给已有 recovery，再开始展开，避免负 fullness 被展开边界截断。减少动态效果会清除当前压缩及 recovery，不会随后补播。
- 展开仍保持无额外回弹，6px 单层整体磁吸沿用原实现。历史候选保持原路径。没有新增 UI 状态；最终 EXE 导出的 113 项 Gallery 场景与 JSON 完全一致。完整移入/移出路径在普通悬浮窗口验收。

## 集中验证

- 修改完成后运行一次 `cargo test --locked --bin ameow --quiet`：168 通过、0 失败、2 忽略。覆盖 1/4/16/33ms 采样下的可见压缩与恢复、压缩前后多个时刻反向时的尺寸及速度连续性、减少动态效果、磁吸衔接及历史候选。
- 将当前压缩回归移到修改前源码运行，按预期失败：最小 Surface 仍为 60px。原始结果见 `before-regression.log`。
- `cargo build --locked --bin ameow` 和相关源码 `git diff --check` 通过。
- 最终 EXE 的 4.7 秒原生周期探针生成 974 个 Render 样本，两次收起最低分别为 57.606857px、57.618465px，均回到精确 60px 并停止。首次收起开始于 1100ms，最低点为 1454ms，rest 为 1884ms。原生尺寸始终在 80–228px；压缩段保持 80px/gutter 10px，没有额外 settle 脉冲。
- 首轮截图按进程启动时间采集，因应用初始化耗时只覆盖了 Full 和行进段。另一次 2.15 秒的原生探针对齐应用时钟，补齐压缩与静止 Compact 的实际小裁图：约 1464ms 时为 57.61px，约 2021ms 时为 60px。已查看对照图，均为圆形且使用同一个 80px 原生范围。
- 两次原生探针均正常退出，前台 HWND 未改变。未使用 computer，未注入鼠标或键盘。

## 产物与限制

开发版：`D:/Ameow/target/debug/ameow.exe`。

SHA256：`5d53a8adae601d1a5fef42432dc0ebd2421ddc29402bc13d576dea54629479ec`。

原始数据、回执、修改前后冻结 EXE 与源码、紧凑截图对照：`D:/Ameow/target/ui-review/2026-11-12-compact-spring/`。回执为 `validation.json`，截图对照为 `native-crops.png`。

这些工程检查证明实际窗口执行了压缩并恢复，不能单独证明显示器 GPU Present 节奏或真实鼠标路径下的主观手感。用户随后在实际使用中明确验收本版手感 PASS；该验收与上述工程证据分开记录。
