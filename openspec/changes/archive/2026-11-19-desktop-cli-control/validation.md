# 验证记录

本记录区分历史基线、本轮入口验证、真实用户操作及尚未覆盖范围；不代表已经发行 0.5.1。Cargo/握手版本仍为 0.5.0，未修改已发行 Tag、包、feed 或签发材料。

## 源码与产物身份

- 原实现链为 7d3bb8ef → af182d5a → a3547811 → c75c83ac。原 Windows 100 项、Mac a354 的 19 项及 c75 的 3 项定向结果保留原身份，没有换标为本轮通过。
- 本轮正常合入 main cfc6ad60，合并提交 330e6472；PR58 的 Mac Full 粘贴焦点与连续画质选择修复、README/手册保持。新增运行时代码提交为 2565857d3cab1230d5f81e508c0ade2f1de1dc58 / tree 7524b53319f0030387ddb685c1c395af8397a572。
- Windows 测试安装布局与 Mac 私有应用包均由准确 2565857d 构建。后续 1f5d5993、d54641ec 仅增加测试、正式规范与测试临时路径修正，没有重打体验包。
- Mac 包内 ameow SHA-256 为 c2851ea28c724287e0fdda79af383f2547298a31356fd6547c0080d86065705f；CLI 为 b7530b5cd56dd42ae0257c98aacd8bf532b99c0c9a38afb1db0137c654493ada；updater 为 0c97da42ab6477f6b3a8a75471056d7e72d88d3e3315fe0bebcfc808f0d38276。均为 arm64、minos13.0、私有 ad-hoc 签名；实际系统 macOS26.3。

## Windows 本轮定向结果

- 复用本树唯一 target 重建；locked/offline 的 app、CLI、Launcher、release tool 和 release_fixture 构建成功。
- 新签名/入口替换回归 1 passed；control 模块 20 passed；PR58 画质菜单定向 1 passed。普通 Launcher 在取得安装租约前拒绝隔离入口、普通 CLI 拒绝包内隔离自动启动，各 1 passed。Held 不被 wait 当作终态的既有回归补充断言后 1 passed。
- 使用公共 RFC 测试密钥生成并核验带 CLI 的实际 portable fixture，CLI 从包内自动寻找相邻稳定 Launcher，未传 --app。两个并发提交只产生一个真实桌面 owner，Launcher 审计记录 spawned/ready，持久 current 已确认且 trial/pending 清空；两任务与 CLI 列表的实例/任务 ID 一致。
- 两项显式取消后 wait 均退出 5，resources_released=true；默认仍 Balanced 与隔离输出目录，未产生 settings.json。对确切自有原生窗口发送 WM_CLOSE 后，Launcher 记录 exited，CLI 再读为 E_NOT_RUNNING。
- 本轮没有执行安装器向导或写注册表；不将私有 RFC fixture 当作正式签发安装器。没有读取生产私钥或操作日常实例。

## Mac 包内入口与工程结果

- 沿原 macos-cli-stage1-45 私有树和唯一 target/validation-build，构建 app/CLI/updater 成功。package_macos.sh 实际生成唯一私有 Ameow.app，核三 bin 架构/最低版本及 codesign --verify --deep --strict。
- 从包内 CLI、不传 --app 并发提交两项，得到同一实例与不同任务 ID，只有一个普通桌面 owner；两项显式取消后 wait 均为 Cancelled/资源已释放。默认与既有隔离数据域一致，settings.json 未产生；程序化 AppKit 退出后无本域参与者。此项不代表用户菜单正常退出。
- 本轮 Mac 四个定向工程检查各 1 passed：fixture 签名/入口字节、普通 CLI 隔离拒绝、PR58 画质菜单、PR58 焦点模式。新 fixture 回归最初因 macOS /var 符号链接被安全检查拒绝；仅将测试临时根改为物理路径后通过，保留失败前驱，未放宽产品路径检查。
- 本地媒体预检使用任务原有真实交付文件、既有 debug fixture 路由和正式下载队列；真实失败、CLI 重试/取消与父进程 wait0 通过。预检没有执行 GUI 手势，也没有重跑公网成功矩阵。

## 首次用户手势与脚本缺陷

2026-11-19，用户要求打开隔离入口。启动前核无日常/本域 Ameow、会话未报告锁屏；SSH 的辅助功能、事件发送和屏幕捕获权限仍为 false，未改 TCC 或触碰剪贴板。Terminal 与测试猫的 onscreen/PID/bounds 来自窗口 metadata，没有手势截图。

