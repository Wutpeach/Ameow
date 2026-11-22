# 只读入口的证据

从仓库根目录运行 scripts/check_release_readiness.py。--repo 可指定检出目录；--assets、--evidence、--version、--commit 均由本次候选提供，不固定日期或机器路径。需要 Python 3.11+、Git；在线核验用现有 gh 登录，调用的只有 ls-remote 与 GitHub GET API。无法访问时相关项 PENDING，不采用缓存 success 冒充当前查询。JSON 写到 stdout，需留存时由调用者重定向到独立交接目录。

ASSETS.json 复用现有格式：顶层 version/commit/tree、assets 数组，每项 name/relativePath/bytes/sha256/target，以及 ci.rust、ci.docs 的准确 run URL。relativePath 相对 ASSETS.json；仅以它定位资产，忽略历史绝对 path，允许整体迁移候选目录。资产必须恰为本版 Windows installer/portable/update ZIP/feed 与 Mac App ZIP/feed 六项。

evidence.json 是本次任务的轻量索引，不放入候选、不签发新权威。索引内所有文件路径相对索引目录，也可为显式绝对路径。将既有工具原始回执填入，避免复制或重写签名/成员规则：

~~~json
{
  "schema": 1,
  "identity": {"version": "<版本>", "commit": "<产品commit>", "tree": "<tree>", "assetsSha256": "<ASSETS.json的SHA256>"},
  "windows": {"build": "<release-build.json>", "inputs": "<input-manifest.json>", "delivery": "<delivery.json>", "verified": "<verify-signed JSON回执>"},
  "mac": {"inputs": "<完整input-manifest.json或现有摘要>", "verified": "<signature-and-package-verified JSON回执>"},
  "records": [
    {"id": "docs", "status": "PASS", "commit": "<文档commit>", "note": "中英README/手册/演示/未发布Changelog已核；逐项写变更或无需更新理由", "files": [{"path": "<文档检查报告>", "sha256": "<报告SHA256>"}]},
    {"id": "windows.paste", "status": "PENDING", "note": "用户本人待验"},
    {"id": "user-acceptance", "status": "PENDING", "note": "候选交付后等待用户验收"}
  ]
}
~~~

必需记录 id：docs、user-acceptance；每个平台 windows/mac 的 startup、paste、download、cancel、extension、exit；Mac 另有 focus、full-compact、background、menu-bar。按改动可增加 id。每项只有 PASS/FAIL/PENDING；未知状态与缺项返回 PENDING。PASS 必须附非空说明与可读文件的实际哈希，docs 还须提供在当前 main 历史中的文档 commit。记录身份继承顶层 identity，不能把别的候选报告直接改名复用；原始报告不含候选身份时，由执行者核实后在 note 写明绑定依据。工具核对报告字节与声明身份，不能判读报告是否足以证明真实 GUI 或用户批准。用户批准证据需含明确接受本候选的原话或原生会话出处，不从技术报告推导。

Windows inputs 应是现有 schema 2 回执，build 是 schema 3。检查其 sourceAndResources/packagingInputs 与产品 commit；保留 Windows CRLF 与 Git LF 差异的可解释匹配，不强求两个平台的字节清单哈希相同。Mac 完整输入回执可使用同样的 baselineHead/baselineTree/dirty/sourceAndResources/packagingInputs/sourceInventorySha256；旧摘要只有 commit/tree/dirty 和摘要哈希时可核身份，但完整输入证据列 PENDING，不能凭摘要宣称全部匹配。

后续 main 提交按实际构建输入判断。源码、资源、依赖、打包脚本/安装器及 Mac 图标输入变化返回 FAIL；纯文档与本 Skill/检查工具变化允许复用候选。未知路径返回 PENDING 等待判定，不静默当成文档。未提交输入变化同样列出；AGENTS 和 DocsSync 状态的外部修改不改写候选身份。docs.commit 后又改动发布相关文档/演示时，旧文档记录返回 PENDING，需补核最新文档及准确 Docs CI，产品候选不因此重打。

原始 JSON 报告已有的顶层 commit/head_sha、tree、语义版本、源码 SHA 与 app_sha256 会再次交叉核对，旧报告不能靠改索引标签变成新候选证据。嵌套或无结构报告仍需执行者审读其覆盖，不能仅凭文件哈希宣称交互/验收通过。

签名与成员校验仍由原工具负责，本入口只核既有验签回执与实际六项资产的绑定；不会重新验签、解包或执行候选。回执 PASS 只说明该回执记录了成功，不扩大其覆盖。线上发布检查和明确发布授权是后续独立步骤。
