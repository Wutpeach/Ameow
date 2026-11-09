# Ameow Gallery 与原生场景预览

在 Windows 仓库根目录增量编译当前开发程序，然后打开原生 Gallery：

    cargo build --locked --bin ameow
    ./target/debug/ameow.exe --gallery

左侧按界面分类，中间选择状态，右侧切换浅色/深色、截取当前真实窗口。
所有按钮支持 Tab、Shift+Tab、Enter、Space；Gallery 的 Root 负责焦点遍历，
产品设置窗口继续保留原有焦点链。场景通过独立 Preview EXE 呈现，截图后可在
Gallery 内查看结果；预览窗口本身可用于定向交互检查。预览意外退出后可点击
“重新打开预览”，恢复当前场景与主题。截图失败后可直接重试。
关闭 Gallery 只结束它拥有的预览和截图进程。

**真实窗口验证会占用桌面。局部修改只检查受影响场景，复用已有开发 EXE 与证据。**
“全部截图”会连续切换整个目录和双主题，当前 94 场景约 188 张图，约需 3–5 分钟；
只在桌面空闲且确有里程碑验证需要时使用，不在每次修改后自动执行。
“本分类截图”仅生成所选分类的双主题总览。批量期间显示进度，可点击“取消截图”，
保留已完成证据并关闭本轮批量预览；Gallery 自身和原先浏览的预览继续可用。
指定 --gallery-output <目录> 可选择本轮截图根目录；默认使用仓库 evidence/
下带时间戳的新目录。截图依赖现有 Python/Pillow；普通原生场景浏览不需要 Python。

## 定向检查和批量 CLI

gallery.py 从指定 EXE 导出它实际编译的目录，不读取一份可能比 EXE 更新的源码目录：

    python scripts/gallery.py --list
    python scripts/gallery.py --scene diagnostics.copy-failed
    python scripts/gallery.py --scene settings.theme-menu --theme dark --capture evidence/theme-dark.png
    python scripts/gallery.py --exe target/release/ameow.exe --scene tray.mixed
    python scripts/gallery.py --all --surface menu --theme both --output evidence/gallery-menu

不带 --capture 的命名直达会保持窗口，直到关闭窗口或 Ctrl+C；截图模式完成后自动
退出。每次打开都有独立临时目录、PID、单调 step、scene/night ACK。截图保存 PNG 和
同名 JSON，已有任一文件时拒绝覆盖。ACK 只确认状态已接受；截图默认 reduced motion，
另等待显式 settle 间隔。Windows 合成画面暂时为空时仅做两秒内有时限的重试，持续空白
会失败，不把空白资产记为通过。这不是 GPU 呈现完成栅栏或动画帧节奏验收。

需要整个目录的总览时，在可占用桌面的时间集中运行一次：

    python scripts/gallery.py --all --theme both --settle 0.8 --output evidence/gallery-final

输出目录必须不存在。index.html 直接链接原尺寸图片，各界面/主题另有最多八图的分组
Contact Sheet；manifest.json 持续记录已完成资产，只有全部完成才写 complete: true。
发生错误或取消时保留已完成资产和 complete: false；status 区分 running、complete、
cancelled、failed，expected_count 记录本批预期数量。取消/失败批次也尽量生成已完成
图片的总览，不把部分批次称为完整通过。Python 控制器用 Windows Job 约束所属预览，
控制器异常终止也会清理子进程。
浏览器总览只读本地图片，不重画产品 UI，也不运行任何反馈/标注服务。

截图沿用 preview_capture.py / repair_a_runtime.py 的原生 HWND + BitBlt 链，保留 PID、
scene、theme、step、HWND、边界、实际 DPI、EXE SHA-256、时间和回执。源码 HEAD 是
截图时的 checkout HEAD，EXE 的身份以 SHA-256 为准，不能把当前源码 HEAD 当作编译时
提交。新 Gallery 截图会临时将本轮目标呈现到中性背景上方，之后恢复原 TOPMOST 标志；
JSON 明确标注此行为，所以它不能证明自然置顶。自然置顶/不抢焦点用专门原生检查。

## 目录和维护

scripts/preview-scenes.json 是名称、分类和说明的唯一目录，编译进程序。
当前基线有 94 场景/9 类：Compact 11、Full 12、队列 26、设置 18、组件管理 13、
诊断 5、托盘 7、菜单 1、退出确认 1；以指定 EXE 导出的实际目录为准。
新增场景后重新编译即可，不维护另一份 Gallery 场景表。

src/preview.rs 负责队列/主界面，settings_window.rs 负责设置和组件，
tray_popup.rs 负责托盘摘要。复用真实渲染与局部状态注入；不要再画一套 Demo。
切换时清除上一场景的环/进度连续性，防止空状态残留旧 Job。
主题切换同时改变预览呈现和合成设置值；预览不把主题写入用户设置。

## 隔离和验证边界

预览不创建生产协调器、运行时、设置存储或系统托盘，不取得生产单实例锁；不执行真实
下载、重试、组件更新、持久化、启动项、Explorer、剪贴板或外链操作。
目录、版本和错误反馈是合成值，采用真实产品布局和 Kit Base 控件绘制。
Compact 本来隐藏状态详情和 Badge，多个折叠场景外观相同是产品行为。

Gallery 不替代实际设置 ACK/持久化、系统通知区域、更新/重启、拖动、焦点/自然置顶、
下载/OLE drop/native picker 或其他 DPI/跨屏验收。单屏 96 DPI 的证据不升级为全 DPI PASS。

scripts/test_gallery.py 定向验证双实例隔离、错误回执、空场景重置、截图身份、防覆盖、
总览链接和退出清理；scripts/test_gpui_migration.py 验证引擎/控件的原生键鼠窗口行为。
两者都会打开真实窗口，只在受影响行为需要复验且桌面可用时执行。

scripts/test_gallery_native.py 对 Gallery 的截图按钮、分类双主题总览、完整批次启动后取消、
截图失败重试、预览退出恢复和关闭清理做有限验证；它将 Win32 鼠标消息定向到所属 HWND，
不是物理鼠标覆盖测试，额外使用已安装的 psutil。它不会完成 94×2 矩阵。
scripts/test_gpui_compatibility.py 不保存截图，仅做短时普通/reduced 动画和真实 Shell
托盘图标注册、所属窗口回调与退出清理；不证明其他 DPI、跨屏、真实 Shell 点击或合成帧节奏。
scripts/test_gallery_tools.py 不打开窗口，检查防覆盖、回执边界、取消/失败标记及控制器崩溃清理。

旧 preview.ps1 / preview-menu.ps1 / preview-console.cs / start-preview.bat 和对应的
test_preview_menu.ps1 已在职责对照后移除。替代证据与保留工具见
[Gallery 职责覆盖](evidence/issue32/gallery-coverage.md)。preview_capture.py、
repair_a_runtime.py、windows_validate.py 及专门的 DPI/跨屏/阴影验证工具继续保留。
旧入口说明及首批场景证据仍可在 Git 历史和 [#20 记录](evidence/issue20/README.md) 回溯。
