# 按钮光晕范围收敛

2026-11-13，按用户明确要求：仅下载进度环下方的操作按钮保留光晕，其他按钮仅使用底色反馈。Full 本体圆形、浮窗及设置页圆角矩形的规则保留。

## 实现

- 共用 `icon_hover` 只设置底色，因此设置、队列、托盘、Full 浮窗及退出异常按钮均不再附加阴影。
- 删除 Full 右键菜单关闭按钮单独绘制的阴影。
- 阴影函数命名为 `state_action_shadow`，仅进度环下方操作位的取消及失败复制两种分支调用；两者的光晕参数保持一致。
- 更新 Gallery 的下载中、退出异常场景说明。

## 验证与证据

`cargo build --locked --bin ameow` 和 `git -c core.whitespace=cr-at-eol diff --check` 通过。本轮为样式调整，未新增单元测试或重跑业务套件。

浅色、深色共 20 项原生检查通过：设置复制、Full 浮窗复制、托盘更新、菜单关闭、退出异常信息及重试、队列复制均无按钮光晕；进度环下方取消及失败复制仍有光晕。前台窗口及全局光标位置未改变。

证据根目录：`D:\Ameow\target\ui-review\2026-11-13-button-backgrounds`。

- 最终结果：`native-05/report.json`，20/20 通过。
- 局部对照：`button-backgrounds.png`，浅色/深色的普通复制、普通关闭及进度环下方操作。
- 本轮增量：`changes.patch`；候选信息：`manifest.json`。
- 修改前开发版：`accepted-before.exe`；最终归档：`candidate-01.exe`。
- 最终开发版：`D:\Ameow\target\debug\ameow.exe`，与最终归档 SHA-256 相同：`7f131d4b97250358ab46f5b5c3301ba9d253d02abf126f11e661acc943d799e0`。

早期验证脚本曾因按钮边界估计、悬停说明和键盘隐藏提示对 hover 状态的影响产生误报；已修正验证方法，以 `native-05` 为准。没有因此追加产品改动。

验证使用隔离的真实 Windows/GPUI 预览及自有 HWND 消息，未发送全局输入、操作真实剪贴板或执行真实下载/更新。外观交由用户统一验收。原有未提交工作保留，未提交或推送代码。
