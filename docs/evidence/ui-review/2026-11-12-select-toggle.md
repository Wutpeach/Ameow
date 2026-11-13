# 下拉菜单重复点击切换修复

范围：常规设置的主题、语言、托盘图标，以及组件与诊断的 yt-dlp 版本菜单。

原因：触发按钮位于菜单面板外。第二次点击时，外部按下事件先关闭菜单，再在鼠标松开后以已关闭状态重新生成按钮回调，导致菜单被打开。

修复：根据实际绘制的按钮边界，外部关闭处理跳过该按钮，由按钮自己的点击回调切换；其他外部点击仍关闭菜单。保留鼠标松开触发、键盘语义、焦点处理和原有进出动画。对应 Gallery 场景说明已更新。

新增可单独执行的原生回归：python scripts/test_gallery.py --select-toggle --exe <EXE> --output <新目录>。只发送本轮预览 PID/HWND 的消息，不发送全局键鼠输入，不抢前台，不调整窗口层级，不写真实设置。

旧 EXE 在“第二次点击后保持收起”的断言复现失败。新 EXE 7组变体、42项检查全部通过：四个入口、深色主题及组件菜单、减少动态语言菜单；每组验证首次展开、再次点击收起、第三次展开、关闭动画中重开、Escape和外部点击关闭。

集中工程检查：cargo test --locked --bin ameow --quiet，175 passed、2 ignored；cargo build --locked --bin ameow 通过；diff whitespace检查通过。

证据：target/ui-review/2026-11-12-select-toggle/before-regression/report.json 与 after-regression/report.json。冻结开发版 candidate.exe；SHA-256 00475e4428a3aac4ed4013600b04a030e7e5d72046562b03e4e927066fb2e899。开发输出 target/debug/ameow.exe 与冻结副本一致。

本机原生预览验证通过，用户视觉验收待进行。未提交、未push。
