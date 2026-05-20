# T24 · 编辑器实测 checklist: Inspector 极简形态

> 对应 PLN-001 任务 T24。无代码变更, 本文件作为 commit artifact 标记 checklist 已准备, 等用户在 cocos 编辑器中按行勾选。

## 前置

- 分支: `wave1/topic2a-stage1a`
- 已含 T10-T13 (4 个 props 类 @property visible:false), T14-T18 (StateController inspector 极简), T19-T22 (StateSelect inspector 极简)
- 测试基线: 414 passed / 1 skipped / 19 suites

## 实测场景

### 场景 A: StateController inspector 极简形态

新建 / 打开包含 StateController 的节点, inspector 中应看到:

- [ ] **可见**: `name` (ctrlName, 文本框)
- [ ] **可见**: `selectedState` (selectedIndex 下拉, 默认 EnumStateName 列表)
- [ ] **可见**: `当前状态` (currentStateLabel, readonly, 形如 "0. 1")
- [ ] **可见**: `🔴 录制状态` (recordTrigger, 按钮 stub)
- [ ] **可见**: `⚙️ 打开 Panel` (openPanelTrigger, 按钮 stub)
- [ ] **不可见**: `刷新检查器` (manualRefreshTrigger)
- [ ] **不可见**: `状态上移` / `状态下移` (moveStateUp/Down)
- [ ] **不可见**: `复制当前状态` (duplicateCurrentState)
- [ ] **不可见**: `删除当前状态` (deleteCurrentState)
- [ ] **不可见**: `_states` / `_selectedIndex` / `_ctrlName` 原始字段
- [ ] **不可见**: `ctrlId` / `stateIdAuto` / `_historyStateName` 内部字段

点击按钮:
- [ ] 点 `🔴 录制状态` → console 出现 `[StateController] 录制功能尚未实现, 等待 Wave 2/3 panel 接入。`
- [ ] 点 `⚙️ 打开 Panel` → console 出现 `[StateController] panel 尚未实现, 等待 Wave 2 Gemini 委托交付。`
- [ ] 切换 `selectedState` 下拉 → 节点表现按 state 变化 (active/color/position 等)
- [ ] `当前状态` 文本随 selectedState 切换而更新

### 场景 B: StateSelect inspector 极简形态

新建 / 打开包含 StateSelect 的节点, inspector 中应看到:

- [ ] **可见**: `当前状态属性` (currentStateProps, readonly, 字符串数组列表)
- [ ] **可见**: `🔴 录制状态 (select)` (recordTrigger, 按钮 stub)
- [ ] **可见**: `⚙️ 打开 Panel (select)` (openPanelTrigger, 按钮 stub)
- [ ] **不可见**: `Ctrl Name` (currCtrlId 下拉)
- [ ] **不可见**: `控制器当前状态` (ctrlState 下拉)
- [ ] **不可见**: `🔸 当前属性值` (propValue)
- [ ] **不可见**: 工具按钮分组 (toolsProps, 含 6 个 button stub)
- [ ] **不可见**: 节点属性分组 (nodeProps, 8 个 prop 复选框)
- [ ] **不可见**: 组件属性分组 (componentProps, 18 个 prop 复选框)
- [ ] **不可见**: Widget属性分组 (widgetProps, 20 个 prop 复选框)
- [ ] **不可见**: `_propKey` / `_propValue` / `_currentDisplayProp` 等内部字段

`currentStateProps` 内容检查:
- [ ] 没勾任何 prop 时, 列表为空 (或显示 "[]" / 空)
- [ ] 勾了 Color 并切到 state 0 后, 列表显示 `"Color: rgba(...)"` 形态字符串
- [ ] 切换 selectedIndex 后, currentStateProps **不自动刷新**(契约: 用户主动刷新 inspector 才更新, 由 plugin 暴露的"刷新检查器"操作触发)

点击按钮:
- [ ] 点 `🔴 录制状态 (select)` → console 出现 `[StateSelect] 录制功能尚未实现, 等待 Wave 2/3 panel 接入。`
- [ ] 点 `⚙️ 打开 Panel (select)` → console 出现 `[StateSelect] panel 尚未实现, 等待 Wave 2 Gemini 委托交付。`

### 场景 C: 老 scene 加载兼容性

打开 master 分支保存的旧 scene (Scene3.fire / 未命名.fire 等):

- [ ] 节点 inspector 无报错
- [ ] StateController._states 老数据完整加载 (state 名 / state id 与 master 分支保存时一致)
- [ ] StateSelect._ctrlData 老数据完整加载 (各 state 各 prop 值不丢)
- [ ] selectedIndex 默认值正确, 节点表现正常
- [ ] 切换 state → 节点表现按老数据切换 (不退化为 default 同步)

### 场景 D: 老 scene 修改后保存

- [ ] 在场景 C 基础上, 改 `name` 或 `selectedState` 下拉, 保存 scene
- [ ] 关闭 cocos 再打开, 字段值保留 (visible:false 没有破坏序列化)
- [ ] 用 master 分支再打开同一个 scene, 看是否能继续编辑 (理想: yes, 字段名未改, 仅 visibility 改了)

### 场景 E: copy state + currentStateProps 联动

承接 T07 实测:
- [ ] 复制 state 1 (BLUE Color) → 新 state 2 的 `当前状态属性` 应显示 `"Color: rgba(0,0,255,255)"`
- [ ] 在 state 2 修改 color 为 GREEN, 切回 state 1, currentStateProps 应仍为 BLUE (深拷贝隔离)

## 出口标准

- 上述所有 [ ] 全部勾选 = T24 通过
- 任意未通过 → 登记到 `BUGS-found-during-wave1.md`, 评估后纳入 Wave 1.5 冷静期或 Wave 2 修, 不在 Wave 1 内修

## 状态

- [ ] **待用户在 cocos 中执行**
- 准备时间: 2026-05-20
- 估计实测耗时: 2.5h (含 5 个场景 + 截图存档)
- 实测后请把发现的"非预期 cocos 行为"写到 v1.0 brief 的 "编辑器实测约束" 节
