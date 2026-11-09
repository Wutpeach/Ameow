# #32 Gallery 定向验收与兼容性阶段报告

GitHub 阶段报告已回写并全文逐字回读：[issuecomment-6722630016](https://github.com/Wutpeach/Ameow/issues/32#issuecomment-6722630016)。

本阶段从 D:/Ameow-gpui-kit 的 feature/gpui-kit-migration / c89cd645 继续，
当前新增成果保留为未提交改动，等待网页侧阶段验收；不是整个迁移任务 Done。
既有引擎提交 3d657b74、Base/Token/Gallery 提交 c89cd645 及验收资产均保留。

## 实际变更

- Gallery 新增本分类双主题截图、批量进度、显式取消和预览重新打开。
  截图失败允许原场景直接重试；预览退出恢复保持当前场景与主题。
- CLI 新增 --surface，manifest 区分运行/完成/取消/失败；错误/取消仍保留原图和部分总览。
  Python 预览使用 Windows kill-on-close Job，控制器异常终止也不会遗留所属预览。
  Gallery 关闭最多等 5 秒，再结束控制器，由 Job 清理其子进程。
- 按职责对照删除 preview.ps1、preview-menu.ps1、preview-console.cs、start-preview.bat、
  test_preview_menu.ps1；保留 preview-scenes.json、原生截图、CLI、ACK、DPI/跨屏/阴影等验证能力。
- 新增真实设置服务/磁盘与 UI ACK 的集成回归。产品运行逻辑、依赖与 94 个 Preview Scenes 未变。

## 已运行的验证

| 范围 | 实际结果 |
| --- | --- |
| Gallery 本轮完整定向检查 | 6 项 PASS：深色 ACK、分类双主题、全部截图启动后取消、截图失败原地重试、预览退出恢复、关闭清理 |
| 单张 Light | 较早轮成功；后续主题切换等待检查未完成，保留该轮不完整状态，只复用单张证据 |
| 有限批量 | Menu 2/2 complete；完整目录 1/188 cancelled；关闭时批次 0/188 cancelled；未运行完整矩阵 |
| 普通/reduced 动画 | 各 122 个应用帧；中间过渡 40/0；重复 Compact/Full 与正常退出通过 |
| Shell 托盘 | 实际图标注册、所属回调开关弹窗、退出移除通过 |
| 设置 | 真实 command → 服务保存 → UI ACK → 磁盘/重建读回通过；写入失败保留旧 ACK 和数据，恢复后可重试 |
| 工程 | Debug 增量构建、全目标 cargo check 通过；设置相关 23 项 PASS、无窗口工具 7 项 PASS；Python 语法检查通过 |

按用户本轮明确同意进行了有限桌面验证，并已关闭所有本轮进程和窗口。未重复引擎两套
12 项检查，也未重做旧 94×2 完整截图。早期全局鼠标试验未可靠命中，后续还发现测试
提前接受 step=0 及未等待启用间隔；已修正等待条件。最终 Gallery 检查使用定向 Win32
消息，不声称物理输入通过。失败、诊断和不完整轮次均保留在 evidence/issue32/ 下。

## 可复核证据

- docs/evidence/issue32/gallery-controls-validation.json：精简原生/工程结果、PID 清理与身份边界。
- docs/evidence/issue32/gallery-coverage.md：旧工具职责与保留能力对照。
- evidence/issue32/gallery-native-final-3/report.json：6 项原生检查全文；captures/ 下保留截图、
  完成和取消 manifest、回执、日志、总览。实际 5 次原生截图，3 张派生总览。
- evidence/issue32/gallery-native-final-1/：仅单张 Light 已通过的部分轮次。
- evidence/issue32/compatibility-native-1/：动画 JSONL 与 Shell 托盘报告，无新增截图。

以上路径均相对于 D:/Ameow-gpui-kit，关键证据在 docs/evidence/issue32 中另保留了紧凑的
Light 菜单、Dark 恢复截图和对应原始 JSON。

原生验收 EXE SHA-256：3e9cab923f8ae9455f9cfcc069a39d3173d0a589fb01c456c58e9a81dc4f1fb1。
加入仅 cfg(test) 设置集成检查后，cargo test 构建了新的普通 EXE，SHA-256 为
860efe4d81045d7c16ab647eb8b8adbf872a66eca562c2244f76c5ac90a18e84，保留在
evidence/issue32/gallery-controls-after-checks.exe。Gallery 运行时代码没有再变，
依影响范围未重开窗口；两个二进制身份不混用，当前 checkout HEAD 不当作构建提交。

## 尚未验收及同步边界

Gallery 物理键盘/鼠标遍历、真实 Shell 点击、生产设置窗口到持久化的完整 UI 链、
其他 DPI/混合 DPI/跨屏与显示器呈现节奏仍未验证。本机原生证据仅实际 96 DPI。
旧引擎 Debug/Release 的既有通过证据继续保留，不自动扩展为本轮最终 Release 验收。

main 仍为 4d57d3a70889b739cada6efc2040a1f91b6ef67e，自动更新有独立未提交工作，
尚无稳定新提交可合并。未复制或修改主线工作，未合并回 main、Push、发布或关闭 #32。
待网页侧阶段验收；主线成果形成稳定提交后再做 main → 迁移分支与受影响联合回归。
