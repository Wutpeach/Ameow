# Design

## Context

动机与授权见 proposal。resolve 与 transfer 独立选流，单凭 resolve 协议不能隔离本次 HLS；固定 yt-dlp 2026.10.26 的 before_dl 原生 PP 位于实际选流后、FFmpegFD 启动前，且支持每轨 downloader_options.ffmpeg_args。

## Goals / Non-Goals

目标是有限 HTTP 请求及严格实际选流门控，不更改候选排序/格式可用性。普通整片、精确、非 YouTube、HLS 等保持原参数；未知/冲突仅不应用优化。非目标为通用插件框架、新下载器、网络转发、元数据回放及本轮公网测速矩阵。

## Decisions

- 参数仅 request_size=8388608；现有同路线短/长样本支持其收益，short_seek_size 没有必要，8 MiB 较 1 MiB 少连接。
- 源由 include_bytes 嵌入应用，在 attempt 自有目录逐级 create_dir、create_new 写入；不复用已有目录/源码。Windows 持有仅允许读共享的源句柄直到真实进程结算，防止执行期间替换/写入。
- 保留 --no-plugin-dirs，仅追加此固定目录和明确 PP 名；注册/加载错误由下载器真实失败呈现。没有环境插件或 Python/PATH 依赖。
- Rust 仅在 fast + resolve 为 YouTube 时装载；该预测只减少无关装载。PP 再核当次 Youtube 单作品点播、section、非 force-keyframes、所有实际输入 protocol=https 且 URL scheme=https，无 manifest/fragments/显式 Range；全部通过才原子追加每轨选项，保留根回退/原参数。
- 固定状态枚举仅证明处理器声明运行，不承担产物成功权威；成品、资源、认证与路由继续原链。

## Risks / Trade-offs

- 有限请求增加连接/预读 → 只在批准路径应用，不承诺倍率或省带宽。
- 引入原生执行代码 → 编译固定字节、独占新目录、隔离装载；不扩大环境插件信任。只验证当前受管版本，后续 runtime 更新继续需要其兼容核对。
- macOS 原生插件加载未实测 → 明确保留平台限制，不以 Windows 结果外推；API 与受管 Python zipapp 接口保持现行路径。
- 旧预卷边界已由 71f7f8a2 独立修正 → 本变更不再次改时长窗或以旧失败阻断优化。

## Migration Plan

仅 main 定向提交与根 debug 增量构建，本人重启复测；回退可精确撤销本提交。无数据迁移、组件安装、Tag/Release 或专用验收包。
