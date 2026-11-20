# 浏览器覆盖与 Firefox 最小接入方案

本页区分产品已接入的路径、具体浏览器实测和待定支持。不能因为本机使用 Edge、共享 Chromium 或 WebExtensions，就推定其他浏览器已经验收。979 产品包与旧验证保持原身份；本轮只补测试入口和范围说明，不实施 Firefox。

## 当前范围

| 浏览器 / 平台 | 当前代码 | 实测范围 |
| --- | --- | --- |
| Windows Edge | Chromium 扩展及当前用户 Native Messaging 注册已接入 | 979 独立 Edge 握手/合成会话链，另有用户连接/主动B站授权及正式CLI安全同步投影；后者不是认证下载验收 |
| Windows Google Chrome | Chromium 构建、固定ID/origin及 Google/Chrome 注册已接入 | 常规安装位置未找到 Chrome；普通品牌 Chrome 日常安装、商店及原生权限UI尚未验 |
| Windows Chrome for Testing 158.0.8127.36 | 使用979同一Chromium扩展与正式App/CLI/host字节，不新增产品实现 | 专属profile/唯一Chrome测试注册：无Store Ping、合成同步/变化/重启/删除/撤销、双profile明确替换及旧来源隔离通过；host权限由测试预授，不计原生权限UI |
| Windows Chromium | 共用扩展、独立注册路径已接入 | 无该品牌独立运行证据，不能用 Edge/CfT 替代 |
| macOS Edge / Google Chrome / Chromium | 普通 .app 携带扩展与host，三种注册位置已有实现 | Mac普通构建/打包、CLI、无Store Ping及冻结合成GUI存储结果分开记录；浏览器到桌面的实际链路尚未验 |
| Windows / macOS Firefox | 当前不支持 | 缺少下列 Gecko 构建、API/身份和注册适配；仅有方案，是否实施待用户定范围 |

manifest 声明最低 Chromium 120，构建 target 为 chrome120；这是声明/构建边界，不能当作每个浏览器或最低版本均已亲测。Chrome for Testing 的品牌、版本、二进制哈希、权限预授和所用 profile 均单列，不能换标为普通 Chrome 商店安装或日常profile实测。

## Chrome 独立验证入口

复用精确产品包，先以生产清单构造器和独立浏览器验证无 Store Ping：

```powershell
node browser-extension/tests/installed.e2e.mjs D:/task/new-cft-ping D:/task/product-979 target/debug/examples/browser_bridge_manifest.exe --browser chrome-for-testing --executable D:/task/chrome-for-testing/chrome.exe
node browser-extension/tests/native.e2e.mjs D:/task/new-cft-sync --browser chrome-for-testing --executable D:/task/chrome-for-testing/chrome.exe --product D:/task/product-979 --source-isolation
```

--browser 可取 edge / chrome-for-testing；CfT 必须给明确可执行文件。每次生成唯一 fixture host 名称，只写对应浏览器的自有测试注册键，并在 finally 移除。禁止选择日常profile、正式org.ameow.browser_sessions注册或已授权B站。两个命令均使用新的任务目录。

本轮从[官方CfT发布元数据](https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json)选择Stable 158.0.8127.36，下载至任务私有目录，没有全局安装、默认浏览器或系统服务变更。精确来源、ZIP/EXE哈希、原始元数据与执行结果保存在交付证据中。

第二个入口复制产品扩展至测试目录，只把 host 名称换为测试名称。正式 release App/CLI 使用隔离 --instance-root；因 Native Messaging 清单不能附带参数，测试专属 ASCII .cmd 仅向相同字节的 release helper 副本传隔离 root，不进入生产目录/注册。原产品哈希、测试副本哈希和浏览器身份写入回执。该包装器不是产品依赖。

合成测试由该专属 profile 的扩展管理 API 预授站点范围，再运行真实 Sessions/popup/Native/桌面与受限Jar检查：首次授权后同步、变化、浏览器重启、删除、撤销；第二个全新profile需明确替换来源，旧来源不能覆写新来源。预授只计授权后行为，不计真实浏览器原生权限确认UI。已有 Edge 默认入口仍可使用，不重跑无关下载或Mac矩阵。

