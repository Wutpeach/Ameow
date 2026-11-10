# C3：内嵌第三方许可与 About 阅读入口

> 历史阶段记录。文中的 Gate A/B 审批和旧打包参数已于 2026-11-10 撤销；执行命令请使用[当前发行步骤](first-rust-release.md)。

本阶段在 #33 C3 的限定授权内实现逐版本 notice 交付。公开 Gate B 仍为 blocked，
生产公钥仍为空；本文件不构成法律、发行或生产密钥操作授权。

## 来源与构建

根目录 THIRD_PARTY_NOTICES.md 是唯一的声明编排来源。GitHub 阅读时可沿其中的相对
链接查看同一 source revision 的完整材料。构建只从本地已入库存的材料解析 include
指令，不联网、不扫描或下载新许可证、不复制一套重复正文。版权及条款继续复用 C2
核对过的文件，Windows normal/build 的 Rust 依赖映射由现有 inventory 提取为简明归属
列表，原始来源 JSON 和审计记录不整体塞入 EXE。

build_support/notices.rs 以 distribution/license-inputs.json 中的 raw SHA-256 核对编排
文件、七份全文和 Rust package inventory。缺失、损坏、空白、非法 UTF-8、缺少必需
章节、重复/越界 include 等情况令构建失败，不生成空白替代文本。修改材料时应先审查
来源和内容，再更新对应 hash；构建通过不等于许可审查通过。

两项格式转换仅用于阅读，原始材料及其库存锚点不改：

- 固定 AOM Patent License 正文的 Windows-1252 0x93/0x94 引号转为对应 Unicode 引号；
  只处理明确 SHA256 锚定的正文，其他未知编码报错，不以替代字符吞掉内容。
- Rust 1.93.0 COPYRIGHT-library.html 的 body 提取为文本，解码字符引用并保留外部链接；
  仅支持该已核对格式，未知标签/实体失败。原始 HTML 在仓库及首次包中继续保留。

构建输出 OUT_DIR/third_party_notices.txt 经 include_str! 编入应用。显示和复制均直接
读取当前 EXE 的同一静态文本，不访问安装目录、远端 GitHub 或用户缓存。版本号来自正常
Cargo 构建；已有 debug fixture 的测试版本仅在显式 fixture 构建中使用。

未捆绑的 yt-dlp / FFmpeg / Deno / gallery-dl 只说明各自独立取得和待审查边界，
不将开发期来源材料整份复制为 EXE 的随附许可，也不宣称运行时义务已经满足。

## 原生界面

设置 → 关于的「第三方许可」文本入口打开 About 内的临时阅读态，不增加设置导航页。
复用当前主题、语言、按钮及焦点约定。长文由 GPUI 原有虚拟列表按可见行呈现，行内
自动换行，支持滚轮、上下键、Page Up/Down、Home/End；可复制全文。返回或 Esc 恢复
到 About 的入口焦点，Enter 可再次打开。中英文标题和浅深主题沿用现有体系，许可
原文保持原语言。预览目录新增 settings.about 与 settings.third-party-licenses。

## 发行边界

现行 Launcher、版本目录、单 EXE ZIP、Ed25519 schema、URL/哈希/版本验证、Ready、
安全退出、previous 备份与回滚协议均未更改。新 notice 源已纳入受控打包的源码哈希
清单和精确文本白名单；首次便携包继续保留原有 LICENSE/notice 文件，并附编排源。
历史 private review 不会自动覆盖新库存输入，仍须重新进行实际 review。

后续单 EXE 更新会携带该 EXE 编译时的声明；用户无需同步根目录 notice。此项修复
工程交付缺口，不自动证明内容的法律完备性：四个 crate 全文来源、三枚旧图标 tag、
品牌权属、MSVC 条款和按需工具/对应源码义务仍待 owner 补证或正式评估。

首版密钥政策承接 C3：一套正式 Ed25519 主密钥，离线加密备份，失钥经可信渠道手工
恢复。本轮不生成或启用密钥；C2 文档中 App、Launcher、release 工具分别嵌入信任根，
单 EXE 更新不能轮换旧 Launcher 等限制继续有效。

## 定向复验

选择新的 task-owned target/output，保留历史构建。对应命令：

    cargo test --locked --offline --test third_party_notices --target-dir <task-target>
    cargo test --locked --offline --bin ameow settings_window::tests --target-dir <task-target>
    cargo test --locked --offline --bin ameow preview::tests --target-dir <task-target>
    cargo test --locked --offline --lib app_update::release::tests --target-dir <task-target>
    ./scripts/package_portable.ps1 -BuildOnly -ReleasePreparation -TargetDirectory <task-target> -OutputDirectory <new-output>

本轮实际证据在 evidence/issue33-stage-c3-20261109/。Release 构建及单成员 ZIP 在
D:/Ameow-c3-build-20261109-03/；其编译输入库存绑定当前源码，未冒称以新 Commit 构建。
native-versions/ 保存两份不同 notice 的 0.2.0/0.2.1 隔离调试身份、实际 Launcher
切换日志、A/B 的复制全文与编译字节对照，以及 unchanged stale-file 负对照。
native-release/ 保存普通非 fixture release EXE 的真实 About/阅读/复制与权限证据。

此处「普通非 fixture」只描述构建配置；开发桌面的实际进程为 elevated High，
不代表干净标准用户或 Medium Shell 验收。真实普通 Medium Shell、远端 CI、干净
普通用户首启、生产签名 HTTPS 仍为 PENDING；不重复已接受且未受影响的 A/B/C1/C2
完整测试。没有生产私钥操作、信任根变更或公开发行。
