# 编辑器操作引导

用户在 Cocos Creator 2.4 编辑器里怎么操作 `StateControllerV2` / `StateSelectV2`。
**每节末尾的「真源」指向代码 `file:函数` 与测试**——回答用户时若 UI 细节拿不准，去读真源核实，别凭记忆编造点击路径（编辑器 UI 是最容易幻觉的地方）。

> 内容随包版本走；改了面板/组件行为要连带更新本文。inspector DOM 注入与面板交互**无 jest 覆盖，须真编辑器 e2e 验证**。

## 两个操作界面

| 界面 | 入口 | 适合 |
|---|---|---|
| **inspector 折叠组** | 选中挂了 StateControllerV2 / StateSelectV2 的节点，看属性检查器 | 单组件就近操作（录制、排除、状态操作、回收站、值搬运） |
| **state-controller-v2-panel 面板** | 编辑器面板菜单打开 | 全场景观测、跨控制器联动、值矩阵总览 |

很多操作两边都能做（录制、状态 CRUD、回收站）。下面按**操作主题**讲，标注每个界面怎么走。

---

## 面板三视图（state-controller-v2-panel）

面板根 `#app.panel-shell`，顶部三个 tab 切换（`logic.js:switchView`）：

- **总览 `#view-overview`** —— 全场景控制器观测：仪表盘（每控制器当前状态 `renderDashboard`）、拓扑树（控制器→成员节点→受控属性 `renderTopology`，属性按 tracked/loose/excluded/mixed 着 `kind-badge`）、值矩阵（属性×状态 `renderMatrix`，点状态列头切状态、点属性名开详情抽屉）、异常清单（`renderIssues` 列 loose/excluded/mixed，一键定位）。编辑器里选中场景节点 → 总览自动展开滚到对应成员（`_reverseHighlight`）。
- **编辑 `#view-editor`** —— 单控制器操作：控制器选择（`#ctrl-switch-select` 下拉 / 前后箭头 `setCurrentCtrl`）、状态选择（`#state-pick-select` / 侧栏 `#states-list` → `_goState`）、新增/删除状态、录制三连、编辑期值矩阵 + 取消跟随、回收站、Inspector 增强开关。
- **联动 `#view-bindings`** —— 跨控制器联动：表单四下拉（源控制器/源状态/目标控制器/目标状态）+「+ 添加联动」（`_addBindingFromForm`）；关系图按源控制器分组列边，「✕」删边（`_removeBinding`）。

面板↔场景全走 `_callScene(method, payload, cb)`（`logic.js:134` → `Editor.Scene.callSceneScript` → `scene-accessor.js` 同名 handler → `lib/handlers.js` 纯函数）。写操作后场景广播 `on-data-changed` + `scene:set-dirty`，面板自动刷新。

**真源**：`panel/logic.js`、`panel/template.html`、`lib/handlers.js`、`scene-accessor.js`；测试 `tests/panel/handlers.test.ts`、`inspectorStateValues.test.ts`、`sceneAccessor.smoke.test.ts`。

---

## 录制状态

把"在节点上直接拖属性"的改动录进当前 state，免手填。

- **inspector**：StateControllerV2/StateSelectV2 的「🔴 录制」折叠组点录制开关（布尔触发器，点亮=录制中，再点=停止）。两个组件共享同一录制态。
- **面板（编辑视图）**：`.record-actions` 的 `#btn-start-record`「🔴 录制」/ `#btn-stop-record`「⏹ 停止并保存」/ `#btn-cancel-record`「⤺ 撤销本次录制」。
- **进录制**：若已跟随 prop 与当前 state 存值不一致，弹窗三选一（保存到当前 state / 丢弃恢复 / 取消）。
- **录制中**：改已跟随 prop 即被记录；走 prefab diff 路径（不靠 cc 事件），`button.interactable`/`label.string`/`widget.top` 等无事件 prop 也能录。
- **停止**：commit 进当前 state；若有"录制期间改了但未跟随"的 prop，弹窗问是否追加跟随。
- **切 state 自动停录**：录制中直接切 state，会先把改动 commit 到 fromState 再切（静默，不弹窗）。
- **撤销录制**：面板有 `#btn-cancel-record`；inspector 折叠组**已移除取消按钮**，改用编辑器原生 `Ctrl+Z` 撤销整次录制。

**注意/不变量**：`_recording` 不序列化，重开编辑器后回 false；录制中**禁止改状态结构**（增删/重排/改名/复制/删除当前状态都被拒并 warn，需先停录）；停止与取消时**被排除的 prop 都还原到录制前**（排除=录制期间完全不影响）。

