# 圆环残留圆点与 Gallery 动态开关

2026-11-11，本地修改，尚未提交。用户在新版动态预览中反馈“问题好像修复了”，后续界面审查由用户继续。

- 原因：完整底圈仍补两个端点圆帽，半透明圆帽在 12 点方向叠加；旋转圆弧离开后会露出固定圆点。完整圆环现改用闭合描边，开放圆弧及状态符号保留圆帽。
- Gallery 新增“动态预览：开 / 关”，默认关闭；场景与主题切换携带当前选择，预览回执校验动态状态。单张截图反映当前模式，批量截图继续使用减少动态模式。
- Windows 验收版本：`D:/Ameow/target/debug/ameow-ui-review.exe --gallery`。使用独立输出名称复用现有依赖，原有正在运行的开发 EXE 保留。

## 已完成检查

- `cargo test --locked --bin ameow`：157 passed，0 failed，2 ignored。
- 增量 Windows 开发构建通过。指定独立输出名称产生的两条 Cargo 输出路径警告不影响构建。
- 原生旋转回归：`python scripts/check_ring_motion.py --exe target/debug/ameow-ui-review.exe --output docs/evidence/ui-review/2026-11-11-ring-seam/final-check`。浅色与深色均通过旋转、停止、恢复；分别采集到 46 / 48 个不同帧。缺口经过正上方时，圆点额外对比度均为 0。
- 同一回归断言能拒绝修复前动图：浅色额外对比度 20/255，深色 15/255，见 `baseline-regression.json`。
- Gallery 原生按钮由“关”变为“开”，随后切换到 `full.unknown`，回执仍为 `reduced: false`，见 `gallery-toggle-receipt.json`。

`final-check/report.json` 与动图是最终原生回归证据。此前的 `before-*` / `after-*` 是定位及对比素材；`regression/` 是中途未完成的采样，不作最终通过依据。像素断言聚焦旋转解析圆环；未运行全部 Gallery 场景矩阵或真实下载工作流。

后续先集中修改，最后合并检查；尽量少用 computer，需要点击或视觉验收时通知用户操作。
