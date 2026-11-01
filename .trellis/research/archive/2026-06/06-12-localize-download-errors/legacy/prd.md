# 本地化下载错误信息

## Goal

把桌面端 full 窗口里直接暴露给用户的下载失败/取消错误，从原始英文错误码或下载器 stderr，转换成用户能理解的本地化排查文字；同时补齐公开文档中遗漏的上游下载器错误说明，尤其是用户反馈的 BiliBili `HTTP Error 412 Precondition Failed`。

Scope update after product discussion:

- V1 should be docs-first and low risk: keep the desktop full-window error display behavior unchanged for now, so support/debug workflows still receive the exact raw error text users saw.
- V1 should make the docs site searchable by the raw codes/messages users can copy or screenshot, including BiliBili `HTTP Error 412 Precondition Failed`.
- UI localization and structured copy/detail affordances remain a later phase after the product interaction is settled.

用户价值：

- 用户看到下载失败时，先看到“发生了什么、应该先做什么”，而不是只能看到 `ERROR:`、`E_*`、HTTP code 或下载器退出码。
- 支持/反馈仍保留原始错误详情，便于定位上游下载器、站点规则、登录态、网络和输出目录问题。
- 文档覆盖 UI 可能展示的主要错误族，避免用户只能从 issue 或聊天记录里查零散解释。

## Requirements

- V1 保留 full 窗口当前错误展示方式，不改变用户反馈给支持时能看到的原始错误文本。
- V1 文档站必须能通过用户看到的原始错误关键词查到解释，例如 `HTTP Error 412`、`Precondition Failed`、`BiliBili`、`Download cancelled`、`yt-dlp exited with code`。
- V1 文档应同时告诉用户“这通常表示什么”和“先做什么”，并提醒反馈问题时保留完整原文。
- V1 文档更新范围包括中文和英文 public docs。
- V1 不新增 full 窗口复制按钮，不新增错误详情交互，不改变 `DownloadResultPayload`。
- Later phase 才处理 UI 本地化，届时必须保证原始错误详情不能丢失。
- Later phase 中，取消下载不应作为裸英文 `Download cancelled` 展示给用户，应显示“下载已取消/正在取消”一类状态文案。
- 下载失败归一化应区分两层错误：
  - Ameow 内部错误码：`E_ABORTED`、`E_AUTH_REQUIRED`、`E_EXECUTION_FAILED` 等。
  - 上游工具诊断：yt-dlp/gallery-dl/douyin-dl 输出的 `ERROR:`、`HTTP Error ...`、`ffmpeg exited ...` 等。
- Later phase 中，本地化映射应放在共享 helper 或稳定边界上，避免只在 `ForegroundOutcomeOverlay` 里硬替换字符串。
- `DownloadResultPayload` 当前只有 `error?: string`；later phase 需要评估是否扩展 payload，让前端能拿到 `code`、`classification`、`rawError` 或 `userMessageKey`，避免继续靠字符串 contains 判断。
- 公开文档 `site/src/content/docs/docs/troubleshooting/error-messages.md` 和英文版本需要补齐同一批错误族说明。
- BiliBili `ERROR: [BiliBili] ... Unable to download JSON metadata: HTTP Error 412 Precondition Failed` 必须有文档条目。
- V1 验证以 docs build 为主；UI 错误归一化测试延后到 later phase。

## Confirmed Facts

