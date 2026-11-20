# Design

## Context

见 proposal.md。当前 distribution/ameow.iss 使用 Inno 现代浅色向导、SDK 默认放大比例，以及少量硬编码英文；package_windows.ps1 从已验签便携核心编译并复核材料。

## Goals / Non-Goals

采用原生语言与缩放能力，保持安全检查及版本注册 owner。仅调整安装器；不换体系、不改应用更新、不引入新 Logo 或 Mac 行为。

## Decisions

- 使用 LanguageDetectionMethod=uilanguage；English 首项，固定简体/繁体上游翻译，避免 SDK 无中文文件及简繁匹配例外。UsePreviousLanguage=no，显式 /LANG 仍可覆盖。无需自写地区判断或改系统语言。
- 原生消息来自对应消息集，Ameow 自有文字统一用 CustomMessages；原有检查条件和 Exec 注册保持。
- WizardSizePercent=100，保持原生 DPI 缩放与控件布局；使用正式 ICO 作安装程序图标，并从既有正式图标复用向导页首图形。按实际窗口证据调整，不硬压为参考图像素。
- 固定翻译来源与许可；打包材料纳入新增消息与图标哈希，沿用编译后复核。
- 以已签名核心生成普通未发布候选；安装验证使用隔离身份，不覆盖生产注册，默认不启动应用。语言检测测试仅作用于所拥有测试进程，不改 OS 语言/区域。

## Risks / Trade-offs

- 中文翻译为上游贡献资源 → 固定来源、保留署名，编译检查缺漏；不在线取语言文件构建。
- 单台机器不能代表所有语言/DPI → 记录当前真实 OS 与进程范围语言模拟的区别，保留未测范围。
- 正常安装会写卸载/快捷方式与注册状态 → 真实安装只用隔离 ValidationBuild，不运行日常身份。
