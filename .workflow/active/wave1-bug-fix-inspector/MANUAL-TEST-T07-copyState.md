# T07 · 编辑器实测 checklist: copy state bug 修复

> 对应 PLN-001 任务 T07。无代码变更, 本文件作为 commit artifact 标记 checklist 已准备, 等用户在 cocos 编辑器中实测。

## 前置

- 分支: `wave1/topic2a-stage1a`
- 已含 T04 (Bug A 修, insertIndex = index+1) + T05/T06 (Bug B 修, pageData 深拷贝)
- 测试基线: 400 passed / 1 skipped

## 实测场景

### 场景 1: Bug A — 插入位置正确

1. 打开 Scene3 (或 Scene5), 选中带 StateController 的节点
2. 给 controller 加 3 个 state: `normal`, `hover`, `pressed` (或保留默认 2 个 + 加 1 个)
3. selectedIndex 设为 `hover` (index = 1)
4. 勾选 inspector 中 `duplicateCurrentState` (或对应 "复制当前状态" 按钮)

**期望**:
- [ ] 新 state 名为 `hover_copy`
- [ ] state 列表顺序变为 `[normal, hover, hover_copy, pressed]`
- [ ] selectedIndex 自动跳到 `hover_copy` (index = 2)
- [ ] 不再出现"插到末尾"(`[normal, hover, pressed, hover_copy]`) 的旧 bug

### 场景 2: Bug B — pageData 深拷贝

1. 同一 controller 下挂 1 个 StateSelect, 勾选 Color 属性 (togglePropertyControl)
2. state 0 设 Color 为 RED (255,0,0), 点 setDefault / 或直接改 node.color
3. state 1 设 Color 为 BLUE (0,0,255), setDefault
4. 选中 state 1, 触发复制
5. 切换到新生成的 state 2 (`2_copy`)

**期望**:
- [ ] 新 state 2 节点显示为 BLUE (不是 RED, 不是空)
- [ ] 切回 state 0, 节点仍为 RED (源数据未被串改)
- [ ] 切到 state 1, 节点仍为 BLUE
- [ ] 在 state 2 改 Color 为 GREEN, 切回 state 1 仍为 BLUE (深拷贝隔离)

### 场景 3: 多 StateSelect 场景

1. 在同一 ctrl 节点下挂 2+ 个 StateSelect (兄弟节点也可, 嵌套也可)
2. 每个 select 勾不同属性 (一个管 Color, 一个管 Position)
3. 复制 state 1

**期望**:
- [ ] 两个 select 的 pageData 都正确扩容到 length=newLength
- [ ] 切到新 state 后, 两个属性都从 state 1 深拷贝过来
- [ ] 改新 state 的属性不影响 state 1 (深拷贝隔离)

### 场景 4: 老 scene 兼容

1. 用 master 分支保存的旧 scene (无 EnumUpdateType.Copy 概念) 打开
2. 在 inspector 中正常操作 (切 state, 改 prop)

**期望**:
- [ ] 不报错
- [ ] 字段值与旧 scene 一致
- [ ] 复制操作工作正常

## 出口标准

- 上述所有 [ ] 全部勾选 = T07 通过
- 任意失败 → 登记到 `BUGS-found-during-wave1.md` (不在本 wave 修, 视严重度排入 Wave 1.5/Wave 2)

## 状态

- [ ] **待用户在 cocos 中执行**
- 准备时间: 2026-05-20
- 估计实测耗时: 1.5h (含 4 个场景 + 截图)
