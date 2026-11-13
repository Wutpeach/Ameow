# 精简确认流程与错误提示条

日期：2026-11-12。本记录描述本轮未提交的 UI 修改及集中工程验证；原生视觉和点击验收待用户完成。它替代上一轮 icon-actions 记录中的应用更新二次确认及组件确认卡片设计。

## 用户可见变化

- 应用更新在已有任务时保持“新版本已就绪”和原更新图标。点击后直接安排任务完成后更新，在按钮附近显示约 4 秒的简短说明；重复点击会再次提示，不增加第二次确认或常驻等待说明。该提示展开时停用同一图标的普通悬停提示，避免重叠。
- 后台仍保留 WaitingForTasks、安全排空、资源释放确认、候选验证和重启门槛。重复点击共用一次排空，不中止已接收的任务。安排更新后沿用原有规则暂停接收新任务。
- 组件升级按钮直接显示目标版本，点击时重新核对查询新鲜度和当前验证版本；恢复推荐版本直接进入原安全后台流程，移除额外确认卡片。实际准备、下载、验证及等待激活过程继续可见。
- 自动保存后的更新偏好不再常驻“已保存”；组件操作不再额外显示“正在处理”或“更新已应用”等重复说明。上游检查中和冷却倒计时归入原按钮，移除重复段落。
- 设置保存、目录访问、应用更新失败、组件操作及许可复制失败等使用浅红背景、错误图标和短文案的提示条。组件准备失败区域也使用同一浅红背景。真实错误、恢复入口、复制诊断与退出确认继续保留。
- Gallery 移除 settings.saved、settings.picker-cancelled、components.update-confirm、settings.app-confirm、settings.app-waiting、full.app-waiting、tray.app-waiting。新增 settings.app-update-feedback，固定展示点击后的局部短提示；生产提示有超时。一般设置保存和取消文件夹选择原本就不显示额外成功/取消文案，本轮只删除对应重复预览。

## 集中验证

- cargo test --locked --lib app_update::service::tests -- --test-threads=1：最终 13 passed。覆盖有任务时一次点击安排更新、重复点击不重复排空、已接收任务继续、安全准入及资源释放门槛。
- 首轮后台测试曾为 12 passed / 1 failed：旧测试将生产根未配置作为前提，但当前生产签名配置已接入。改为测试专用的空信任根 fixture，独立验证缺少可信根时先拒绝请求；没有修改生产信任根或验证策略。修正后上述 13 项全通过。
- cargo test --locked --bin ameow --quiet：161 passed、0 failed、2 ignored（原生桌面相关）。
- python -m unittest discover -s scripts -p test_gallery_tools.py：7 项通过，未打开窗口。
- git diff --check（本轮相关文件）：通过。
- cargo build --locked --bin ameow：通过。
- gallery.catalog 无窗口读取最终 EXE：111 个场景，与 scripts/preview-scenes.json 完全一致；7 个移除场景均不存在，新增反馈场景存在。

产物：D:/Ameow/target/debug/ameow.exe

SHA256：7207e5835552d97a64046a01f4d17d0f18fadcbf713e22a6d635ca57e0755510

## 用户验收入口

重新打开上述 EXE 的 Gallery。查看 settings.app-ready、settings.app-update-feedback、settings.app-save-failed、settings.save-failed、settings.path-denied、components.update-available、components.update-failed、diagnostics.copy-failed、settings.third-party-licenses-copy-failed，检查浅色与深色下的提示条、图标可见性、文案换行和提示框位置。Gallery 使用隔离 fixture，不执行真实升级；真实有任务时的更新点击、短提示消失、任务结束后的安全重启仍待原生验收。

本轮未使用 computer、未打开原生窗口或自动执行真实更新/重启，未提交、未推送。原生外观与交互不能由上述工程测试替代。
