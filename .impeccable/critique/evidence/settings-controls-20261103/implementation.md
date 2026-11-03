# 设置控件尺寸细化 · 2026-11-03

在此前设置细节优化基础上，按用户授权收紧选择器、菜单与开关，保留既有视觉方向。未创建提交。

- 选择器：高 32→28，左右留白 12→10，宽 144、字号 13。普通动作按钮继续高 32。
- 下拉菜单：圆角 8→6，选项高 32→28，外侧留白 4、选项左右留白 6，使用固定 8×8 原生路径勾选标记。
- 启动开关：轨道 40×24→32×18，滑块 16→12，透明点击区域 40×32；外层显示键盘焦点。
- DESIGN.md、设置 Surface 简报及 sidecar 的开关示意尺寸同步；sidecar 不作为验证证据。

## 验证

- 当前工作树 `cargo build --manifest-path ameow-next/Cargo.toml --bin ameow-next --locked`：PASS。EXE 身份见 launch.json。
- `cargo test --manifest-path ameow-next/Cargo.toml --bin ameow-next settings_ --locked`：15 passed，0 failed。
- 相关 Rust 文件、DESIGN.md 和 design.json 的 `git diff --check`：PASS。
- Windows 96 DPI 原生设置窗口：浅色中文、深色英文、主题菜单、英文托盘图标菜单；最长选项及勾选均无裁切。前台方向键/Enter 已切换主题与语言，Escape 关闭菜单；Tab 到达开关并显示外层焦点边框。
- 未切换系统开机启动；启用态几何按代码核对。未扩大为高 DPI、macOS 或所有页面的重复验收。
- 独立临时配置沿用上一轮预览；正式用户配置未用于这轮偏好切换。PID 60848 对应当前工作树构建，启动寿命 30 分钟。

## 截图方式与限制

复用仓库 `repair_a_runtime.CropCapture` 可按确切 HWND 的客户区直接 BitBlt，无需鼠标或 UIA 遍历。capture_client.py 校验 PID 与可见性，但这是屏幕区域抓取，窗口遮挡或桌面浮层仍会进入图片；不保证后台窗口内容。两张菜单的初次直接抓取受到代理指针浮层干扰，已用同一实际原生状态的宿主窗口截图替换。最终保留五张可审阅截图，均不是示意渲染。

后续优先编译/定向测试验证逻辑、直接窗口截图验证静态布局，必要交互才使用 Computer Use。GPUI 当前设置没有可供浏览器自动化使用的 DOM；后台按键本轮结果不可靠，不作为成功证据。
