# 图标操作与长按钮收敛

日期：2026-11-12。用户授权检查更新、重启更新及此前建议的复制、返回和打开文件夹操作图标化，并要求优化任务进行中确认的长按钮。本记录描述本轮未提交的实现；原生视觉和点击验收待用户确认。

## 实现

- 关于页更新操作使用刷新（检查）、下载、单圈箭头（重启并更新）图标。悬停说明和可访问名称保留完整含义；检查冷却及启动入口限制继续控制禁用状态。
- 组件诊断和许可全文使用复制图标，复制成功变对勾；异步复制中显示等待图标且禁用，复制失败继续直接显示文字。
- 许可页与队列返回改为左箭头。队列返回使用现有 GPUI Kit Button，并在关闭队列后将焦点还给主界面；队列头部高度、任务行和进度轨道保留。
- 下载位置的打开操作使用打开文件夹图标，操作期间显示等待图标并禁用；更改目录继续使用文字。
- 任务进行中的确认按钮缩为“完成后更新 / 稍后”（Update when done / Later）。确认按钮在状态与后果说明下方独立一行，允许按需换行；完整含义提供悬停说明。普通状态的标题占用可伸缩区域，图标操作保留固定空间。
- 组件恢复按钮缩为“恢复推荐版本”（Restore recommended），继续走原有确认流程。
- 修正上一轮页尾图标不可见的问题：GPUI Svg 的绘制需要直接指定自身颜色，仅给父按钮设置文字颜色不能保证绘制。所有新图标直接指定正常或禁用颜色。此修复经编译，实际可见性仍待原生验收。

## 预览与集中检查

新增 settings.app-check-cooldown、settings.folder-opening、settings.third-party-licenses-copied、settings.third-party-licenses-copy-failed；复用 diagnostics.copying/copied/copy-failed、settings.app-confirm 和 queue.mixed 等场景。场景切换时重置相应预览反馈。

- cargo test --locked --bin ameow --quiet：最终 161 passed、0 failed、2 ignored（原生桌面相关）。
- python -m unittest discover -s scripts -p test_gallery_tools.py：7 项通过，无桌面操作。
- git diff --check（本轮相关文件）：通过。
- cargo build --locked --bin ameow：通过。
- gallery.catalog 无窗口读取最终 EXE：117 个场景，与源 JSON 一致，包含四个新增场景。

产物：D:/Ameow/target/debug/ameow.exe

SHA256：e82a844878f7a75482b2616b1626588480da75e94bc74f116c113115f157e2d0

## 原生验收

通过 D:/Ameow/target/debug/ameow.exe --gallery 重新打开。重点检查更新图标和页尾图标实际可见、悬停说明、键盘激活、复制中/成功/失败、返回后的焦点、打开目录中的禁用状态，以及 settings.app-confirm 中英文下的状态、说明和短按钮布局。

本轮未使用 computer、未打开窗口、未执行桌面截图脚本或真实更新/重启。构建与单元检查不代表原生 UI 验收通过。未提交、未推送。