**真源**：`StateControllerV2.ts:recordTrigger`(setter)/`startRecording`/`stopRecording`/`cancelRecording`、`StateSelectV2.ts:onRecordingStop`/`commitRecordingDiff`；`RecordingCapability.ts`（对外查询/广播 hook）；`handlers.js:set-recording`/`cancel-recording`。测试 `tests/core/Recording.*.test.ts`（controller/snapshot/modelZ/fallbackCommit/cancel/cancelExcludedDirty/noEventProps/stateSwitch.e2e）、`Capability.recording.test.ts`。

---

## 状态 CRUD

- **新增**：inspector states 数组点 `+` / 面板编辑视图 `#btn-add-state`「+ 新增状态」。新项自动智能命名 + 分配自增 stateId（全程唯一，重名加 `_i` 后缀）。
- **删除（软删→回收站）**：inspector「状态操作」组"删除当前状态" / states 数组项 `×` / 面板状态条目 `.btn-del-state`「✕」（需 confirm）。删除是**软删**：移出活跃列表但 stateId 数据保留进回收站，可恢复。**至少保留一个状态**（length≤1 拒删）。
- **重命名**：inspector states 数组直接编辑 name；改回默认名（index+1）会清历史命名。
- **复制**：inspector「状态操作」组"复制当前状态"。新名 `<原名>_copy`，分配新 stateId，深拷属性数据并选中新状态。
- **上移/下移**：inspector「状态操作」折叠组（`moveStateUp`/`moveStateDown`）。

**真源**：`StateControllerV2.ts` states setter / `removeSelectedState` / `copySelectedState` / `adjustSelectedStateOrder` / `ensureUniqueStateIds`；`handlers.js:add-state`/`remove-state`。测试 `tests/core/StateController.crud.test.ts`/`deleteState.test.ts`/`copyState.test.ts`/`recycleBin.test.ts`、`StateSelect.copyClonePreservesType.test.ts`、`handlers.test.ts`。

---

## 回收站（软删状态暂存区）

- **入口**：inspector StateControllerV2「回收站」折叠组 / 面板编辑视图侧栏 `#recycle-bin`。
- **恢复**：选回收项 → 追加到状态列表尾部并选中（数据以 stateId 寻址，软删时从未清理，恢复即接回 `_ctrlData[stateId]`）。
- **彻底删除/清空**：硬删，**弹窗二次确认**（cancelId 默认取消防误删）。硬删后即使恢复同 stateId 数据也不复活。
- **只读预览**：恢复前预览回收态长什么样（叠加到节点显示，不改 selectedIndex/不标脏）；切激活态/录制/销毁/切场景等任何出口都先精确还原；录制中不允许进入预览。

**真源**：`StateControllerV2.ts:recycleRestorePick`/`restoreDeletedState`/`recyclePurgePick`/`purgeDeletedState`/`recyclePurgeAll`/`recyclePreviewPick`/`previewDeletedState`/`exitPreview`；`handlers.js:restore-deleted-state`/`purge-deleted-state`/`purge-all-deleted-states`/`preview-deleted-state`/`exit-preview`。测试 `tests/core/StateController.recycleBin.test.ts`、`handlers.test.ts`（回收站系列）。

---

## @property 跟随与排除

控制哪些属性随状态切换变化。

- **批量纳入**：`autoConfigureAllProperties()` 一次性启用节点上所有可跟踪 prop（`scanAvailableProperties` 判定可用性；不列 `Non(0)` 占位枚举，空白节点恒列 8 个 cc.Node 基础 prop）。
- **排除某 prop**：两条入口——(1) inspector StateSelectV2「排除管理」折叠组的 `+ 添加排除` 下拉（从当前跟随中选一个，选中即加入排除清单）；(2) inspector 属性行左侧灰方块徽标上点击发 `inspector-toggle-exclude`。排除后该 prop 值不再随 state 变、不进 ctrlData。
- **恢复跟随**：「排除管理」的用户排除清单数组用 cocos 原生 `-` 删项（删项=重新跟随，别直接编辑文本）；或已排除行徽标再点一次 unexclude。`SYSTEM_EXCLUDE` 部分不可恢复（只读展示）。
- **面板取消跟随**：编辑视图值矩阵行尾 `.em-cancel`「✕」→ `remove-property`。面板**没有**手动"+ 添加属性"按钮（`add-property` handler 存在但 UI 只通过录制自动跟随）。

**注意/不变量**：受控标记写在历史命名空间 `$$controlledProps$$`、用户排除存 `_userExcludedProps`（不改 key/路径，避免老 scene 反序列化丢失）；`addExcludeTrigger` 的动态下拉选项用 `setClassAttr` 注入到**类**（`SelectExcludeGroup`）而非实例；`setPropExcluded` 幂等；`cc.Node.x` 等内置 propRef 同样可排除/恢复。

