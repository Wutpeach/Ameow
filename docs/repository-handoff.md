# Rust 正式主线整理与恢复

授权：[GitHub #18](https://github.com/Wutpeach/Ameow/issues/18)。候选分支 `takeover/rust-official-18` 从干净 Rust 基线 `7f8d3b36` 开始。开工远端 `main=e97a5c84` 是该基线祖先，相差 50 个提交；复用其已有产品成果，不重复合并 #14。最终验收前不合并 main、不改写远程历史、不公开发布、不删除历史分支或工作树。

## 当前结构

`Cargo.toml`、`Cargo.lock`、`build.rs`、`src/`、`tests/`、`examples/`、`assets/`、`distribution/` 和保留的原生 `scripts/` 直接位于根目录。`site/` 独立管理 Node 依赖与构建；根目录没有 Electron、React、Vite 或 Node 应用构建。

Rust 工程从 `ameow-next/` 原位提升；应用依赖版本和功能基线保留。包名/bin 为 `ameow`，内部库名保留 `ameow_next`，交付 EXE 为 `Ameow.exe`。Windows 标题、诊断和 PE 版本信息使用 Ameow，版本仍为 Cargo 实际值 `0.1.0`，没有创造公开发行版本。

## 身份兼容

保留 `%LOCALAPPDATA%\AmeowNext\stage-a`、其中的设置/运行时选择/历史/缓存，以及现有 Run 值和 mutex/event。更名不执行目录搬迁、数据清理、旧 Electron 配置导入或自动注册启动项。

更名或移动 EXE 后，旧完整路径的自启动项会显示旧位置，需要在新版设置中重新开启并核对状态；原有 Windows 禁用状态继续生效。旧快捷方式/任务栏固定项需要手动重建。没有新增安装器、AppUserModelID 或外部快捷方式迁移机制；实际登录启动及 Windows 默认任务栏分组不从单元测试推断。

## 保全对象与恢复边界

- Rust 完整整理前基线：`7f8d3b36`。历史 Research、Electron 工程和原始相对引用可从此提交读取，它也是候选分支祖先。
- 冻结 Electron 独有已提交历史：本地 `main@d657f555`；runner 8 项独立技术成果：`preservation/tra27-r8-electron-runner@14819d1d`。不移植至 Rust。
- 扩展 P1：`Wutpeach/Browser-extension-refactoring@f7f11987`；未验收的 P2-A0 源码/测试及媒体证据单独保全，不接入 Rust。未来网页选择研究属于 #22。
- 旧 Electron / 扩展的未提交源码和非忽略历史文件由私有恢复快照保存；嵌套无提交 Git fixture 需要单独原样归档，不能把 gitlink 当作完整源码备份。
- 本轮候选工作树中移出的文件未递归删除，而是移动到独立保全目录 `candidate-retired/`，有 `moves.json` 记录。

本机保全根为 `D:/Ameow-preservation/issue-18-20261103/`。`snapshots.json` 记录实际恢复 SHA、tree、bundle SHA-256 与独立恢复核对结果；原始包只保留本机，不能将其当作 GitHub 可下载附件。只有记录实际 PASS 才代表恢复验证完成。

快照明确不覆盖临时 `.trellis/tmp/` scratch 仓库，以及忽略的构建/缓存/媒体。非临时嵌套目录由 ZIP 单独保存并逐文件核对；原有工作树、忽略产物和外部 `D:/Ameow-artifacts/` 证据均保留原位。本轮不据此宣称任何旧工作树已经可删。

读取旧文件可使用 `git show 7f8d3b36:<原路径>`。如需完整旧树，可在新的独立目录使用 Git archive。旧任务路径的映射可读 `git show 7f8d3b36:.trellis/research/migration-reference-map.md`。不要再次运行迁移、重写原报告或在当前源码树直接恢复整套 Electron 文件。私有快照和全 refs bundle 只用于本地恢复，不推送到 GitHub。

## 验证、文档与切换

本次实际验证结果、构建提交、日志及 EXE 哈希记录于 [#18 交接主题](../.trellis/research/issue18-rust-takeover.md) 和 Issue Report。原 #14、#15、#16、#17 的审查/测试/人工验收继续按原范围复用，未测项不自动获得 PASS。

保留 Pages 地址 `https://wutpeach.github.io/Ameow/`。工作流直接执行 `npm --prefix site run build`，PR 仅构建，不部署；main 或 main 上手动执行才部署。旧 Electron/macOS/tag release 工作流已从候选树退役，Rust CI 不发布 EXE。

README 与关键站点入口区分已公开的 Electron v0.3.1 和未公开发行的 Rust 源码。文档全文更新留给 #19。私有包的 hash-bound review 必须对应当前新输入；既有 Gate A 通过记录不是本次打包授权，公开 Gate B 仍阻断。

集中验收后，使用正常 PR/非强制 merge 切换 GitHub main。冻结 Electron 本地 main 仍是独立历史分支，不应在脏树中 pull/reset。后续开发先从接受的远端 main 建立干净 Rust 检出；是否迁移本机目录名、退役哪个旧工作树或分支，按本次保全清单与最终授权再执行。
