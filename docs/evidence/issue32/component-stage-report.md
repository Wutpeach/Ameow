# #32 GPUI Component 第一阶段报告

日期：2026-11-09。分支：`feature/gpui-kit-migration`，起点 `19809a1ac44ca716b54cc3b5c193a0ab11d048e8`。

## 实现

- 精确接入 `gpui-component =0.9.0`、`gpui-kit-assets =0.9.0`，继续使用唯一的 `gpui-pre =0.3.11` / `gpui-base =0.9.0`。锁文件新增 78 个包，没有移除或升级已有包；保留 AccessKit TLS 本地补丁。
- 设置中的主题、语言、托盘图标采用官方 Select，使用官方尺寸、圆角、焦点环、下拉和菜单样式。按同类控件收益复用，没有扩展到无用途控件或改造 Compact/Full。
- Ameow palette 映射到 Component 专属 input/popover/list/primary 等颜色；先载入模式，再映射颜色，最后恢复原 Base tokens。避免在每帧重复刷新 Theme。
- Component 的本地选择受已确认的业务设置控制，保留 ACK、保存中禁用、失败旧值和重试。选项身份与翻译文字分离。
- 设置窗口采用官方 Root；弹层 Esc/方向键/Enter 交给 Select，Tab 从表单触发器继续导航。关闭态焦点句柄与打开态列表句柄的区分依赖精确 pin 的 0.9.0 公开 Focusable 行为，升级时需复核。
- 初始化改为 Component init（内部已初始化 Base），资源保留 Ameow 同名别名，其他图标由官方 bundle 提供。Ameow 有效 Reduced Motion 同步到 GPUI。旧下拉绘制及无意义的菜单枚举测试已移除。
- 三个下拉 Preview Scenes 改为首帧后向真实 Select 派发公开 Confirm 动作。

## 验证与证据

- `cargo check --bin ameow`、`cargo build --bin ameow`、test executable 构建成功；空白检查通过。
- 设置相关首次运行：16 PASS / 1 FAIL / 1 IGNORED。唯一失败为真实磁盘 ACK 测试的后端退出等待超过 3 秒，保存、失败回退和重试断言已通过。该项独立复跑 PASS，保留两份原始日志，不删除首次失败。
- 补充 preferences ACK、tray icon ACK、Base tokens 定向测试均 PASS。参见 [检查日志目录](component-stage/)。
- 用户在本轮明确授权后亲自操作隔离宿主（PID 35712）：三个下拉的 Light/Dark、语言、图标选择、Tab/Shift+Tab/Enter/方向键/Esc 全部正常；关闭重开后深色与交互正常。
- 在隔离设置路径临时放置空目录制造真实写入失败。用户操作及截图确认失败保留浅色，错误可见、控件可用；恢复文件后再次选择深色，界面、ACK、磁盘文件一致且错误清除。空目录保留为 `settings.failure-blocker`，未改用户数据。
- [62 次原生状态记录](component-stage/native-states.jsonl)：三个 Select 已提交值均等于 ACK；7 次保存中采样均 disabled。100ms 采样不是每个渲染帧的证明。
- [真实命令与回执](component-stage/native-commands.json)、[最终隔离设置](component-stage/native-final-settings.json)。宿主正常返回，实际退出码 [0](component-stage/native-exit.json)，stderr 为空。
- 四张局部窗口截图：[官方托盘图标下拉](component-stage/settings-round1.png)、[失败回退](component-stage/save-failed.png)、[恢复深色](component-stage/dark-after-retry.png)、[真实主题菜单 Preview](component-stage/preview-theme-menu.png)。
- 产品 Preview 以 Reduced Motion 运行：主题菜单实际画面通过；语言菜单读取到三个列表项目及深色设置值。托盘 Preview 已发起，但自动退出前未再独立观察，因此不单独标为视觉 PASS；真实托盘图标 Select 已由用户通过。未重复完整场景矩阵。

## 受测二进制

- 产品 EXE SHA-256：`0b1d0bab3fd28f5f546b2865ca4cf9341cafbe190e51bae588316ad13306f58a`。
- 隔离测试 EXE SHA-256：`c2884587c240da31f893d0c516f8ff410a7aff8e211bbc3eb21d9857dd06969e`。
- 原始宿主证据：`D:/Ameow-gpui-kit/evidence/issue32/component-native-round1`。原始 Preview stdout/stderr 与控制文件同在 `evidence/issue32/`。

## 结论与范围

Component 代表控件正式接入完成，用户已确认本轮真实操作；等待网页侧独立验收。新增依赖成本、固定版本焦点契约和首次退出等待超时如实保留。

下一部分按用户补充的 Magnetic Nested 实际体验研究并优化磁吸，独立取证。主线当前只读核对到 `1f4b3f21d7e770d427d7bcec109cc647014ce6ff`，其未提交工作保持独立；本轮未整合 main、未 Push/发布/清理 Worktree/关闭 Issue。启动项、混合 DPI/跨屏、自动更新联合回归仍留后续阶段。