- 确切首次测试 owner PID859、窗口3755；instance a4d653c200a93a981866cf0d2d21aded。原脚本 SHA-256 为 676d7322eb32b07303260d40770113c306c3f880c5501fa7c005c1f83ce7c59c。用户确认终端只显示取消第 1 项，执行后没有出现后续提示。
- GUI 在 elapsed87787ms 对 job1 发出 cancel，coordinator 返回 applied=true。该同任务随后为 Held、slot_owned=true、resources_released=false；原脚本却只等待 Cancelled/released，未处理 Held，故停在第 1 步，没有执行 GUI Retry 或第 3 项 Submit。CLI 的状态映射直接保留原队列字段；旧轮询为 quiet list，未保存逐次原 JSON，不能补造退出后的旧 show/wait 回执。
- 原生记录在 122752ms 收到 source=main-menu 的退出意图和 Stop；最后仍为 stopping=true/stopped=false。脚本等待超时后的 finally 调用 AppKit terminate，父进程最终 exit0，不能作为安全 stopped 或三组完成证明。之后无本域进程、socket 拒绝、owner.lock 可独占，只证明进程已结束，不据此推断泄漏或权威结算。
- macOS 现有监督规则对观察过 fork 后不能证明后代结算的取消保留 Held；未为本任务放宽守卫。首次摘要没有持久化完整 supervisor Held 原因，不能把推断当作该次唯一已证原因。

## 最小补验

首次脚本和失败回执保持原字节。修正入口只补尚未出现的 GUI Retry、GUI Submit→CLI Retry、自然终态与用户菜单退出。它区分取消受理和资源结算，遇 Held 立即记录完整 list/diagnose 并明确提示；异常不再自动 AppKit 退出。四个纯取消状态检查及 shell 语法检查通过，未为修脚本重新打包。

补验使用新的 instance ccf558cce821d1f08539c1da7547dd43，owner PID3782、窗口3760；仍为原 256 包。用户在来源主会话明确反馈“终端明确显示完成，已从猫菜单退出”，对应本次后两项体验。GUI 操作来自用户；以下 CLI/原生/文件核对由本任务独立执行，不把反馈当作自动手势记录。

- 预置任务 1 真实 Failure 后，原生记录 GUI Retry(1) 受理任务 2；CLI 读取同一实例，任务 2 自然 Success、资源结算。
- 原生 GUI Submit 受理任务 3，CLI 读取该同任务及真实 Failure；CLI Retry(3) 受理任务 4，自然 Success。两对重试的冻结 intent 完全相同；原生 presentation 的 visible_rows 反映原失败行退役、新任务显示。
- 两个真实交付文件均为 787619 字节；任务 2 的 SHA-256 为 3abc9a602c9b042ad87d6f56d41103689b72f88bf2696656132faf77488670a8，任务 4 为 2e9466c534b4b52df7ef54cd18126f8c4a9a600559739cfee25a94db7dbe251d。实际路径、大小和 hash 经本任务再次回读，均匹配 owner files；这是本地受控媒体交付，不是重跑公网矩阵。
- 用户菜单退出在原生记录中为 source=main-menu；171406ms 时 stopped=true、unfinished=0、active_slots=0、preparing=false，四任务均 resources_released=true/slot_owned=false。脚本实际 parent wait0、remaining_checks_pass=true，没有 AppKit cleanup 调用。
- 用户先菜单退出后，脚本一度停在额外的终端回车确认；本任务如实识别为已退出孩子等待回收，没有重开或代按。确认回车到达后，原父 wait0 和最终完成记录均齐全。
- 最终 PID3782 及本域下载/媒体 helper 均不存在，socket 拒绝连接、owner.lock 可独占；UID501、目录0700/socket0600，settings.json 仍未生成。保留陈旧 socket 文件与旧 Held 工作区，不删除它们或把文件存在当作活动实例。

两次会话和 ID 分开保存：补验的正常 stopped/父退出不覆盖首次取消→Held，也不将旧脚本 AppKit terminate 换标为正常退出。首次 GUI 取消正确进入同队列的事实已证，实际活动调用取消后的 Mac Held 守卫仍是明确边界。

## 证据与范围

Windows 本轮小回执位于本树 ignored evidence/cli-resume-20261119；Mac 位于原私有树 evidence/resume-20261119，保留构建、package、test、preflight、manual 与 remaining 原始回执。历史跨端证据入口及旧 REPORT 未改写。

未覆盖：干净非管理员安装器向导、正式签发/安装包更新替换全链、跨 UID 账号攻击、实际 macOS13 运行、真实公网 Partial。Partial/分页/退出状态沿用既有定向 fixture 证据。每会话 1024 写回执上限、Windows CLI 随完整包而非单 EXE 自更新的限制保持。第二阶段 #46 未开始。
