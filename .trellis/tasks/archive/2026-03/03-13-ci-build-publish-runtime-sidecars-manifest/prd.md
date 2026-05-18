# implement: CI build and publish runtime sidecars manifest

## Goal

建立独立 CI 流程，自动构建并发布 FlowSelect 自有运行时 sidecar（优先 `pinterest-dl`），同时产出可供客户端自动更新使用的 `manifest`（含版本与校验信息）。

## Background

* `pinterest-dl` 上游不提供可直接分发的官方 exe。
* 当前仓库通过 `scripts/build-pinterest-sidecar.mjs` 本地构建 sidecar，并手动随主版本发布。
* 体积优化方案已确认：主安装包将逐步移除 `pinterest-dl` 内置，改为运行时自动补齐。

## Requirements

* CI 能按目标平台构建 FlowSelect sidecar（最少覆盖当前已支持的发布目标）。
* CI 发布 sidecar 二进制时，必须同时产出 `manifest.json`。
* `manifest.json` 至少包含：
  * `component`（如 `pinterest-dl`）
  * `flowselectSidecarVersion`
  * `upstreamVersion`
  * `target`
  * `url`
  * `sha256`
  * `size`
  * `publishedAt`
  * `minAppVersion`（可选但建议）
* 版本来源以 `src-tauri/pinterest-sidecar/lock.json` 为真值（`flowselectSidecarVersion` + `upstream.version`）。
* 构建产物和 manifest 需要在发布流程中可访问（release assets 或固定托管地址）。
* 失败策略：任一目标构建失败或 checksum 不匹配应 fail-fast。

## Acceptance Criteria

* [ ] CI job 可稳定构建并上传 `pinterest-dl` sidecar 产物。
* [ ] CI 产出的 manifest 可被机器读取并通过 schema 校验。
* [ ] Manifest 中每个资产的 `sha256` 与实际文件一致。
* [ ] 发布后可通过固定 URL 拉取最新 manifest。
* [ ] 文档说明了 sidecar 发布与回滚流程。

## Out of Scope

* 客户端下载器状态机与 UI（由体积优化主 task 负责）。
* `yt-dlp/ffmpeg/deno` 的下载策略改造（后续可复用本 task 产物规范）。
* 运行时签名体系完整建设（可在后续任务追加）。

## Technical Notes

* Related files:
  * `scripts/build-pinterest-sidecar.mjs`
  * `scripts/check-pinterest-sidecar-upstream.mjs`
  * `src-tauri/pinterest-sidecar/lock.json`
  * `.github/workflows/release.yml`
  * `.github/workflows/publish-runtime-sidecars.yml`（新增）
* Deliverables:
  * `manifest` schema 定义文件（建议放在 `docs/` 或 `scripts/`）
  * CI 构建与发布 job
  * 发布流程文档（README/release notes template 更新）

## Code-Spec Depth (Pre-Implementation Contract)

### Target Specs / Contracts To Update

* `.trellis/spec/backend/pinterest-sidecar-maintenance-contracts.md`
* `docs/runtime-sidecars/manifest.schema.json`（新增）
* `docs/runtime-sidecars/publish-and-rollback.md`（新增）

### Concrete Contract

* 版本真值来源：`src-tauri/pinterest-sidecar/lock.json`
  * `flowselectSidecarVersion`
  * `upstream.version`
* 产物目标（当前支持平台）：
  * `x86_64-pc-windows-msvc`
  * `x86_64-apple-darwin`
  * `aarch64-apple-darwin`
* Manifest 每条资产必须包含字段：
  * `component`
  * `flowselectSidecarVersion`
  * `upstreamVersion`
  * `target`
  * `url`
  * `sha256`
  * `size`
  * `publishedAt`
  * `minAppVersion`（可选）

### Validation / Error Matrix

* 任一 target 构建失败 -> CI fail-fast，停止发布。
* 任一 target smoke 失败 -> CI fail-fast，停止发布。
* Manifest schema 校验失败 -> CI 失败，拒绝发布。
* 资产 `sha256` 与计算值不一致 -> CI 失败，拒绝发布。
* `lock.json` 缺失版本字段 -> CI 失败，拒绝发布。

### Good / Base / Bad Cases

* Good: 三个平台 sidecar 都构建 + smoke 通过，发布成功，`releases/latest/download/runtime-sidecars-manifest.json` 可拉取并通过 schema 校验。
* Base: 仅更新 lock 版本并触发发布，Manifest 中版本字段与 lock 一致。
* Bad: 某一 target checksum 不匹配仍继续发布（必须阻断）。