- `src/core/constants/error-codes.ts` 定义了内部下载错误码：`E_ABORTED`、`E_AUTH_REQUIRED`、`E_DIRECT_SOURCE_REQUIRED`、`E_ENGINE_NOT_FOUND`、`E_ENGINE_REJECTED_INTENT`、`E_ENGINE_UNAVAILABLE`、`E_EXECUTION_FAILED`、`E_INPUT_INVALID`、`E_INVALID_DOWNLOAD_INPUT`、`E_INVALID_ENGINE_PLAN`、`E_INVALID_INTENT`、`E_NO_ENGINE_SUCCEEDED`、`E_NO_PROVIDER_MATCH`、`E_OUTPUT_NOT_FOUND`。
- `src/core/constants/error-classifications.ts` 会把错误归类为 `cancelled`、`auth_required`、`input_invalid`、`retry_same_engine`、`fallback_to_other_engine` 或 `terminal_for_site`。
- `src/electron-runtime/service.ts` 在下载完成事件里只发送 `DownloadResultPayload.error = runtimeError.message`，没有把 `code` 或 `classification` 发给前端。
- `src/types/videoRuntime.ts` 的 `DownloadResultPayload` 当前只有 `traceId`、`success`、`file_path`、`title`、`error`。
- `src/utils/downloadEventReducers.ts` 目前用 `cancelled/canceled` 子串判断取消，并把错误首个非空行截断到 96 字符。
- `src/electron-runtime/ytDlpErrorSummary.ts` 目前只从 stderr 中挑出较可用的一行，并为部分 YouTube 网络类错误附加英文代理提示；它不是通用本地化/错误分类层。
- `src/App.tsx` 的 full 窗口 overlay 使用 `downloadErrorMessage` 展示失败/取消结果，视频下载失败时来自 `resolveDownloadCompleteOutcome(...).errorSummary`。
- 当前中文文档已有内部错误码表，但没有覆盖 BiliBili `HTTP Error 412 Precondition Failed` 这一类上游诊断。
- 站点能力探测里有 BiliBili 成功记录，但没有按失败原因沉淀文档。

## Initial Error Inventory

### Internal Ameow Codes

| Code | Current classification | User-facing meaning | First guidance |
| --- | --- | --- | --- |
| `E_ABORTED` | `cancelled` | 任务已取消 | 如果是主动取消，不需要处理；否则重新发送并记录触发步骤 |
| `E_AUTH_REQUIRED` | `auth_required` | 站点需要登录态、Cookie 或授权 | 在浏览器确认可播放，通过扩展从页面重新发送/刷新站点登录态 |
| `E_INVALID_DOWNLOAD_INPUT` / `E_INVALID_INTENT` / `E_INPUT_INVALID` | `input_invalid` | 下载请求缺少必要信息或链接不可用 | 重新复制完整链接，优先用扩展从当前页面发送 |
| `E_NO_PROVIDER_MATCH` | `input_invalid` | 当前链接没有匹配到支持的站点处理方式 | 确认站点支持情况，换公开视频测试 |
| `E_ENGINE_NOT_FOUND` / `E_ENGINE_UNAVAILABLE` | `fallback_to_other_engine` | 下载引擎缺失或暂不可用 | 等待运行时准备、重试或更新 Ameow |
| `E_ENGINE_REJECTED_INTENT` / `E_DIRECT_SOURCE_REQUIRED` | `fallback_to_other_engine` | 当前引擎无法处理这次请求 | 使用扩展从具体页面发送，或换质量/链接 |
| `E_EXECUTION_FAILED` | pattern-based | 下载器执行失败 | 根据同条错误里的 HTTP、登录、网络、格式或输出关键词继续判断 |
| `E_INVALID_ENGINE_PLAN` | `terminal_for_site` | 下载计划生成失败 | 更新到最新版；保留链接和完整提示反馈 |
| `E_NO_ENGINE_SUCCEEDED` | `terminal_for_site` | 已尝试的下载方式都失败 | 检查登录态/代理/链接/质量，保留完整错误反馈 |
| `E_OUTPUT_NOT_FOUND` | `fallback_to_other_engine` | 下载器结束但没有报告最终文件 | 打开输出目录检查中间文件；重复出现时反馈完整错误 |

### Upstream Download Diagnostics

