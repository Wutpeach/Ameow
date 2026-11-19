# #50 验证与交付边界

基座为 PR63 的13107cefd22c3397b238daf05dce74625c00017b；本 change 只增加 #50，不合并 PR63/61，不修改首页和README。应用构建提交、最终Draft head、CI及本机候选指纹在交付报告中分别记录。

## 实现与实际验证

| 范围 | 结果与证据 |
| --- | --- |
| 冻结、无效范围、去重、重试、请求冲突 | Rust定向测试通过；clip不改变源作品Identity，范围进入请求指纹/任务去重 |
| 扩展授权隔离与旧桥接拒绝 | Node测试通过；页面启用不建Cookie grant，旧桥接只有Ping且不发Submit |
| 两站正常/Reduced、固定命中、草稿/清除、原链路恢复 | 任务私有CfT158与Edge156实测；最新连续证据在ui-motion-final-cft-01、ui-motion-final-edge-01 |
| 换分P与即时定位 | 实时播放器身份加当前页面URL校验，B站P1→P2清草稿；Edge的I/O控件键盘输入立即seek |
| 真实页面→桌面ACK→正式文件 | native-cft-01、native-edge-01；两站片段及Edge YouTube整段交付，独立实例与唯一测试注册，finally移除注册 |
| HLS / DASH / HTTP非关键帧 | media-05：1.250–4.750s，输出3.521/3.521/3.560s；首尾源画面误差检查通过，音画脉冲偏差10/20/10ms，实际文件hash及不覆盖沿原发布核验 |
| HTTPS子域直接认证Range | media-auth-range-01：匿名403，metadata与实际MP4范围取数均带同一合成attempt Jar；3.560s、同步偏差10ms；仅debug fixture，不等于真实会员/HLS认证 |
| OpenSpec与机械检查 | change及现有主规范strict通过；设计detector无报告项，不能替代真实呈现/用户手感验收 |

完整本机证据位于D:/Ameow-handoffs/issue50-implementation。连续WebM为浏览器实际呈现录制，截图裁到工具条或Peek；不把静态图、合成媒体或一次公开样本泛化为站点通用、所有帧率或会员通过。Windows本轮为实测平台，Mac/Firefox未验或未实现。

## 失败前驱与修复

- player-probe-01在媒体未稳定时观察到换源；02等待可播放后两站同节点/源/暂停位置恢复通过，正式入口等待真实媒体就绪。
- UI自动化最初的active-tab模拟缺少tab ID；补正确任务tab后执行实际扩展。
- 自动化scrollIntoView会把展开中的左按钮滚到页头；改为核实命中对象后发送真实指针事件。播放器恢复还保留原scroll位置。
- B站SPA的sender URL可能保留文档初始地址；改用执行于当前主frame的页面URL与实时manifest共同校验，分P回归通过。
- 连续录制初次受popup窗口的共享compositor尺寸影响，有大片灰区；最新入口关闭popup后恢复真实页面viewport，并保留旧录制为失效前驱。
- media-01的SHA比较大小写、media-03缺父目录、media-04的DASH分片cwd均为fixture错误，已修正并以media-05重新取得媒体结果。media-02在受管组件probe失败，未记成功。

## 隔离事件与审计

UI-only03–06曾误用正式Native名称，06回读到站点来源/同步状态元数据。这些结果不计全程隔离通过。没有当时的逐Native审计；“未collect/sync/submit/正式队列”的判断仅来自源码路径、空本地grants与测试动作，不作捕获到的绝对否定。源码路径为popup refresh→background status→Ping/List；没有再读取正式环境补证。

原始自有证据保持原字节，并限制当前用户/SYSTEM访问，不进入Git/分享资产。分享材料只保留本段摘要，不列真实source/grant/request标识、数量或用户时间。详细脱敏回执在ISOLATION-AUDIT.md。

修复后的isolation.mjs扫描全部JS入口/chunk，检查后台与popup入口并在运行前安装Native API边界；仅允许本次唯一Host，拒绝正式目标在真实API前发生，记录安全操作名。UI-only为未注册Host；完整Native测试为唯一注册、固定当前helper哈希及私有instance-root，CLI也明确绑定同一实例。新的两站正常/Reduced、恢复、草稿和清除证据另存，不覆盖失败前驱。

## 认证与上游限制

media-auth-01是凭据转交负例：metadata带合成Cookie，FFmpeg范围请求不带；服务器未要求认证而仍交付文件，不能以Success计认证通过。media-auth-02对媒体端点实施匿名403后失败，证明缺口；改变域没有消除HTTP代理路径问题。

固定yt-dlp 2026.08.19把当前输入URL匹配的Jar Cookie传给FFmpeg，保留path/domain投影。[固定下载器代码](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/downloader/external.py)。FFmpeg9.0.2的HTTP代理使用绝对URL请求路径，Cookie的path比较仍使用该路径；前导点域和裸域还有独立匹配限制。原裸域样本含代理因素，不能断言唯一根因。[固定HTTP实现](https://github.com/FFmpeg/FFmpeg/blob/n9.0.2/libavformat/http.c)。

HTTPS自签名HLS试验因嵌套分片的证书处理失败，不记认证通过；HTTPS MP4 Range正例具有真实匿名拒绝对照，但不证明HLS认证、所有Cookie属性/重定向或真实账号支持。Jar域、host-only、path、secure均未为求绿修改，也未新增全局Cookie头或完整下载回退。

两个公开样本实际选中媒体域为googlevideo.com、bilivideo.com/bilivideo.cn，与网页会话域不同；Cookie不应跨域发送。签名媒体访问参数由原下载器解析，不公开可过期URL。需要Cookie直接保护的HTTP代理媒体等已知路径不宣称支持；真实会员、其他媒体主机/格式保持未验。

TLS证书例外仅属于显式debug app-update-fixture：固定example.com媒体目标、确切自有端口及测试flag同时匹配。非fixture URL即使配本地代理和两个flag，也不生成不校验证书参数；定向负例通过。普通构建/Release不编译该分支，没有全局证书设置。

## 本机与CI

本机默认cargo test首次有三个安装器测试失败：首个E_APP_UPDATE_INSTALL_RUNNING，其余锁中毒。store.rs的安装器注册获取全局InstanceGuard，本机存在运行实例；不为测试停止日常应用。排除这三项后的其余完整测试通过，ignored不计PASS；不以“模块旧”断言基线无缺陷。最终精确Draft的干净CI须另核完整默认测试和Release包构建。

本轮仅开发交付与Draft；未Ready、merge、Tag、Release、商店/官网部署或关闭Issue。产品最终手感与整合由来源继续验收。
