# Design

## Context

参见 proposal.md。现有版本指针、试运行 Ready、旧版保留及安全退出机制可复用；旧载荷校验只接受一个主 EXE。

## Goals / Non-Goals

**Goals:** 整套配套版本选择、固定桌面/CLI/host/扩展路径、可验证失败恢复。

**Non-Goals:** 旧 0.5.1 布局桥接、生产签名及公开发行、Preferences 和 Full UI、浏览器自动重载。

## Decisions

完整 portable 中版本槽包含主程序、CLI、host、扩展和许可材料。独立 Ed25519 bundle receipt 绑定版本、sequence、根启动器及所有槽内文件；外部 Windows schema2 feed 绑定该 receipt 和整个 ZIP，避免包内嵌自身哈希造成循环。Mac schema1 保持原契约。

根 entry.json 保留完整安装时入口的独立签名清单，应用更新保留该稳定入口清单，避免用新版 launcher hash 校验仍有效的旧分发入口。根 Ameow.exe 保持稳定启动器；根 CLI/host 为稳定分发入口，运行已验签活动槽中的对应程序。应用内切换不覆盖正在运行的根入口。固定 browser-extension 为版本槽的派生镜像，先准备完整新目录，再重命名发布；失败不提交 current，保留旧版并在后续启动修复。开发 target 中没有安装 state，仍直接执行原程序。

## Risks / Trade-offs

浏览器文件占用或磁盘错误可能阻止镜像发布 → 报明确错误并维持旧 current，安全退出候选后恢复。镜像与状态两次写入间可能中断 → 启动按真实 current 修复镜像；不将下载 Ready 当活动事件。稳定分发入口不会随普通应用更新覆盖 → 新版业务全部位于完整版本槽，本次不加入自替换启动器的额外进程。

## Migration Plan

新用户和旧用户均完整安装或解压新包。整合者统一同步 delta/归档；本分支不改公开主规范或下载链接，明早由用户在根 main 体验验收。
