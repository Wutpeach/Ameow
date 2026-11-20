# #50 验证与交付边界

基座为 PR63 的13107cefd22c3397b238daf05dce74625c00017b；本 change 只增加 #50，不合并 PR63/61，不修改首页和README。应用构建提交、最终Draft head、CI及本机候选指纹在交付报告中分别记录。

## 当前快速粗切与复审增量

2026-11-20 用户将首期目标改为长视频快速粗切，优先避免整片取数。71562f8d及其精确重编码包/媒体证据只作为历史；下表旧媒体PASS不覆盖新执行路径。交互主体复用，源码仅追加R1/R2/R3定向修复，最终普通包与新head另记交付报告。

fast-media-04以600秒、4秒GOP长源请求301.250–309.750秒。计量包括metadata、探测、重复请求及预读，以服务器成功写出的16KiB块累计（不以Content-Length冒充实际传输；含内核缓冲，属于客户端消费的保守上界；不含HTTP头）。

| 源 | 完整源字节 | 实际响应字节 | 比例 | 输出时长 |
| --- | ---: | ---: | ---: | ---: |
| HTTP Range | 27,275,300 | 2,555,904 | 9.37% | 10.795秒 |
| HLS | 29,871,662 | 832,095 | 2.79% | 10.755秒 |
| DASH | 27,115,449 | 1,111,994 | 4.10% | 9.893秒 |

三项源帧匹配均为300.000→309.800秒，保留h264/aac源流，真实成品SHA匹配。按容器PTS核对重叠音画脉冲偏差40/30/17ms；HTTP/HLS的前置GOP分别有1.28/1.24秒视频先于音轨，属于原生粗切的前沿差异，不称毫秒精准或无音画前沿差异。耗时包含每个私有实例组件准备/探测，不用这组本机秒数宣称普遍速度倍数。

fast-no-range-01证明无Range时原生FFmpeg会顺读前缀约57%仍成功；已收紧输入寻址与遇错中止。fast-no-range-02按相同源、相同区间明确Failure，无文件发布，响应1,687,552/27,275,300字节（6.19%，含探测/预读），未顺读到所选位置或整片回退。该路径不宣称支持，不把任意服务器/索引行为概括成通用保证。

独立复审715的R1/R2/R3按正式编号处理：buffering-fix-01真实限速HTTP使seek后readyState=1，超过轮询周期仍保留同节点/绑定/Peek/草稿，恢复后可编辑；换作品负例仍关闭并清空。permissions-fix-01在真实CfT权限API上确认撤Cookie后工具permission/registered/enabled仍true、桌面revoke消息与本地grant删除有效，浏览器直接撤权后全部false/0。keyboard-fix-01确认聚焦清除/关闭/提交按钮Space原生激活，背景Space仍播放、Esc恢复。前两项使用最小无Cookie/Native权限扩展或纯mock页面，不冒称真实桌面授权撤销全链路；Node另核断桥撤销重试不再采集Cookie。

fast-media-01因额外要求generic MP4缺失的源duration而失败，已恢复“可靠源时长可用才校验”；fast-media-02将视频/音轨各自解码零点直接比较，未计stream start_time而产生伪同步失败。03以PTS修正取得证据，04再覆盖显式可seek输入；前驱原样保留，不能计成功。

## 715实现与历史实际验证

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

本机默认cargo test首次有三个安装器测试失败：首个E_APP_UPDATE_INSTALL_RUNNING，其余锁中毒。store.rs的安装器注册获取全局InstanceGuard，本机存在运行实例；不为测试停止日常应用。排除这三项后的其余完整测试通过，ignored不计PASS；不以“模块旧”断言基线无缺陷。715的干净CI44579779740/check135756968881已完成success，完整默认测试与普通Release包通过；此结果不能套到快速粗切新head，后者单独跟进。

本轮仅开发交付与Draft；未Ready、merge、Tag、Release、商店/官网部署或关闭Issue。产品最终手感与整合由来源继续验收。


## 2026-11-20 试用后的 UI 增量

本轮以用户截图和随后 AE/达芬奇轨道参考替代旧纯图标展开约束：28px胶囊展开146px，图标/文字分别12–13px/13px，无分隔及 title。800px Peek 使用70px单行工具栏，合并播放、I/O与下沿平移命中；聚焦选区/全片仅切换视窗，长源短区间可辨认，视窗外播放头隐藏并显示方向。系统字体在内层明确设置，窄窗紧凑折行。

新增本地实际指针/布局回归 page-layout.e2e.mjs，覆盖空/单端/有效、双端拖动、独立播放头、整体平移保长度/夹边、悬停、聚焦映射/视窗外播放头、禁用和延迟 mock ACK。page-ui.e2e.mjs 记录两站 Edge/CfT 正常/Reduced、原节点/源/位置恢复、同作品草稿与换分P、桌面/窄窗、聚焦及快速往返。mock、匿名 UI-only 与私有 Native 受理证据分别报告，不互相冒充。

新证据独立位于 D:/Ameow-handoffs/issue50-ui-polish-20261120；最终 head、候选混合来源身份、报告、录制及实际未验范围见该目录 REPORT.md/DELIVERY.json。各前驱目录保留当时源码摘要，不换标最终版本。后端/协议/权限源码未改，普通程序/runtime 复用准确532，旧媒体计量、认证与有限Mac证据维持原范围；新UI不继承532 CI或代码review结论。原两处tasks完成勾选为前轮文档overlay，保留待来源整合。
