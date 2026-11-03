# Ameow Next 设置细节优化

2026-11-03。用户批准前轮 4 项 Critique 建议，并确认参考图仅用于研究文字、间距与控件层级，不复制其布局或增加保存流程。当前为未提交的本地修改，等待用户视觉反馈。

## 实现

- 标题由 20/28 调整为 18/24 Medium，正文/标签由 14 调整为 13，简单行由 64 调整为 56。保留 32 高按钮、6 圆角、128 侧栏和 24 内容内边距；常规与关于页移除重复横线。
- 按控件实际布局和视口计算最小滚动量；Tab/Shift+Tab 切换后显示目标。只响应键盘遍历，不阻止后续手动滚动。
- 缺失组件或异常时将现有诊断与恢复操作移到版本详情之前；正常就绪状态仍在底部提供诊断。不新增后台重试、升级或持久化路径。
- 溢出内容显示滚动位置提示；浅色设置错误正文局部使用 #B8323C，原生截图实色像素测得白底对比度约 5.90:1。图形状态 Palette 不变。
- 路径条显示“复制 / Copy”，保留整条点击、键盘操作、完整路径 tooltip 和成功反馈。
- 下拉菜单遮挡后方控件，选项点击停止继续传播；最终构建验证浅色切换深色后没有打开后方托盘选择器。
- DESIGN.md 仅同步相关字号快照及局部规则，Surface 简报同步；未重新 init，未改旧 Electron。

## 验证

- `cargo build --manifest-path ameow-next/Cargo.toml --bin ameow-next --locked`：PASS。
- `cargo test --manifest-path ameow-next/Cargo.toml --bin ameow-next settings_ --locked`：15 passed，0 failed，包括新增的最小焦点滚动量测试。
- `git diff --check`（本轮 Rust 文件及 DESIGN.md）：PASS。
- 原生界面：浅色中文及深色英文四个分类；检查中、冷却、上游结果；组件上下滚动、Tab 可见性、方向键/Enter 切换语言、路径复制反馈。最终菜单修复后的构建另查浅深中文常规页及鼠标主题选择。
- 19 张截图、两次构建对应关系、源码/EXE SHA256 见 manifest.json 与 launch.json。原始评审截图保留在相邻 settings-20261103 目录。

## 限制

Windows 96 DPI 下验证；未进行高 DPI、macOS、NVDA、完整组件就绪或升级激活验收。隔离配置中的组件来源错误仅用于失败态展示，未作为后端缺陷定位。最终开发程序 PID 26068 留在深色中文常规页，使用隔离临时配置，启动参数设置 30 分钟后自动退出。

已有 PRODUCT.md、设计 sidecar、archive、config 和两份 Trellis journal 改动保留；未创建 git commit，未发布或写入外部任务系统。前轮 Critique 的 4 项实现已核查并关闭该快照的待处理列表，这不替代用户视觉验收。
