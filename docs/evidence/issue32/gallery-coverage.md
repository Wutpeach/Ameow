# Gallery 与旧 PowerShell 工具职责对照

本阶段从 c89cd645 继续；仅按影响验证，未完成或重跑全目录矩阵。当前真实 EXE 目录
仍为 94 场景 / 9 类，普通浏览、命名直达、原生截图与自动化均有后继入口。

| 必要职责 | 原入口 | 新入口与验证 |
| --- | --- | --- |
| 真实 EXE 目录与分类 | preview.ps1 导出目录；preview-menu.ps1 分组 | Gallery 编译内嵌目录；gallery.py --list 从指定 EXE 导出。实际导出 94/9；源目录不另复制 |
| 持续浏览与切换 | 控制台菜单、命名 Scene | Gallery 分类/状态按钮；gallery.py --scene。既有 9 项隔离回归复用，本轮原生切换 Compact → Menu 与 Light → Dark |
| 键盘与鼠标入口 | preview-console.cs 的控制台输入 | 原生 Base Root 焦点链与 Button。旧控制台专用按键/分页不再维护；Gallery 的物理键盘/鼠标遍历仍列为后续产品验收，不把定向消息测试称为物理输入 PASS |
| 进程隔离与 ACK | GUID 临时目录；PID/step/scene | 独立 Preview；唯一目录和 PID/step/scene/night。复用已通过双实例检查；本轮恢复预览时保持场景/主题并改用新 PID |
| 原生截图与身份 | preview_capture.py | 保留同一 HWND/BitBlt、DPI、EXE SHA、回执、防覆盖链；Light 单张与 Dark 恢复单张通过。临时 TOPMOST 截图不证明自然置顶 |
| CLI 与脚本调度 | preview.ps1 -Scene/-Capture/-List | gallery.py --scene/--capture/--list，增加 --all/--surface/--theme 双主题批量；不会自动构建或调用主线 EXE |
| 批量与总览 | 原入口缺乏集中总览 | 原生“本分类截图”完成 Menu 的两主题；“全部截图”确认 188 预期数量，保存 1 张后取消；Contact Sheet/HTML/manifest 有实际资产 |
| 取消、异常、退出 | finally 退出所属 PID | 取消按钮与关闭 Gallery 均清理批量所属预览；截图目录故障可直接重试；预览退出可重新打开。Windows Job 的控制器崩溃清理由无窗口真实子进程测试证明 |
| 原生兼容验收 | repair_a_runtime.py / windows_validate.py 等 | 原样保留；新增有限 Gallery 和动画/托盘脚本。自然置顶、首次不抢焦点、设置拖动/键盘复用既有证据，不再次跑全套 |

在保留上述职责后移除 preview.ps1、preview-menu.ps1、preview-console.cs、start-preview.bat
及只测试旧控制台布局的 test_preview_menu.ps1。旧启动包装硬编码 D:/Ameow；新入口从当前
Worktree 解析 EXE/脚本，避免实验预览误用主线。历史 #20 资产不重写。

仍保留 scripts/preview-scenes.json、preview_capture.py、gallery.py、test_gallery.py、
test_gallery_tools.py、test_gallery_native.py、test_gpui_migration.py、test_gpui_compatibility.py、
repair_a_runtime.py、windows_validate.py、windows_cross_monitor.py、windows_shadow.py 等。

证据目录：evidence/issue32/gallery-native-final-3/（6 项通过，5 次原生截图，另有派生总览图片）；
evidence/issue32/gallery-native-final-1/（仅 Light 单张已通过，后续主题切换检查中断，整轮不算通过）。
前面的坐标/等待诊断和失败轮次保留。最新 GUI 测试使用定向 Win32 消息；全局鼠标试验受
光标位置变化干扰，最终还发现测试过早接受 step=0、未等待控件启用。没有据此声称物理输入通过。

与截图总览相关的新状态都位于开发期 Gallery，不增加产品 Preview Scenes；产品 94 场景未改动。
