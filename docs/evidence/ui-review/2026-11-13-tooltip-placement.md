# Tooltip 精简与避让

日期：2026-11-13。状态：实现、工程检查与 Windows 原生预览检查通过，交由用户统一验收。

## 可见变化

- 保留的提示以控件边界定位，优先位于上方并留 6px 间距；空间不足时自动翻转、限制在窗口内。
- 删除菜单关闭、退出异常收起、设置关闭及组件升级行上的重复提示。完整显示的路径和组件版本号不再重复提示；缩略值仍可查看全文。
- 点击、键盘输入或离开窗口时收起提示。触发控件消失时清理已显示及等待显示的提示；复制后的原位 ✓ 反馈保留。
- 设置、Full 内部浮窗、托盘共用定位逻辑；未改动已验收的磁吸、展开收起动效。

## 最终开发版与证据

- 开发版：`D:\Ameow\target\debug\ameow.exe`
- 归档候选：`D:\Ameow\target\ui-review\2026-11-13-tooltip-placement\candidate-03.exe`
- 两者 SHA-256：`22fea43ff78ebf1f7ebb6ca8505300fb092bce20c33d0a494af0f8b6d1b70eda`
- 证据根目录：`D:\Ameow\target\ui-review\2026-11-13-tooltip-placement`
- `tooltip-comparison.png`：设置、Full 浮窗、托盘的浅色/深色局部对照。图片来自 candidate-02；candidate-03 只调整组件列表版本号是否需要提示。
- `manifest.json`：候选指纹、检查来源、复用范围及增量文件列表。
- `changes.patch`：相对本轮开始时备份的增量，不包含此前 UI 工作。

## 验证结果

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| 设置、Full 浮窗、托盘，浅色/深色 | 24/24 通过 | `regression-final/report.json`，candidate-02 |
| 完整组件版本不重复提示，组件用途说明仍在上方 | 10/10 通过 | `components-final/report.json`，candidate-03 |
| 单元测试 | 175 通过、2 忽略、0 失败 | `cargo test --locked --bin ameow --quiet`，最终组件显示条件调整前 |
| 最终构建 | 通过 | `cargo build --locked --bin ameow`，candidate-03 |
| 工作区空白检查 | 通过 | `git -c core.whitespace=cr-at-eol diff --check` |

24 项原生检查涵盖：优先上方、托盘顶部空间不足时下方避让、键盘/点击隐藏、重入显示、复制 ✓ 反馈、无用关闭/完整路径提示消除、触发控件消失后的提示清理。最后一次仅调整组件列表完整版本号的提示条件，未重复未受影响的整套检查。

原生检查只向本轮自有 PID/HWND 发送窗口消息并截取对应窗口；前台窗口与全局光标位置均未改变，不写真实剪贴板。所有检查窗口均已随测试会话结束。

## 已解决的验证问题与边界

早期 candidate-01 使用了会覆盖现有控件监听的 hover 注册，触发了 Kit 的单监听限制；已改为可叠加的鼠标移动监听，candidate-02 的 24 项检查全部通过。早期测试用 Escape 检查提示隐藏，但它会按既有行为关闭设置窗口；已用不触发导航的 F1 检查。早期失败记录保留，结果以 `regression-final` 与 `components-final` 为准。

这是隔离的真实 Windows/GPUI 预览验证，未执行真实下载、更新安装等业务流程，也不替代用户视觉验收。原有未提交工作保留，未提交或推送代码，未改写外部任务。
