# 队列 X 圆底尺寸统一

2026-11-13。队列取消按钮原先把 24px 点击区域整体作为悬停底色；改为复用 `FULL_CLOSE_DISC_SIZE` 的 18px 内圆，与退出异常/菜单的关闭按钮一致。24px 点击范围及键盘焦点边框保留，按下底色也限制在内圆。其余队列操作维持原样。

最终构建与增量空白检查通过。浅色、深色共 6 项原生检查通过：队列与参照关闭按钮的实际圆底均为 18×18px；在圆底之外、24px 点击区域之内按下，仍会触发按压反馈。现有 `queue.concurrent`、`overlay.exit-cleanup` 场景覆盖该外观，无需新增状态。

证据：`D:\Ameow\target\ui-review\2026-11-13-queue-close-disc`，包括 `close-disc-comparison.png`、`native-final/report.json`、`changes.patch` 及 `manifest.json`。最终归档 `candidate-01.exe` 与 `D:\Ameow\target\debug\ameow.exe` 相同，SHA-256：`18ead3a0bb7807175fd524fa6c611588fda2636a8f40c8ee8ac7f8bfd529bd6a`。

本轮为样式修正，未新增单元测试或重跑业务套件；原生验证只向自有预览窗口发送消息，未执行真实下载取消。外观等待用户验收。没有提交或推送代码。
