# 单击确认与返回/退出按钮（2026-11-04）

用户要求鼠标可直接操作返回、退出，并希望单击选项即可确认。本次替代上一版双击确认：悬停只高亮，单击分类进入，单击状态切换；顶部 `[ 返回 ]`、`[ 退出 ]` 可直接点击，返回在分类首页禁用。按钮悬停反显，键盘快捷键保留。

本次仅修改 PowerShell 菜单、点击分发、最低必要回归与说明。没有新增依赖、修改 Rust 或重建 EXE；原桌面 BAT 无需替换，重新启动即可加载新菜单。

## Windows 原生验证

- 单击下载队列分类进入状态目录，[回执](entered-category.json)仍为 step 1 / queue.mixed，PID 82504，说明只浏览分类，没有误切换状态。
- 单击 queue.failure 的第二行说明即可切换；[截图](state.png)、[回执](clicked-state.json)为 step 2 / queue.failure，同一 PID。
- 单击顶部“返回”回到分类首页；[实际截图](returned.png)中当前预览仍为 queue.failure，返回按钮变为禁用。
- 双击下载队列分类，只处理第一下；进入分类后没有连带确认鼠标下的新状态，[回执](double-click-category.json)保持 step 2 / queue.failure。
- 单击顶部“退出”后，本轮预览 PID 82504 与测试终端 PID 9648 均退出，GUID 临时目录清理完成；[退出记录](exit.json)。
- [756 个场景/尺寸组合测试](menu-tests.txt)通过，含每项每行的单击确认、两个按钮完整范围及间隙边界、首页禁用返回、重定向无按钮、键盘与 Win32 输入结构回归。
- `git diff --check` 通过，既有 CRLF 提示保留。未重跑不受影响的 84 场景呈现全套，沿用原证据；本次未另采纯悬停日志或重新量测终端模式，恢复机制沿用前版验证。

用户已验收本版，并授权仅提交 #20 已验收内容后结案；最终完整 Commit SHA、Issue 与 Project 状态以 [#20 结案记录](https://github.com/Wutpeach/Ameow/issues/20)为准。原始验证发生在 main 的未提交工作区。本地截图在本次提交前不是 GitHub 网页图片附件。
