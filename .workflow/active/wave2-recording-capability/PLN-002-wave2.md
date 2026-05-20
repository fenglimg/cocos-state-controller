# PLN-002 · Wave 2 · 录制重构 + Capability 框架

> 来源: `~/.claude/.../memory/project_5_wave_plan.md` Wave 2 (1.5-2 周)
> 契约: Red/Green TDD (`feedback_red_green_tdd.md`) · 不动 props/* · 不动 master · 不 push
> 分支: `wave2/recording-capability-framework` (从 master `a312a4d` 切)
> 测试基线: **414 测试不允许下降**, 仅允许净增 (预期 +20 ~ +30)
> 设计文档:
> - Topic 3 录制 prefab diff 路径 (project_5_wave_plan §"Topic 3 (录制) — prefab diff 路径")
> - Capability 接口预设 (project_5_wave_plan §"Capability 框架接口预设")

---

## 0. Wave 2 目标摘要

### Step 1: Topic 3 录制重构 (Day 1-5)
- **删**: 8 个 cc 事件 hook (position-changed / color-changed / scale-changed / size-changed / anchor-changed / spriteframe-changed / active-in-hierarchy-changed / rotation-changed) + 对应 8 个 xxxChanged handler + `setDefaultProp` ~250 行大 switch + `_isFromCtrl` 标记位
- **加**: `StateController._recording` (不序列化) + `StateSelect._snapshot` + `onRecordingStart/Stop` + `onStateWillChange/Changed` diff commit + `IPropHandler.isEqual` + 实装 Inspector 录制按钮
- **修长期 bug**: 无 cc 事件的 prop (button.interactable / label.string / widget.top) 录制可入库

### Step 2: Capability 框架 (Day 6-9)
- 新增 `Capability.ts` (ICapability 接口) + `CapabilityRegistry.ts` (registerCapability / unregister / dispatch)
- 迁移现有逻辑成 capability: PropertyControlCapability / AutoSyncCapability / RecordingCapability
- 占位 MigrationCapability (preset 未实装)
- 数据隔离 `$$<capName>$$` namespace
- 删 capability 后 core 仍能切 state (底线)

---

## 1. Task 总表

| ID | Subject | Files | Deps | Effort | Commit 类型 | Verify (出口标准) |
|---|---|---|---|---|---|---|
| **T01** | Red: IPropHandler.isEqual 契约 (Vec3 值比较, Color 值比较, Asset 引用比较) | `tests/core/PropHandler.isEqual.test.ts` (新) | — | 2h | `test(red)` | jest 跑 isEqual 用例, 6+ case 失败 (因 handler 尚无 isEqual) |
| **T02** | Green: 每个 PropHandler 加 isEqual 方法 (默认 ===, 复合类型按值比) | `assets/script/controller/StatePropHandler.ts` | T01 | 3h | `feat(green)` | T01 全绿; PropHandler.contract 不回归 |
| **T03** | Red: StateController._recording 状态 + Start/Stop API + 不序列化 | `tests/core/Recording.controller.test.ts` (新) | — | 2h | `test(red)` | 红: ctrl.startRecording() / stopRecording() / isRecording 不存在 |
| **T04** | Green: StateController._recording + startRecording/stopRecording (cc 事件广播给所有 StateSelect) | `assets/script/controller/StateController.ts` | T03 | 2.5h | `feat(green)` | T03 绿; `serializable: false` 验证 |
| **T05** | Red: StateSelect._snapshot + onRecordingStart 拍 snapshot | `tests/core/Recording.snapshot.test.ts` (新) | T04 | 2h | `test(red)` | 红: select.onRecordingStart 方法不存在 / _snapshot undefined |
| **T06** | Green: StateSelect.onRecordingStart 拍 snapshot (readControlledPropsFromNode) + onRecordingStop final commit | `assets/script/controller/StateSelect.ts` | T05, T02 | 3h | `feat(green)` | T05 全绿 |
| **T07** | Red: 录制中切 state, fromState 应被 commit diff (e2e: 切 0→1→0, 改 prop, 验证 ctrlData[0] 持久化) | `tests/core/Recording.stateSwitch.e2e.test.ts` (新) | T06 | 3h | `test(red)` | 红: 切 state 时未 commit, ctrlData[0] 仍为 empty |
| **T08** | Green: StateSelect.onStateWillChange/Changed diff commit + 重拍 snapshot | `assets/script/controller/StateSelect.ts` | T07 | 3h | `feat(green)` | T07 全绿; 切 state 多次, 各 state 数据正确 |
| **T09** | Red: 录制外修改不入库 (改 prop, 但 _recording=false, ctrlData 不变) | `tests/core/Recording.outsideRecording.test.ts` (新) | T06 | 1.5h | `test(red)` | 红: 8 hook 没删时, 改 prop 仍写 ctrlData |
| **T10** | Refactor: 删 setDefaultProp 大 switch (~250 行) + _isFromCtrl 标记 | `assets/script/controller/StateSelect.ts` | T07, T08, T09 | 2.5h | `refactor` | T09 全绿; 全套 ≥ 414 + 新增数 |
| **T11** | Refactor: 删 8 个 cc 事件 on/off + 8 个 xxxChanged 方法 | `assets/script/controller/StateSelect.ts` | T10 | 2h | `refactor` | 行数下降 ~80; 全套不回归 |
| **T12** | Red: 长期 bug — 录制 button.interactable / label.string / widget.top 现在能入库 | `tests/core/Recording.noEventProps.test.ts` (新) | T11 | 2h | `test(red)` | 在删 8 hook 后, 这些 prop 现在依赖 diff 路径; 写测试确认 OK |
| **T13** | Green: 验证 diff 路径覆盖所有 prop (无 cc 事件的也能 record) | (T11 已实现, 此 task 为补救如有遗漏) | T12 | 1h | `fix(green)` 或 `chore` | T12 全绿; 若已绿则 commit 仅含测试 |
| **T14** | Feat: 实装 StateController 录制按钮 (替换 T17/Wave1 的 cc.warn stub) | `assets/script/controller/StateController.ts` | T08 | 1.5h | `feat` | recordTrigger 按钮调用 startRecording / stopRecording, 切换标签 |
| **T15** | Feat: StateSelect inspector 工具栏录制按钮 (镜像 ctrl._recording 状态) | `assets/script/controller/StateSelect.ts` | T14 | 1.5h | `feat` | StateSelect 上的录制按钮直接调 ctrl.startRecording/stopRecording |
| **T16** | Feat: 兜底 commit hook (cc.Director EVENT_BEFORE_SCENE_LAUNCH + onDestroy + 跨 ctrl 移动) | `assets/script/controller/StateController.ts`, `assets/script/controller/StateSelect.ts` | T08 | 2.5h | `feat` | 写测试验证 onDestroy 在录制中触发 final commit |
| **T17** | 编辑器实测 checklist (录制贯穿多 state, 切回原 state prop 保留, no-cc-event prop 入库) | `.workflow/active/wave2-recording-capability/MANUAL-TEST-recording.md` (新) | T16 | 1.5h | `chore` | 笔记文件落地, 6+ 测试点全勾 |
| **T18** | Red: ICapability 接口契约 + CapabilityRegistry register/unregister/dispatch | `tests/core/Capability.registry.test.ts` (新) | — | 2h | `test(red)` | 红: Capability / CapabilityRegistry 模块不存在 |
| **T19** | Green: 新增 Capability.ts (ICapability interface) + CapabilityRegistry.ts | `assets/script/controller/Capability.ts` (新), `assets/script/controller/CapabilityRegistry.ts` (新) | T18 | 2.5h | `feat(green)` | T18 全绿 |
| **T20** | Red: PropertyControlCapability 通过 capability 接入 (现有逻辑迁出) | `tests/core/Capability.propertyControl.test.ts` (新) | T19 | 2h | `test(red)` | 红: PropertyControlCapability class 不存在; existing PropertyControlService API 仍可用 (backward compat) |
| **T21** | Green: 抽 PropertyControlCapability (StatePropertyControlService 逻辑包成 capability) | `assets/script/controller/capabilities/PropertyControlCapability.ts` (新) | T20 | 2.5h | `feat(green)` | T20 全绿; PropertyControlService.test 不回归 |
| **T22** | Red: AutoSyncCapability 接入 | `tests/core/Capability.autoSync.test.ts` (新) | T19 | 1.5h | `test(red)` | 红: AutoSyncCapability 不存在; autoSyncEnabled = true 现在通过 capability 提供 |
| **T23** | Green: 抽 AutoSyncCapability | `assets/script/controller/capabilities/AutoSyncCapability.ts` (新) | T22 | 1.5h | `feat(green)` | T22 全绿 |
| **T24** | Red: RecordingCapability 接入 (Topic 3 实装的逻辑改走 capability) | `tests/core/Capability.recording.test.ts` (新) | T19 | 2h | `test(red)` | 红: RecordingCapability 不存在; 走 dispatch onStateWillChange/Changed |
| **T25** | Green: 抽 RecordingCapability (T06-T08 的 onStateWillChange/Changed 改注册到 capability) | `assets/script/controller/capabilities/RecordingCapability.ts` (新) | T24 | 2.5h | `feat(green)` | T24 全绿; Topic 3 e2e 不回归 |
| **T26** | Feat: MigrationCapability 占位 (preset 未实装, name + onCtrlDataMigrate stub) | `assets/script/controller/capabilities/MigrationCapability.ts` (新) | T19 | 1h | `feat` | 占位 capability 注册成功, dispatch onCtrlDataMigrate 不抛 |
| **T27** | Red: 数据隔离 — capability 只能读写 `$$<capName>$$` namespace | `tests/core/Capability.namespace.test.ts` (新) | T19 | 1.5h | `test(red)` | 红: capability ctx 无 namespace 隔离 |
| **T28** | Green: CapabilityContext 提供 namespace 隔离 API | `assets/script/controller/Capability.ts`, `CapabilityRegistry.ts` | T27 | 2h | `feat(green)` | T27 全绿 |
| **T29** | Red: 删掉所有 capability, core 仍能基础切 state (底线测试) | `tests/core/Capability.coreBaseline.test.ts` (新) | T19-T26 | 1.5h | `test(red)` | 红: 当前若依赖 capability 才能切 state, 该测试失败 |
| **T30** | Green/Refactor: 核心切 state 逻辑与 capability 解耦, capability 完全可选 | `assets/script/controller/StateController.ts`, `StateSelect.ts` | T29 | 2h | `refactor` | T29 全绿; 全套 ≥ 414 + 新增数 |
| **T31** | 测试基线确认: 跑全套, 测试总数 ≥ 414 + 本次新增, 0 fail, ≤ 1 skip | `tests/**` | T30 | 0.5h | `test` | `Tests: N passed` N ≥ 414 + new; 落到本 task 的 commit message |

**任务总数: 31** (Topic 3 = T01-T17 共 17 个; Capability = T18-T30 共 13 个; 收尾 T31)

---

## 2. Day 1-9 节奏映射

| Day | Tasks | 累计 effort | 关键产出 |
|---|---|---|---|
| **Day 1** | T01, T02, T03 | ~7.5h | isEqual 契约 + 录制 API 红 |
| **Day 2** | T04, T05, T06 | ~7.5h | _recording 落地 + snapshot 拍/停 |
| **Day 3** | T07, T08, T09 | ~7.5h | 切 state diff commit e2e + outsideRecording 红 |
| **Day 4** | T10, T11, T12, T13 | ~7.5h | 删 250 行 switch + 删 8 hook + 长期 bug 测 |
| **Day 5** | T14, T15, T16, T17 | ~7h | 实装按钮 + 兜底 commit + 编辑器实测 |
| **Day 6** | T18, T19, T20 | ~6.5h | Capability 接口 + 第一个 capability (PropertyControl) red |
| **Day 7** | T21, T22, T23 | ~6.5h | PropertyControl/AutoSync capability 迁完 |
| **Day 8** | T24, T25, T26, T27, T28 | ~9h ⚠️ 可拆 2 天 | Recording capability + Migration 占位 + namespace 隔离 |
| **Day 9** | T29, T30, T31 | ~4h | core baseline 解耦验证 + 全套测试基线 |

⚠️ Day 8 偏重: 若 T25 (RecordingCapability 重构) 触发对 Topic 3 e2e 的回归, T26-T28 推到 Day 9 头。

---

## 3. 风险表

| 风险 | 概率 | 影响 | 触发条件 | 应对 |
|---|---|---|---|---|
| **R1** 删 8 个 cc 事件后, 某些 prop 在 cocos 编辑器内 inspector 上拖拽不再被记录 | 高 | 高 | 用户在编辑器直接拖动节点 (无 setDefaultProp 路径) | T07 e2e 强制覆盖 "拍 snapshot → diff via readControlledPropsFromNode" 全链路; T17 编辑器实测时录入此项 |
| **R2** isEqual 实现遗漏边界 (NaN, undefined, Color alpha) | 中 | 中 | diff 误判, 把无变化也 commit | T01 用例覆盖 6+ 类型, 含 alpha / NaN / undefined |
| **R3** Capability 数据 namespace 与现有 `$$controlledProps$$ / $$propertyData$$` 冲突 | 中 | 中-高 | PropertyControlCapability 改名导致旧 scene 数据读不到 | PropertyControlCapability 沿用 `$$controlledProps$$` 不改名 (向后兼容); 新增 capability 用 `$$<capName>$$` |
| **R4** Recording snapshot 在 cocos 编辑器跨场景切换时残留 | 中 | 中 | EVENT_BEFORE_SCENE_LAUNCH 未挂载 | T16 写测试验证 onDestroy + scene-launch 双路径 |
| **R5** Capability dispatch 在 hot path (切 state) 引入额外开销 | 低 | 低 | for-of capabilities 嵌套 for-of selects | 保持 dispatch O(n), 不引入异步; 监控 batchUpdateUI 时间不变化 |
| **R6** Wave 2 scope creep (顺手实装 Tween / preset) | 中 | 中 | 抽 RecordingCapability 时发现 dispatch hook 缺少返回值改写 | 严格按 ICapability 接口签名定义, MigrationCapability 仅占位不实装; 新发现 bug 进 `BUGS-found-during-wave2.md` |
| **R7** 测试基线 414 漂移 (snapshot test 抖动) | 低 | 中 | T31 跑出 N < 414 | T31 同 PLN-001 R4 — stash 切 master 跑一次确认 414 仍稳 |

---

## 4. Commit 计划

**原则**: 每 task 1 个 commit; 红/绿/重构严格分开; commit message 中文; 写清 red→green 发现路径 (参 `feedback_red_green_tdd.md`)。

```text
T01  test(propHandler): IPropHandler.isEqual 契约暴露 [red]
T02  feat(propHandler): 每个 handler 加 isEqual 方法 [green]
T03  test(recording): StateController._recording API 契约 [red]
T04  feat(stateController): _recording + startRecording/stopRecording [green]
T05  test(recording): StateSelect._snapshot + onRecordingStart 契约 [red]
T06  feat(stateSelect): onRecordingStart/Stop + snapshot 拍/停 [green]
T07  test(recording): 切 state 时 commit diff 持久化 [red, e2e]
T08  feat(stateSelect): onStateWillChange/Changed diff commit + 重拍 [green]
T09  test(recording): 录制外修改不入库 [red]
T10  refactor(stateSelect): 删 setDefaultProp 250 行 switch + _isFromCtrl 标记
T11  refactor(stateSelect): 删 8 个 cc 事件 hook 和 xxxChanged
T12  test(recording): 无 cc 事件的 prop (button/label/widget) 现在能录入 [red→green via T11]
T13  chore: 验证 T12 全绿无遗漏
T14  feat(stateController): 实装录制按钮 (替换 cc.warn stub)
T15  feat(stateSelect): inspector 录制按钮镜像 ctrl._recording
T16  feat(recording): scene-launch + onDestroy + 跨 ctrl 兜底 commit
T17  chore: 编辑器实测 录制重构 checklist
T18  test(capability): ICapability + Registry register/dispatch [red]
T19  feat(capability): 新增 Capability.ts + CapabilityRegistry.ts [green]
T20  test(capability): PropertyControlCapability 接入 [red]
T21  feat(capability): 抽 PropertyControlCapability [green]
T22  test(capability): AutoSyncCapability 接入 [red]
T23  feat(capability): 抽 AutoSyncCapability [green]
T24  test(capability): RecordingCapability 接入 [red]
T25  feat(capability): 抽 RecordingCapability [green]
T26  feat(capability): MigrationCapability 占位
T27  test(capability): namespace 数据隔离契约 [red]
T28  feat(capability): CapabilityContext namespace 隔离 [green]
T29  test(capability): 删全部 capability core 仍能切 state [red]
T30  refactor(core): core 切 state 逻辑与 capability 解耦
T31  test: 全套确认基线 ≥ 414 + 新增, 0 fail
```

**禁止**:
- 红 + 绿混在一个 commit (违反 feedback_red_green_tdd)
- 跨 task 合并 commit (除非显式标注 + 在 task 表里登记)
- `--no-verify` 跳钩子

---

## 5. 出 Wave 2 验收

- [ ] 31 个 task 全部完成, 各有独立 commit
- [ ] `cd tests && npx jest --config jest.config.js` 通过, 测试数 ≥ 414 + 本次新增 (粗算 +20 ~ +30)
- [ ] StateSelect.ts 净瘦身 ≥ 80 行 (删 250 行 switch + 8 hook 后, 加 snapshot 逻辑 ~ -80 净)
- [ ] `ICapability` 接口最终形态文档化在 PLN-002 末尾 (T30 后填)
- [ ] 编辑器实测 checklist (T17) 6+ 项目全勾
- [ ] `BUGS-found-during-wave2.md` (如有发现) 落地
- [ ] 分支 `wave2/recording-capability-framework` 干净, 不动 master, 不 push

---

## 6. ICapability 最终形态 (T30 完成后回填)

```ts
// assets/script/controller/Capability.ts

/** 通用 dispatch context. 各 capability 自己负责从 ctx 取所需字段 */
export interface CapabilityContext {
    ctrl?: any;                       // 派发来源控制器
    select?: any;                     // 涉及的 StateSelect
    fromState?: number;               // StateWillChange / StateChanged
    toState?: number;
    propType?: EnumPropName;          // onPropApply 上下文
    propValue?: TPropValue;
    extra?: { [key: string]: unknown };
    /** 给定 propData, 返回 $$<capName>$$ 子对象 (CapabilityRegistry.dispatch 自动注入) */
    namespace?: (propData: any, capName: string) => { [key: string]: unknown };
}

