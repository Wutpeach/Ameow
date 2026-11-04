# Ameow 原生场景预览

在 Windows 仓库根目录编译一次开发程序，然后启动终端预览：

```powershell
cargo build --bin ameow
./scripts/preview.ps1
```

也可将 `scripts/start-preview.bat` 复制到桌面双击启动；它会在 Windows Terminal 中打开同一个预览菜单。退出菜单后保留 PowerShell 窗口，便于查看报错，关闭窗口即可。脚本固定指向 `D:\Ameow`；仓库搬家后修改 BAT 中的 `AMEOW_ROOT`。

终端先显示界面分类：折叠主界面、展开主界面、下载队列、设置、组件管理、诊断、托盘弹窗、右键菜单、退出确认。鼠标悬停高亮，单击即可进入分类或切换状态；也可用 ↑ / ↓ 选择、Enter 确认。切换后留在当前分类，可继续选择其他状态。顶部有可单击的“返回”“退出”按钮；分类首页的“返回”不可用。Esc 或 b 返回分类，q 或 Ctrl+C 退出，h 查看帮助。进入或返回分类只浏览目录，当前预览保持不变。双击按首次单击处理，不会连续进入两层目录。

顶部保留操作提示、当前预览和最近结果；较长目录按窗口大小分页。← / →、PageUp / PageDown 或鼠标滚轮直接翻页；Home / End 定位首尾状态。正常交互终端没有数字输入框，刷新当前画面，退出后恢复原终端画面和输入设置。

重定向输入或输出时保留普通文本命令：分类/状态编号或完整名称加回车选择，n / p 翻页，b 返回，help 帮助，q 退出。命名直达使用下面的 -Scene 参数；-List 输出完整平铺目录，其编号仅用于目录索引。

切换复用同一个进程；每次启动脚本都有自己的临时目录和进程，退出只关闭本轮实例。

Agent 可直接打开场景，或捕获真实窗口 PNG 后自动退出：

```powershell
./scripts/preview.ps1 -Scene diagnostics.copy-failed
./scripts/preview.ps1 -Scene components.recovery-required -Capture target/recovery.png
./scripts/preview.ps1 -List
./scripts/preview.ps1 -Exe target/debug/ameow.exe -Scene tray.mixed
```

不带 -Capture 的命名直达会保持窗口，直到窗口关闭或 Ctrl+C；带 -Capture 时写 PNG 与同名 JSON，并自动结束本轮进程。PNG 路径必须是新路径，防止覆盖已有证据。截图复用 scripts/repair_a_runtime.py 的 Windows BitBlt 区域截图，需要 Python 和 Pillow、可见且未被遮挡的桌面窗口。

底层仍可运行 ameow.exe --preview，默认显示 queue.mixed；--preview-scene 接受同一份目录中的名称。--preview-control 是脚本使用的本轮控制文件，不需要向 GUI 发送数字键。原有生产键盘交互保持原逻辑；旧队列控制 Fixture 保留给历史定向验证。

## 场景与维护

scripts/preview-scenes.json 是名称、分组和说明的唯一目录，编译进程序；终端读取当前 EXE 导出的目录，因此旧程序不会静默显示源码新增的场景。目录更新后重新编译即可，无需同步一份终端菜单。

首批共 84 个场景，逐项截图与覆盖清单见 [#20 验证记录](evidence/issue20/README.md)。覆盖 Compact、Full、队列、常规与下载设置、组件、诊断、托盘弹窗、Full 菜单和退出确认。组件更新、诊断复制、设置保存等难触发状态直接注入现有呈现字段，不另画演示 UI。瞬时反馈保持到切换场景；队列真实生产时限仍由原有策略决定。

添加场景时，在目录填写稳定名称、surface、state、说明，并在现有的局部注入位置映射真实状态：src/preview.rs 负责队列/主界面，settings_window.rs 负责设置与组件，tray_popup.rs 负责托盘摘要。新增前核对产品确有该状态；不要只添加名称却让未知 state 落回空闲。同步更新最低必要的行为测试，并实际打开受影响原生窗口。

## 隔离和证据限制

预览不创建生产协调器、运行时、设置存储或系统托盘图标，不取得生产单实例锁，也不响应真实实例的恢复请求。命令边界拒绝真实下载、重试、组件更新和设置持久化；目录选择、启动项、Explorer、剪贴板和外链入口在预览中不执行。设置与托盘使用真实 GPUI 组件，版本、目录、异常和成功反馈均为合成值；按钮允许观察现有交互外观，预览不模拟完整业务流程。

Compact 的当前生产渲染隐藏状态详情和 Badge，所以不同底层状态可能呈现相同折叠圆形。对应 Full 场景展示环、进度、文案和 Badge；这不是预览漏画。保存成功也沿用产品现状，只展示确认后的值，不新增成功提示。

本轮没有做主题、语言、DPI 和任务数量的全排列；没有逐项模拟所有组件下载/验证阶段、HTTP 错误类型、检查冷却/超时、任意连续交互流程或所有 native picker 失败。它们复用已覆盖的呈现分支，或属于真实系统操作验收；后续 UI 开发按需局部补充。托盘弹窗使用主屏合成定位，不代表 Windows 通知区域或混合 DPI 的行为已验收。

截图 JSON 保存场景、PID/HWND、窗口标题/边界/DPI、EXE SHA-256、源码 HEAD 与 dirty 标识、时间和控制回执。回执确认应用已接受场景；截图另等待渲染完成并定位本轮 PID 的目标窗口。它能证明真实 GPUI 绘制了模拟状态，不能证明真实下载、组件更新、设置持久化、系统剪贴板或托盘行为成功。
