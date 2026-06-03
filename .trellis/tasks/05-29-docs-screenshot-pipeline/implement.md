# Implementation Plan

## Checklist

1. 撤回错误实现
   - [x] 删除伪截图文件。
   - [x] 撤回文档中对伪截图的引用。
   - [x] 删除重绘 fixture 脚本和 Playwright 依赖变更。
   - [x] 更新 Trellis 任务，明确应用/扩展截图必须来自真实界面。

2. 生成真实扩展截图
   - [x] 检查 `browser-extension/popup.js` 初始化依赖。
   - [x] 设计 Playwright 注入真实 `chrome` API mock 的方式。
   - [x] 截取真实 `popup.html + popup.css + popup.js` 渲染出的 Connected 状态。
   - [x] 截取真实 Disconnected 状态。

3. 生成真实桌面端截图
   - [x] 检查 Electron/Vite 主窗口创建方式和窗口尺寸来源。
   - [x] 判断可行方案：Electron `capturePage()`、Playwright Electron、Windows 高 DPI 系统截图或临时截图模式。
   - [x] 截取真实主窗口展开空闲状态。
   - [x] 截取真实主窗口下载中状态。
   - [x] 截取真实主窗口转码中状态。
   - [x] 截取真实设置主界面和每个设置标签页。
   - [x] 截取真实浏览器贴边小入口。

4. 编写真正截图脚本
   - [x] 只在真实截图方案确认后新增依赖和 `docs:screenshots` 命令。
   - [x] 脚本记录每张图片的真实来源类型。
   - [x] 输出 PNG 到 `docs-screenshot-captures/`。
   - [x] 打印尺寸、文件摘要和截图来源。

5. 更新输出说明
   - [x] 在 `docs-screenshot-captures/README.md` 记录输出文件、截图来源和运行命令。
   - [x] 不修改 `site` 文档页面，不把图片复制到 `site/public/images/docs/`。

6. 验证
   - [x] 运行截图脚本，确认 12 张 PNG 生成。
   - [x] 检查图片尺寸。
   - [x] 人工核对应用/扩展图片是否与当前真实界面一致。
   - [x] 确认未修改 `site` 子仓库。
   - [x] 如新增 JS 脚本复杂度较高，运行相关 lint/type-check 可行项。

## Validation Commands

```powershell
npm run docs:screenshots
git status --short
```

额外检查：

```powershell
# 确认 12 张 PNG 存在且非空，实际实现时可由脚本自动输出尺寸摘要。
Get-Item docs-screenshot-captures/*.png | Select-Object Name,Length
```

实现前验证：

```powershell
git status --short
git -C site status --short
```

## Review Gate

在开始实现前，先把 PRD 与设计方案交给 Claude 评审。需要特别确认：

- Playwright + screenshot harness 是否是合理首轮方案。
- 5 张图片的选择是否覆盖新用户最关键路径。
- 是否应该首轮强制真实 Electron / Chrome Extension 运行态截图。
- 输出目录、脚本位置和验收标准是否有隐藏风险。

Claude 评审结论中的“fixture 优先”已被用户反馈否决，原因是文档中的应用图片必须是真实截图。后续执行以用户澄清为准：

- 应用/扩展图片必须来自真实运行界面。
- mock 只能用于运行态输入或 API 响应，不能替换真实 UI。
- 自动化不完整时，宁可保留占位或设计人工高清截图流程，也不能用重绘图顶替。

## Rollback Points

- 若真实 Electron 截图无法首轮自动化，可先产出手动高 DPI 截图流程和半自动裁剪脚本。
- 若扩展真实 popup 自动化受 Chrome API 限制，可保留真实 DOM/CSS/JS，注入最小 API mock。
- 非应用界面图可以改为明确示意图，但文档文案必须同步使用“示意图”而不是“截图”。
