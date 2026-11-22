# Tasks

## 1. 精确输入与编码

- [x] 1.1 复用实际HTTPS全轨有限请求到精确区间，Python与Rust定向门控测试覆盖精确/普通/非YouTube/HLS/混合/冲突。
- [x] 1.2 用唯一1080p合成源少量比较fast/faster/veryfast，记录编码时长/文件/质量与兼容证据，按结果落实保留CRF18/分辨率/AAC192k的最小preset选择。
- [x] 1.3 复用非关键帧音画脉冲素材，真实原生HTTPS验证有限Range、精确重新编码、首末参考帧/音画/严格时长及相关取消。

## 2. 交付

- [x] 2.1 同步主规范并通过本change定向校验，完成一次jobs4/独立BelowNormal根开发版增量构建，记录本人精确复测入口及未测边界。

## Workflow follow-up

- 2026-11-22 本人已确认精确切分下载 PASS，并授权发布 0.5.1；验收来源为 Windows 根 main 16201d45、EXE SHA-256 22e92b3231348a58cfb780e81cd04e8ec687aa64ddaf6ac37e1ad80b622d613d，来源会话 6ab73dcd-a4bd-4b02-b82f-de717b34fcb2。主规范已同步，归档本 change；整体链路开销留 0.5.2，最终候选完整检查在 Tag 前执行。此记录不扩大为 Mac 或正式包的本人验收。
