# Validation

- 2026-11-24，Windows x64 / 96 DPI。设置相关定向测试 30 passed、1 原有 ignored；配置单一 Gallery 入口测试 1 passed。既有 ignored 不计通过。
- 根 main 使用 D:/Ameow/target、jobs4、仅构建进程 BelowNormal。完成一次稳定增量 build；用户随后要求删除来源文案后，仅追加一次约5秒的增量 build。CLI、Host、扩展源码无改动，配套复用。
- 实现源码 37250e7c 的隔离原生投影：浅色中文、深色英文各覆盖 pending/成功/失败/复制失败及慢 pending；图像对比确认演示相同区域不位移。另有 6 张普通动态连续帧及 GIF，确认可见失焦继续播放；Reduced 显示完整静态。浏览器配置、设置或剪贴板未真实写入。
- 用户后续文案修订源码 7e6627eb 再看浅色中文与深色英文组件页：删除“随 Ameow 提供”等说明，保留版本、配置与刷新。旧配置页证据因该修订仅删除组件行文案而复用，保留各自 EXE 指纹，不冒称同一二进制。
- 完整截图、逐图输入/EXE/PID/HWND/DPI/时间回执与报告位于 D:/Ameow-handoffs/settings-feedback-cleanup-20261124。原窗口 X、返回、焦点恢复、Escape 和演示原逻辑保留；没有模拟 Windows 日常键鼠，最终操作手感留本人验收，macOS 未原生验证。