/** Capability 接口 (所有 hook 都可选) */
export interface ICapability {
    name: string;                                           // 命名空间唯一 key
    dependsOn?: string[];                                   // 依赖 (Wave 2 仅声明用)
    onStateWillChange?(ctx: CapabilityContext): void;
    onStateChanged?(ctx: CapabilityContext): void;
    onPropApply?(ctx: CapabilityContext, prop: { type: EnumPropName, value: TPropValue }): TPropValue | void;
    onRecordingStart?(ctx: CapabilityContext): void;
    onRecordingStop?(ctx: CapabilityContext): void;
    onCtrlDataMigrate?(data: unknown, version: number): unknown;
}
```

**CapabilityRegistry API**:
- `register(cap: ICapability): void` — 同名覆盖
- `unregister(name: string): void`
- `get(name: string): ICapability | undefined`
- `list(): ICapability[]` — 注册顺序
- `clear(): void` — 测试用
- `dispatch(event, ctx): unknown[]` — 同步遍历, 缺 hook 跳过, 异常 catch 走 StateErrorManager.warn, 返回每个 hook 的返回值数组

**已注册 capability (Wave 2)**:
- `propertyControl` — 包装 StatePropertyControlService
- `autoSync` — 包装 autoSyncEnabled 全局开关
- `recording` — Topic 3 录制路径的对外接口 (核心逻辑仍在 StateController/StateSelect)
- `migration` — 占位, Wave 4 实装迁移逻辑

**Wiring 点** (StateController):
- `startRecording / stopRecording` → `dispatch("onRecordingStart" / "onRecordingStop")`
- `selectedIndex setter` 切 state 前/后 → `dispatch("onStateWillChange" / "onStateChanged")`

---

--- COMPLETION STATUS ---
STATUS: DONE
NOTES:
- 31 个 task 全部完成, 各有独立 commit
- 测试基线: 入分支 414 → 出分支 478 / 1 skipped / 0 fail (+64)
- StateSelect.ts 净瘦身: 2720 → 2550 (-170 行); 删 setDefaultProp 295 行 switch + 8 hooks + _isFromCtrl ~365 行, 加 prefab diff 路径 (snapshot/commitDiff/onRecordingStart/Stop/onStateWillChange/Changed/commitPropFromNode) ~195 行
- 长期 bug 修复: Button.interactable / Label.string / Widget.top 等无 cc 事件的 prop 现在能录入
- Capability 框架已落地: ICapability 接口 + Registry + 4 个内置 capability (PropertyControl / AutoSync / Recording / Migration)
- Core 与 capability 完全解耦: T29 baseline 验证 unregister 全部 capability 后 core 仍能切 state / 录制 / togglePropertyControl
- 编辑器实测 checklist 留给用户在 cocos 中验证 (.workflow/active/wave2-recording-capability/MANUAL-TEST-recording.md)
- 已发现 bug: 无 (.workflow/active/wave2-recording-capability/BUGS-found-during-wave2.md 仍为空)