Chrome 137 起普通品牌 Chrome 限制命令行 --load-extension；用户开发者模式仍可通过 chrome://extensions 的“加载解压缩的扩展”。CfT 测试使用其支持的加载路径；普通 Chrome 应另验自己的加载和安装流程，不用参数替换冒充成功。[Chrome 官方变更说明](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY)、[官方开发者加载说明](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world)。

## Firefox 当前缺口与最小方案

### 1. 同源构建与后台运行

保留现有 popup HTML/CSS、站点范围/PSL、Sessions 状态机及同步结果语义；增加 Gecko 构建输出，不复制一套业务。单独生成 Firefox manifest：固定 browser_specific_settings.gecko.id，声明经过实际API核验的最低版本，移除只适用 Chromium 的 key/minimum_chrome_version，以支持的 background.scripts 事件页运行同一个后台模块。979只有 service_worker，Firefox不能直接运行。[Mozilla 后台运行差异](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)、[Gecko身份配置](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)。

### 2. 薄API适配与准确来源

当前核心固定 storeId='0'，入口固定 chrome，来源标签只有Edge和Chrome/Chromium；这些都不能直接作为Firefox实现。用小的浏览器API入口处理Promise/callback差异并显示Firefox来源；通过官方CookieStore API选定正确的普通会话上下文，明确私密/容器边界，不枚举其他账号来源。按Mozilla的partitionKey/firstPartyDomain语义处理分区，不静默展平或扩大站点授权。最低版本、权限撤销/事件页重建/错误安全分类均需实际验证。[CookieStore API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/cookies/getAllCookieStores)、[Cookie过滤语义](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/cookies/getAll)。

### 3. 独立原生清单、注册和启动身份

保持同一个 Rust host / 协议 / Store / DPAPI或Keychain / attempt Jar / owner / 两Adapter。Chrome清单和固定origin校验不放宽；另生成仅允许固定Gecko ID的 allowed_extensions 清单。当前host只接受首参数等于 chrome-extension origin；Firefox传入清单路径与add-on ID，必须新增明确的Firefox启动参数校验，拒绝错ID、错清单或错参数，不接受任意 moz-extension URL。只改浏览器接入差异，不改Cookie业务或引入服务。

Windows 使用当前用户 HKCU/Software/Mozilla/NativeMessagingHosts/<name>；Mac 使用 ~/Library/Application Support/Mozilla/NativeMessagingHosts/<name>.json。Firefox清单放独立位置，不覆盖当前共享的Chromium清单或Edge注册。普通包资产/完整性材料随之增加，组件自检覆盖两类启动身份并保持Ping无Store。[Mozilla Native Messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging)、[清单及Win/Mac位置](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_manifests)。

### 4. Windows / Mac 验证与分发边界

先在两端自己的新Firefox profile、测试Gecko ID/清单/注册与合成会话验证加载、身份拒绝、Ping、同步/变化/事件页重建/浏览器重启、撤销、来源替换与离线缓存，再核对Mac普通包签名和真实主机访问边界。用户日常浏览器和冻结Mac checker不参与；真实原生权限UI与账号权益/下载另外列证据，不能由合成结果推出。

开发可用专属临时加载验证功能，不能把重启后丢失的临时扩展当产品交付。Firefox Release/Beta 的正常持久安装需要Mozilla签名；公开AMO和unlisted自分发均涉及签名流程。后续若选自分发也须单独授权签名提交/分发，当前不发布商店、不关闭签名检查、不修改用户全局设置。新扩展还需按当前Mozilla规则准确声明数据收集/传输及相应同意，不能未经核对宣称none。浏览器内同意与按站点可选权限都保留，不新增完整账号中心或失败引导。[签名与分发](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)、[内置数据同意规则](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)。

Firefox是否纳入本轮正式实现尚待范围决定；上述方案不表示已实现、已签名或已验证。Safari、Brave等其他浏览器没有在本轮新增支持或验证承诺。
