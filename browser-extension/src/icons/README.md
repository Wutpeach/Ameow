# 页面视频图标来源

scissors.svg 为 Lucide 官方原 SVG，固定于提交 742ea78395b4122e13fd46743caba5140f47fb66：

- https://github.com/lucide-icons/lucide/blob/742ea78395b4122e13fd46743caba5140f47fb66/icons/scissors.svg

保留原图形与视框，展示尺寸/描边由页面控件统一。完整许可原文保存在 ../../third-party/lucide-LICENSE，构建同时放入 dist/LICENSES.txt；不新增Lucide运行依赖。

page.mjs 的向下尖角 Marker 为本项目自绘SVG，使用24网格及同类圆角描边；其余既有播放、关闭等内联线性图形不标作Lucide。猫仍直接引用 assets/brand/tray/macos/ameow-menu-bar-white.svg 原品牌轮廓。

marker-range-in.svg / marker-range-out.svg 为本项目65设计任务提供的完整Marker相向半形，原始14×14、path描边1.5px与non-scaling-stroke保留。固定框中心x7对应时间锚，禁止按墨迹重新居中；代码保持尖端与既有完整Marker基线对齐。规范来源为任务交接的marker-endcaps-display-text/SPEC.md，不新增第三方许可或位图。
