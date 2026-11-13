# 第三方许可滚动条同步修复

第三方许可正文滚动时，旧手绘滑块仅按起始行号占全部行数的比例定位，没有使用虚拟列表的实际滚动范围，也无法拖动。当前许可正文约52,487行；列表尚未测量的行按零高度参与内部范围，造成正文已滚动而滑块几乎不变。

改为 GPUI Base 的无样式滚动条，直接共用正文 ListState。Ameow 提供细线样式、颜色与最小滑块长度；常驻显示，宽度固定。支持滚轮同步、Home/End与拖动定位。

列表首次布局及宽度变化会清空预估高度。因此在子元素完成预绘制后，为未测量行补充18px的最小高度估计，并请求下一帧；已测量的真实换行高度继续保留。仅在总高度不足各行最小高度时补充，不在每次滚动时全量测量许可文本。

Gallery许可场景说明已更新。原有复制按钮、许可内容与子页导航保持既有实现。

新增原生回归：python scripts/test_notices_scrollbar.py --exe <EXE> --output <新目录>。只向自有预览 PID/HWND 发送消息，不调用全局键鼠输入、不抢前台、不调整窗口层级或写真实设置。

集中验证：旧EXE在滚轮滑块跟随检查复现失败；最终候选在浅色/深色各7项、共14项原生检查通过，覆盖正文滚动、滑块位置、Home/End、拖动到中间/底部/顶部。cargo test --locked --bin ameow --quiet：175 passed、2 ignored；cargo build --locked --bin ameow与diff whitespace检查通过。

最终开发输出 target/debug/ameow.exe；冻结副本 target/ui-review/2026-11-12-notices-scrollbar/candidate-02.exe；SHA-256 9ad88735b20df65c3687c6c4a4ffc92a05068e3defc2854892cb123d61bb8959。原始回执及局部截图位于 before-regression/ 与 after-regression-02/；汇总为 manifest.json。中间候选未通过的记录另行保留。

本机原生预览已验证，用户视觉验收待进行。未提交、未push。