**真源**：`StateSelectV2.ts:autoConfigureAllProperties`/`togglePropertyControl`/`setPropExcluded`/`reconcileUserExcluded`/`excludedPropsDisplay`、`PropertyControlCapability.ts:scanAvailableProperties`、`props/SelectInspectorGroups.ts:SelectExcludeGroup`；`inspector-inject.js:onClick`、`scene-accessor.js:inspector-toggle-exclude`、`handlers.js:remove-property`/`add-property`。测试 `tests/core/StateSelect.setPropExcluded.test.ts`、`StateSelect.scanProps.test.ts`、`W6.inspectorExcludeUI.test.ts`、`PropertyControlService.test.ts`、`Capability.propertyControl.test.ts`。

---

## inspector 状态标记（徽标着色）

在原生属性检查器每行左侧贴状态机身份徽标，一眼看出受控/排除/脏值。**自动渲染，无需点击**（选中单个挂 StateSelectV2 的节点即生效）：

- 灰方块带斜杠 = 已排除；粉三角 = 掉出控制(loose)；黄半方块 = 部分子项未受控(mixed)；蓝菱 = 状态机驱动；蓝菱套黄菱 = 当前 state 覆盖 default；黄左边框 = 录制脏值。
- 鼠标悬停徽标弹**多状态值表**（自定义 div 浮层，非原生 title——原生 title 慢）。
- 多选（>1 节点）或总开关关时清掉所有标记；全 tracked 的行不标。心跳 1.5s 重发现，dock 重建后自动重连。
- 总开关 + 子开关（可视化/脏值/排除徽标）在面板编辑视图 `#editor-actions`，走 `sendToMain`（main.js，Editor.Profile 持久化），**非** `_callScene`。

**真源**：`inspector-inject.js:updateRowStatus`/`apply`/`compIndexOfRow`/`buildTipHTML`、`scene-accessor.js:inspector-prop-status`(`rowKind` 分类)/`inspector-prop-state-values`、`main.js:inspector-mark-on`/`inspector-set-flags`；`StateSelectV2.ts:currentStateProps`。测试 `tests/core/StateSelect.inspector.test.ts`、`StateController.inspector.test.ts`（DOM 注入须 e2e）。

---

## 多控制器联动

声明"控制器 A 切到状态 X → 控制器 B 自动切到状态 Y"，可序列化进 .fire/.prefab。

- **操作**：面板联动视图表单四下拉 + 「+ 添加联动」；关系图「✕」删边。inspector 不直显联动（行为在组件，UI 在面板）。
- **机制**：用 `targetCtrlId`(数字) 代替对象引用以便序列化，存进 `_bindingsData`（visible:false）；运行时 `start()` 按 id 解析（onLoad 全登记后，不受加载顺序影响）。
- **不变量**：同 (sourceStateId,targetCtrl) 重复 add 覆盖；A→B→A 循环防护（单帧 `dispatching` 标志）；目标 ctrlId 未加载时跳过不抛。

**真源**：`StateControllerV2.ts:addBinding`/`removeBinding`/`rehydrateBindings`、`MultiCtrlBindingCapability.ts:addBinding`/listener、`scene-accessor.js:add-binding`/`remove-binding`、`logic.js:_addBindingFromForm`/`_removeBinding`。测试 `tests/core/StateController.bindings.test.ts`/`multiCtrl.test.ts`、`Capability.multiCtrlBinding.test.ts`、`StateSelect.r3_multiCtrl.test.ts`。

---

## 状态切换（稳定 stateId vs 临时 index）

- **UI**：改控制器的 state 下拉（inspector `selectedIndex` / 面板 `_goState`，有 stateId 走 `set-state-by-id`，否则 `set-selected-index`）。
- **业务/panel 代码**：用稳定 API `SelectedPageIdCapability.setStateById(ctrl, stateId)` 切、`getSelectedStateId(ctrl)` 读。`selectedIndex` getter/setter 已 `@deprecated`，业务层禁止直接读写 index（reorder/delete 后会漂移）；reorder 后 `getSelectedStateId` 跟着原 state 走。

**真源**：`SelectedPageIdCapability.ts:setStateById`/`getSelectedStateId`/`listAllStates`、`StateControllerV2.ts:selectedIndex` setter。测试 `tests/core/Capability.selectedPageId.test.ts`。

---

## 值搬运（StateSelectV2 单节点跨 state）

inspector StateSelectV2「值搬运」折叠组：「⇄ 与下一 state 交换值」(`swapValueWithNext`) / 「⎘ 复制值到下一 state」(`copyValueToNext`，深拷)。越界/最后一个 state 触发 next 为安全 noop，from===to 为 noop。

**真源**：`StateSelectV2.ts:swapValueWithNext`/`copyValueToNext`/`swapStateValues`/`copyStateValues`。测试 `tests/core/StateSelect.localStateValueOps.test.ts`。
