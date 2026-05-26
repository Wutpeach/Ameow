# Implement Plan

## Recommendation

Proceed with a minimal Phase 5.3 renderer command controller registry.

The registry should only cover the three command handlers already extracted before Phase 5.3:

- `getVideoDownloadCommandBridge()`
- `getSiteSessionCommandController()`
- `getSupportLogCommandController()`

The remaining `switch (command)` should stay in `electron/main.mts` as the fallback. No remaining command family should be extracted as part of Phase 5.3 unless separately planned.

## Minimum Scope

- Keep `electron/main.mts` as the composition root.
- Replace the three repeated controller guard blocks in `handleCommand(...)` with an ordered registry loop.
- Store lazy getter functions in the registry, not controller instances.
- Prefer keeping the registry inline in `electron/main.mts`; extract a helper module only if focused tests need it.
- Preserve the exact current order:
  1. video download
  2. site session
  3. support log
  4. remaining switch
  5. `Unsupported Electron command: <command>`
- Add one short comment near the registry: `Order matters: first supporting controller wins.`
- Add a pure helper and unit test only if that is the cleanest way to characterize order/fallback/error behavior.

## Suggested Implementation Steps

- [ ] Start a new Phase 5.3 implementation task under `architecture-boundary-refactor`.
- [ ] Confirm clean worktree and current Trellis task state before coding.
- [ ] Load backend Electron runtime/type/error/quality specs.
- [ ] Add characterization tests for the registry dispatch behavior.
- [ ] Implement the smallest ordered registry using lazy getters.
- [ ] Keep the remaining switch unchanged except removing the repeated pre-switch guard blocks.
- [ ] Run focused tests:
  - `npm test -- electron/videoDownloadCommands.test.mts electron/siteSessionCommands.test.mts electron/supportLogCommands.test.mts`
  - plus any new registry test file
- [ ] Run full validation:
  - `npm run type-check`
  - `npm run lint`
  - `npm test`
  - `git diff --check`

## Non-Goals

- Do not extract config/theme commands.
- Do not extract folder/context-menu commands.
- Do not extract autostart/shortcut commands.
- Do not extract window geometry commands.
- Do not extract file/image/clipboard/rename commands.
- Do not extract UI Lab commands.
- Do not extract Xiaohongshu drag resolution.
- Do not change renderer command type definitions.
- Do not change preload or desktop bridge definitions.
- Do not change WebSocket actions.
- Do not create a broad framework, decorators, or command-name keyed registration map.
- Do not eagerly instantiate controllers during module initialization.

## Validation Plan

Characterization tests should prove:

- Controller getter functions are evaluated in the existing order.
- A command supported by the first matching controller invokes only that controller.
- Unsupported commands fall through to the existing switch path.
- Switch commands such as `get_config` are not consumed by existing controllers.
- Payload object identity is passed through to the invoked controller.
- Controller rejection object identity passes through.
- Unknown command error text remains `Unsupported Electron command: <command>`.

Existing command-controller tests should continue to pass unchanged.

## Rollback Plan

If registry tests become invasive or require importing `electron/main.mts` with lifecycle side effects, stop and use a tiny pure dispatch helper instead. If that still adds more complexity than it removes, do not implement the registry and choose the next low-risk controller extraction as a separate Phase 5.x target.

## Next Executable Goal Draft

```text
/goal 请按照 Trellis 工作流执行 architecture-boundary-refactor 的 Phase 5.3 子任务：Implement Electron renderer command controller registry。

范围只限把 electron/main.mts 中已 controller 化的 video download / site session / support log renderer command dispatch 改为有序 lazy getter registry。

必须保持：
- dispatch 顺序不变：video download -> site session -> support log -> switch fallback
- renderer command 名不变
- payload 不变且按对象身份传递
- 返回值不变
- error identity pass-through 不变
- unknown command error text 仍为 Unsupported Electron command: <command>
- main.mts 仍作为 composition root
- controller 不创建隐藏全局状态
- registry 不改变 lazy initialization 行为
- 默认采用 main.mts 内 inline array + loop；只有测试需要时才抽 tiny pure helper
- registry 附近保留短注释：Order matters: first supporting controller wins.

禁止：
- 不抽离任何 remaining switch command family
- 不改 renderer command / preload / desktop bridge 类型
- 不改 WebSocket action
- 不改错误 envelope
- 不改启动流程
- 不做自动格式化造成无关 diff

验证：
- 新增或更新 registry characterization tests
- npm test -- electron/videoDownloadCommands.test.mts electron/siteSessionCommands.test.mts electron/supportLogCommands.test.mts <registry-test-if-added>
- npm run type-check
- npm run lint
- npm test
- git diff --check
```
