# 复制按钮成功反馈统一

用户选定第三方许可页已有的 icons/check.svg。复制成功后原位显示 ✓ 约2秒，再恢复复制图标；重复复制从最后一次成功重新计时。

覆盖下载路径、组件诊断、第三方许可、队列、Full 主操作和左下组件浮窗。补齐 Gallery 复制演示与队列图标；Full 演示复制不再依赖队列打开。真实操作仍以实际复制结果为准，失败不显示成功图标。Gallery 不写真实剪贴板。

验证：cargo test --locked --bin ameow --quiet：175 passed、2 ignored；cargo build --locked --bin ameow 通过；diff whitespace 检查通过。

Windows 原生预览：6个入口，以及深色路径、减少动态队列共8组通过。检查点击后显示 ✓、2秒后恢复；下载路径重复点击超过首次截止仍显示 ✓。本轮预览前后剪贴板序列号一致。只向自有预览 PID/HWND 发送消息，不调用全局鼠标/键盘输入或抢前台。

最终开发 EXE：target/debug/ameow.exe；冻结副本 target/ui-review/2026-11-12-copy-feedback/candidate-02.exe；SHA-256 b6875630ceb44c027642757e59c7191336fa65b777115cb7e84742014e8e32e2。

汇总回执：target/ui-review/2026-11-12-copy-feedback/manifest.json；紧凑图标对照：copy-feedback-review.png。原始回执分别为 native-02/verification.json 和 native-popup-final/verification.json。浮窗的最终图像复核见 native-popup-final/review.json：裁切按实际8px SVG计算，排除提示框阴影；成功45个像素变化，恢复仅2个边缘像素差异。早期检查失败记录保留，不作为通过证据。

限制：本机原生预览验证呈现和点击；真实剪贴板写入未额外执行，成功/失败逻辑有回归测试覆盖。用户统一视觉验收待进行。未提交、未push。
