# 浏览器会话

本指南对应浏览器会话开发候选。已发行的 0.5.0 不含此功能；本指南不表示后续版本或扩展商店已经发布。

## 构建和加载

在同一个工作树和固定 target 中构建普通应用与原生桥接：

~~~powershell
npm ci --prefix browser-extension --ignore-scripts
npm --prefix browser-extension run build
cargo build --locked --bin ameow --bin ameow-cli --bin ameow-browser-host
./target/debug/ameow.exe
~~~

macOS 的可执行文件没有 .exe 后缀。Windows Edge 为首要验证浏览器；Edge、Chrome 和 Chromium 使用同一协议，最低 Chromium 120。扩展固定 ID 为 icedkidcbbbijndplfofcbhikohlcool，原生 host 为 org.ameow.browser_sessions。

在 Ameow **设置 → 下载 → 浏览器会话** 点击“安装浏览器连接”，注册当前产品包的桥接。点击旁边文件夹图标找到扩展目录，在 Edge/Chrome 的扩展管理页启用开发者模式并加载该目录。开发构建目录是 browser-extension/dist；完整产品包携带 browser-extension，Mac 包位于 Contents/Resources/browser-extension。不要单独移动注册后的桥接可执行文件。

在普通网页打开 Ameow 扩展，确认显示的站点及子域范围，再点击授权并完成浏览器权限确认。权限按公共后缀表确定边界；不会因为媒体位于另一个站点而扩大授权。每个浏览器 profile 的扩展安装保有独立来源 ID，一个站点只使用一个来源；“改用此浏览器”明确替换当前来源。

## 同步和管理

已授权站点在 Cookie 变化后合并同步，浏览器启动补同步，另以一分钟周期补偿遗漏事件。桥接只在浏览器通信时运行，不启动完整 GUI。桌面未运行时仍能保存当前用户受保护的离线缓存；缓存是最近同步的会话，不证明网站当前仍接受登录或会员权益。刷新同步的是浏览器已有会话，不替用户重新登录。

设置显示站点、浏览器来源和最近同步结果。移除只停止 Ameow 使用并删除其保存的会话；不会退出网站或更改浏览器原始 Cookie。扩展下次同步识别失效授权并移除自身站点权限。浏览器撤销权限会通知桥接；桥接暂不可用时保留待处理状态并补交。已开始的对应下载按原有取消和资源结算停止。

非分区 Cookie 保留域、host-only、path、secure、HttpOnly、过期及会话语义。分区 Cookie 不展平进 Netscape Jar，扩展和设置说明排除结果。站点的设备/IP 绑定、风控、地区或付费限制仍可能影响原生下载器；通用授权不是下载支持白名单。

## 下载与存储边界

Windows 使用当前用户 DPAPI；Mac 使用应用专属 Keychain 密钥和 AEAD。站点数据库、桥接目录及临时认证目录按当前用户保护，不读取浏览器数据库或自行解密浏览器加密。

每次 attempt 从有效授权建立独立 Jar，正式 yt-dlp/gallery-dl 的 metadata、选流、transfer、内部重试及后备共用该 Jar。浏览器随后同步不会替换它；后端自己的 CookieJar 更新留在 attempt 内，不回写受保护的浏览器来源。显式失败重试取得新快照并重新解析，画质和目录继续沿用原任务意图。没有授权时沿用匿名下载。

Cookie 原文不进入 argv、业务状态或持久诊断。认证下载不保存原始引擎 stdout/stderr/JSON；保留资源结算事实和仅含尺寸、帧率、码率及已知 codec 的媒体观察。临时 Jar 随已有工作区清理屏障释放。失败继续使用原失败状态、复制安全诊断和显式重试；没有失败卡授权按钮或授权后自动重试链。

ameow-cli --json sessions 只读查看站点与同步事实。它连接现有桌面实例，不启动下载或导出 Cookie。

## 产品打包

Windows 的 scripts/package_portable.ps1 同时构建桥接与扩展，将它们加入 schema 3 的受校验完整包材料。Windows 单 EXE 应用更新保留现有边界，桥接和扩展随完整安装包/便携包更新；应用启动会刷新已经安装的桥接注册位置。Mac 的 scripts/package_macos.sh 要求应用、updater、CLI 与桥接均为匹配最低系统版本的 arm64 文件，扩展随完整应用包签名。

~~~powershell
./scripts/package_portable.ps1 -TargetDirectory D:/task/ameow-target -OutputDirectory D:/task/ameow-inputs
~~~

Mac 在普通 Apple Silicon 构建环境运行：

~~~sh
MACOSX_DEPLOYMENT_TARGET=13.0 cargo build --locked --bin ameow --bin ameow-updater --bin ameow-cli --bin ameow-browser-host
./scripts/package_macos.sh ./target/debug/ameow /absolute/new/Ameow.app
~~~

## 隔离验证

~~~powershell
cargo test --locked --lib session
npm --prefix browser-extension test
node browser-extension/tests/native.e2e.mjs D:/task/new-edge-fixture
~~~

Edge E2E 只创建自己的 profile、合成 Cookie 和测试 host 注册。无头 Edge 的权限由该 profile 的扩展管理 API 预授，不把它当成浏览器原生确认 UI 的验收。测试通过真实 Native Messaging EXE、正式桌面 owner 和 Rust CookieJar 检查首次授权、变化、重启、删除及撤销。调试 host 的 AMEOW_BROWSER_TEST_INSTANCE 只在 debug 生效；普通产品的注册、存储及 Adapter 不依赖它。

实际下载 fixture 使用已有 debug 更新 fixture 的固定 example.com 代理路由；服务器不会转发外部请求，不修改系统代理。它运行正式下载内核、官方 yt-dlp/FFmpeg/verifier，检查 2160p 合成交付、匿名 1080p、attempt 冻结、来源刷新、失败脱敏和真实撤销结算：

~~~powershell
cargo build --locked --features app-update-fixture --example download_job
python scripts/test_browser_session_media.py --root D:/task/new-media-fixture --driver target/debug/examples/download_job.exe --host target/debug/ameow-browser-host.exe --ffmpeg C:/tools/ffmpeg.exe --ffprobe C:/tools/ffprobe.exe
~~~

Mac 的 scripts/package_session_check_macos.sh /absolute/new/check-directory 只准备可从 Finder 启动的专属合成验证包，不启动 GUI 或访问 Keychain。它使用产品存储代码和桥接，检查两个可执行文件访问、快照、刷新和撤销；其身份及覆盖边界与完整 GPUI/浏览器验证分开记录。只有用户本机明确启动后才运行，回执仅含安全状态及哈希，清理限定测试 root 对应的专属 account。

会员验证由用户在本地从真实站点主动授权，再对同一新样本分别核对匿名/授权可见格式、实际选择和成品。凭据不经过聊天，fixture 不代表真实会员通过，也不能追溯证明未知旧链接的唯一根因。
