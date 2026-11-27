# Proposal

## Why

0.5.3 的真实 Mac Transfer 取消在观察到 fork 后直接 SIGKILL，失去受控正常结束证明，任务持续 Held，无法正常退出。需要在保留所有权屏障的前提下，让受管传输完成可验证的取消收尾，再交最终发行审阅。

## What Changes

- 为绑定实际调用及受信运行时租约的 Mac yt-dlp Transfer 增加一次有界的协作取消机会。
- 增加独立于成功媒体记录的取消结算证明，涵盖实际子进程 wait、Python 工作线程停止和本次调用身份；部分输出只留在自有工作区，不能作为成功交付。
- 保留连续观察、未 reap 根时组内仅剩该根、正常退出与 wait 一致、全部 join 及文件清理屏障；超时、未知后代或证明不足仍 Held。
- 用旧失败前驱、针对性正负例和真实 Transfer 取消→资源释放→正常 quit 验证修复，再收敛新源码、候选与最终 CI。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `process-ownership`：扩展 Mac 受控调用的取消完成资格，明确独立取消证明及其边界，保留 Resolve、通用进程和全局结算规则。

## Impact

Mac yt-dlp Adapter 调用、取消收尾驱动和进程监督器的合同检查；相关 Python/Rust 定向测试及 Mac 原生流程。沿用受管 Python、yt-dlp、FFmpeg、Deno 的既有可信身份，不升级组件、不增加外部依赖、不修改 UI。Windows 产品行为不变，需构建/定向兼容检查。23c4ca22 候选、签名序号 10/11 和全部失败证据保留；新候选另行输出。公开发行与站点部署仍等待用户对具体候选及完整发行稿的最终授权。
