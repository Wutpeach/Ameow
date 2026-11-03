# Ameow #17 / T04 补充 Report：离线可信恢复与最终 UI 验收

2026-11-03 · https://github.com/Wutpeach/Ameow/issues/17

**最后两项改进已完成。** 已验证且缓存完好的用户选择版本可离线重启；最终 Preparing 修正版的推荐缓存恢复流程由用户亲自操作，并明确回复「验收通过」。原始证据与后台记录相符。此报告替代[首次 Report](https://github.com/Wutpeach/Ameow/issues/17#issuecomment-6594411167)中的重启必联网限制及最终 UI 待验收项，不扩大为未测试场景的通过。

## 本地信任机制与边界

采用官方 `SHA2-256SUMS.sig` 对原始摘要文件的签名，应用内固定审核过的 yt-dlp RSA-4096 公钥；每次启动重新验证 OpenPGP v4 binary-document / RSA / SHA-512 签名，再从签名覆盖的摘要中严格提取唯一 `yt-dlp.exe` SHA-256，重算实际 EXE 哈希，并执行原有受监督的精确版本探测。保留 Runtime 的 immutable 目录、全部组件校验、只读共享文件 guard、lease、进程结算及 Dispatcher 激活门。可写 JSON 和证明文件的版本名均不充当信任根。

密码学验证使用 `ring = 0.17.14`（依赖树原已存在，本轮显式声明直接依赖）。窄解析器有界检查 packet、子包、MPI、算法、截断和尾随；未知格式、未知子包、critical/expiry、额外 packet 和不匹配的指纹均拒绝，不自行实现 RSA。

固定公钥来源：

- 官方 README：`https://github.com/yt-dlp/yt-dlp/blob/b77c9304e1c4220cca450c583491904daf8455af/README.md`。
- 官方 key：`https://raw.githubusercontent.com/yt-dlp/yt-dlp/b77c9304e1c4220cca450c583491904daf8455af/public.key`，仓库保留原字节为 `ameow-next/assets/yt-dlp-release-public.asc`。
- 公钥文件 SHA-256：`45D6B415928B5F3E228B461FA9E6D7EB56A824931C785ECE00279A06C7A6D6E5`。
- 公钥指纹：`AC0CBBE6848D6A873464AF4E57CF65933B5A7581`。
- Lead 另行从原始 key 解出 RSA modulus / e=65537，核对与编译材料一致，记录 `key-source-validation.json`。该 pin 来自官方仓库的固定版本核对，未声称另有带外身份背书。

缓存保存原始清单和签名的有界 binary proof，并在完整运行时通过校验和探测后原子持久。健康证明直接本地验签，不发起摘要请求。旧缓存没有 proof 时，只在线补摘要和签名，不重新下载健康 EXE。证明损坏立即失败，不自动网络覆盖证明；重启/恢复没有当前 verified lease 时，不重新下载损坏或缺失的 EXE/依赖，不静默改为推荐版本。错误保留选择并进入 `RecoveryRequired`。明确的新升级仍可在保留当前 lease 时取得候选。

签名清单没有直接覆盖版本标签，所以还需精确执行版本探测；改名 proof 或修改 JSON 版本字符串无法绕过此检查。

## 定向测试与真实 Windows 验证

复用工作树 `D:/Ameow-worktrees/tra26-r7-stage-b`；HEAD 仍为 `cb24c15888b3e8467e834fd89549017419931709`，全部实现未提交。没有重跑上一轮整套升级或无关矩阵。

本轮实际定向测试 **58 passed、0 failed、2 ignored**：

| 范围 | 结果 | 日志 |
| --- | --- | --- |
| 真实签名及篡改/截断/算法/子包拒绝 | 2 passed | `tests-offline-signature.log` |
| proof 缓存离线无 fetch、篡改拒绝、legacy 仅 metadata、未验证前不发布证明 | 6 passed | `tests-offline-trust.log` |
| Runtime requirements、缓存/guard、精确版本、恢复缺依赖不下载 | 7 passed | `tests-offline-runtime.log` |
| 持久选择与安全错误投影 | 4 passed | `tests-offline-selection.log` |
| queue 激活/停止/等待/选择恢复 | 30 passed、2 ignored | `tests-offline-queue.log` |
| 组件 UI 新鲜查询/Preparing/busy/版本投影 | 7 passed | `tests-offline-ui.log` |
| 通用下载边界 | 2 passed | `tests-offline-boundary.log` |

`cargo build --manifest-path ameow-next/Cargo.toml --bin ameow-next --example runtime_update` 通过（`build-offline.log`）；`git -c core.whitespace=cr-at-eol diff --check -- ameow-next` 通过。上述 2 ignored 为需真实缓存的原有队列测试，上一轮已显式实测，本轮未重复。独立只读审查源码 GO；审查者未自行跑测试或核对 modulus，Lead 的实际日志和独立 key 解码记录另列。

全部证据根：`D:/Ameow-artifacts/t04-20261103`；本轮真实记录位于其 `offline-acceptance/` 子目录。使用前轮已验证 EXE/依赖的独立副本，不修改日用运行时、不重复获取新 EXE。

| 真实场景 | 结果及证据（相对 offline-acceptance） |
| --- | --- |
| legacy 缓存补签名 | `bootstrap-signed-proof.jsonl`：重新认证和探测后 Activated `2026.10.26/user_selected`，保存 proof；无组件下载 |
| 离线约束有效 | Windows WFP 动态会话对两个验收 EXE 的准确应用路径分别阻断 IPv4/IPv6 出站；`network-guard.jsonl` 保存 filter IDs。`network-denied-query.jsonl` 中真实查询 `Err(Connect)`，没有改全局网络或 Firewall Profile |
| 离线重启成功 | 同一被阻断的真实 Coordinator 在 `restart-offline.jsonl` 中完成 Activated `2026.10.26/user_selected`、随后 stopped；无需网络摘要请求 |
| 修改签名覆盖的摘要字节 | `tampered-proof.jsonl`：`E_UPDATE_SIGNATURE`、RecoveryRequired、active_version=null、退出码1，原选择保留 |
| 修改实际 EXE 字节 | `tampered-engine.jsonl`：`E_UPDATE_CACHE`、RecoveryRequired、active_version=null、退出码1；未执行损坏 EXE、不下载 |
| 将真实 proof 标成另一版本 | `wrong-version-label.jsonl`：哈希认证通过仍不能通过精确版本探测，`E_UPDATE_PREPARATION`、RecoveryRequired、active_version=null、退出码1；不发布伪造版本 |

故障注入只操作独立副本，脚本 finally 恢复原始 proof、EXE 及选择；`negative-results.json` 保留汇总。临时网络 guard 已释放，日志末尾为 `offline_guard_released`，动态过滤器随会话关闭清除，无持久规则。

## 最终 UI 人工验收

用户要求亲自操作后，Agent 停止鼠标键盘输入、释放临时网络约束，保留最新开发程序。用户执行「组件与诊断 → 恢复 Ameow 推荐版本 → 确认」，并明确回复 **「验收通过」**。

`gpui-offline-restore.jsonl` 中对应记录（elapsed_ms）：

```text
12128   Activated  user_selected  active=2026.10.26
107416  command=restore-recommended
107416  Preparing  user_selected  active=2026.10.26
112358  Verifying  user_selected  active=2026.10.26
119000  Waiting    user_selected  active=2026.10.26
119095  Activated  follow_ameow   active=2026.08.19
126799  command=stop
```

本次没有 Downloading 状态或 Acquire 事件；全部记录只有本地准备/探测及发布。持久选择最终 `policy=follow_ameow`，版本 `2026.08.19` 已实际验证。`manual-ui-receipt.json` 保存该记录摘要与人工验收文字。人工界面观察由用户确认，Agent 通过 telemetry 交叉核对，没有把早前旧版截图当作本次最终 UI 证据。

最终验收二进制：

```text
ameow-next-t04-offline.exe
C959C295A58DA4902CAD39B0EC49F9CE0E64C9C14F2CEB00404E79D494966839
runtime-update-offline.exe
8AD0B0B87052ADBBBD960AF0AD0F61EE07BBEA37302E4F60D2960432B25241BC
```

`source-identity.json`、`source.patch`、`source-new/` 保留这次未提交源码及新文件的可核对证据。本轮修改集中于签名验证、可信 proof、恢复 acquisition 门及对应 UI 说明，未涉及 #15 托盘视觉。

## 继续保留的限制与停止点

- 离线无法获知签名密钥之后的撤销，也不能单独阻止恢复本机更旧但真实签名的选择记录。未知签名格式或密钥轮换会安全失败；固定 pin 只能通过受信任的 Ameow 应用更新调整。
- 没有 proof 的旧缓存首次仍需在线补签名材料；缓存/证明损坏不保证离线自动修复，用户可显式重试或恢复健康推荐版。
- 本轮未追加真实断电/强制崩溃、两份不同内嵌基线应用、真实公网媒体下载并发升级或新增公网媒体成功下载实验；首次报告相关未覆盖项继续有效。
- 两项定向目标已完成且用户确认 UI 通过；不据此自动关闭 Issue 或宣称上述未测场景通过。

补充 Report 回写 #17 后停止。没有 commit、push、merge、发布或关闭 Issue；保留全部原始证据及已验证版本。