| Pattern | Likely user meaning | Suggested localized guidance |
| --- | --- | --- |
| `Download cancelled` / `canceled` | 用户或系统取消了任务 | 显示“下载已取消”，不要作为失败错误码展示 |
| `ERROR: [BiliBili] ... Unable to download JSON metadata: HTTP Error 412 Precondition Failed` | BiliBili 拒绝了元数据请求；常见方向是登录态/Cookie、站点风控、请求头/下载器规则变化或链接状态 | 浏览器确认页面可播放；通过扩展重新发送并刷新 BiliBili 登录态；更新 yt-dlp/Ameow；仍失败时反馈完整原文 |
| `HTTP Error 403` / `Forbidden` | 站点拒绝访问，常见于登录态、地区限制、代理或规则变化 | 登录后从扩展发送，检查代理/地区，换公开链接测试 |
| `HTTP Error 404` / `Private video` / `video unavailable` / `not available in your country` | 内容不可访问、私密、下架或地区不可用 | 浏览器确认可访问；无法访问时不是 Ameow 可修复问题 |
| `HTTP Error 416: Requested Range Not Satisfiable` | 续传状态或临时文件范围不匹配 | 现有逻辑已有一次清理/重试方向；失败时清理残留并重试 |
| `429` / `too many requests` / `rate limit` | 访问过于频繁，被站点限流 | 等待一段时间，减少重复重试，必要时刷新登录态 |
| `timeout` / `timed out` / `fetch failed` / `ECONNRESET` / `ENOTFOUND` / `EAI_AGAIN` | 网络或 DNS/代理链路失败 | 检查网络和代理接管方式；公开视频交叉测试 |
| `Requested format is not available` | 所选画质/格式不可用或站点返回格式变化 | 换较低质量或手动画质；更新 yt-dlp/Ameow |
| `No video formats found` | 下载器未解析到可下载媒体，可能是站点规则变化或不支持该媒体 | 更新 yt-dlp/Ameow；保留链接和完整错误反馈 |
| `Sign in to confirm you're not a bot` | YouTube/站点触发登录或反机器人校验 | 浏览器登录后通过扩展发送；检查代理一致性 |
| `Fresh cookies ... needed` | 站点需要新的 Cookie | 在浏览器重新登录并同步站点登录态 |
| `ffmpeg exited with code ...` / `Conversion failed` | 后处理、合并或转码失败 | 换质量/格式重试；保留源链接和完整错误反馈 |
| `gallery-dl exited with code ...` | gallery-dl 执行失败，后半段才是具体原因 | 提取后半段 HTTP/登录/网络原因显示给用户 |
| `produced no final output path` / `finished without producing an output file` | 下载器未产出最终文件 | 检查输出目录权限/残留文件；重复时反馈完整错误 |

## Out of Scope

- V1 不在本任务内保证修复 BiliBili 412 的上游根因；先让文档能解释、引导和收集足够诊断信息。
- V1 不改变桌面端 full 窗口错误展示。
- V1 不新增复制错误详情按钮或错误详情弹层。
- V1 不扩展 `DownloadResultPayload` 或 runtime/frontend 错误结构。
- 不引入在线错误码查询服务。
- 不改变下载器核心策略。

## Acceptance Criteria

- [ ] 桌面端 full 窗口错误展示保持现状，不改变用户可反馈的原始错误文本。
- [ ] 中文 public docs 的错误说明页补齐 BiliBili 412 和主要上游错误族。
- [ ] 英文 public docs 的错误说明页补齐同等内容。
- [ ] 文档包含用户可搜索的原始关键词：`ERROR: [BiliBili]`、`Unable to download JSON metadata`、`HTTP Error 412`、`Precondition Failed`。
- [ ] 文档对 BiliBili 412 说明：通常是元数据请求被站点拒绝，可能与登录态/Cookie、风控、链接状态或下载器规则变化有关；建议浏览器确认可播放、通过扩展重发/刷新登录态、更新 yt-dlp/Ameow，并反馈完整原文。
- [ ] 文档覆盖内部 `E_*` code 与上游 `ERROR:`/HTTP/ffmpeg/gallery-dl 诊断的区别。
- [ ] `npm run docs:build` 通过。

## Open Question

- Later phase 中，原始技术详情应该如何在 UI 中暴露？
  - 推荐：主文案显示本地化摘要，旁边或下方提供“详细信息/复制错误详情”，保留完整原文。
  - 如果完全隐藏原文，界面更干净，但用户反馈会缺少诊断信息。
  - 如果继续直接显示原文，支持排查方便，但用户仍然无法理解第一眼看到的问题。
  - 进一步澄清：需要复制详情能力，但不推荐把普通文字按钮放进当前 1.5 秒消失的 full 窗口中心 overlay。更稳妥的 V1 是中心 overlay 只显示短摘要，稳定的失败详情区域或任务行提供小图标复制按钮；如果复制按钮必须放在中心 overlay，则需要延长失败态展示时间并保证按钮可点击。

## Notes

- V1 can be implemented as docs-only after planning approval.
- The existing `design.md` and `implement.md` keep the later UI-localization design for future reuse, but V1 should follow the docs-first scope above.
