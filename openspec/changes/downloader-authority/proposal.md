# Proposal

## Why

原生下载器已经解析成功后，Ameow 仍因未知媒体字段、固定图库 JSON 形状或成功进程的警告而拒绝继续。用户于 2026-11-16 明确授权修复职责边界：下载能力由实际下载器判断，Ameow 管理意图、执行安全和真实产物。

## What Changes

- 专用 URL 识别以外的安全公开输入交 Generic；保留明确单作品、分 P 和去重意图。
- 源 codec、height、audio 和标题允许未知；原生格式选择保留用户画质参数，实际成品再核对。
- 收敛图库元数据与扩展名预检，成功警告不作失败；根据实际图片或视频选择现有验证器。
- 区分原生失败、损坏媒体与验证证据不足；可选观察不影响资源结算。
- 提交可审查实现及相对 Mac 旧基线的依赖说明。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `download-execution`：简化链接准入、可选媒体观察、原生能力与成品验证边界。

## Impact

修改 request、yt-dlp/gallery-dl Adapter、中性媒体合同、现有 verifier、诊断及相关回归。复用队列、运行时、监督器和发布框架，无新依赖；保留原工作树和 Mac 未提交适配，不合并、Tag 或 Release。
