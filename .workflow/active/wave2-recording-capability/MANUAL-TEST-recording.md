# 编辑器实测 checklist · Wave 2 Topic 3 录制重构

> 该文件无代码变更, 仅笔记 (T17)。
> 测试环境: Cocos Creator 2.4.13 + 本仓库 Scene3 / Scene4 / Scene5。

## 1. 录制 happy path

- [ ] 打开 Scene4, 选中带 StateController 的节点
- [ ] inspector 看到 "🔴 录制状态" 按钮 (现在不再是 stub, 不再 `cc.warn`)
- [ ] 点击按钮 → recordTrigger / isRecording = true
- [ ] 拖动子节点的 Position / Color / Size → ctrlData[state0] 应记录变化 (用 console 检查 select._ctrlData)
- [ ] 切到 state1 → 切前自动 commit 当前 state0 的 diff; state1 节点 prop apply
- [ ] 在 state1 改 Position → ctrlData[state1] 记录变化
- [ ] 切回 state0 → 节点 prop 回到 state0 的录制值

## 2. 长期 bug 修复验证 (无 cc 事件的 prop)

- [ ] 节点上加 cc.Button 组件, 勾上 ButtonInteractable
- [ ] 录制中, 把 Button.interactable 切 false → 切 state → 切回; interactable 应保持 false
  - 旧路径下 cc.Button 无 `interactable-changed` 事件, 录制不到, Wave 2 prefab diff 修复
- [ ] 节点上加 cc.Label 组件, 勾上 LabelString
- [ ] 录制中改 Label.string → 切 state → 切回; string 应保留
- [ ] 节点上加 cc.Widget 组件, 勾上 WidgetTop
- [ ] 录制中改 Widget.top → stopRecording; top 应保留

## 3. 兜底 commit 验证

- [ ] 录制中不点 stop, 直接 Ctrl+S 保存场景 → 不应丢数据 (EVENT_BEFORE_SCENE_LAUNCH 自动 stop)
- [ ] 录制中销毁 StateController 节点 → final diff 应已 commit (onDestroy 兜底)
- [ ] 录制中把 StateSelect 节点拖到另一个 ctrl 下 → 数据已写到 oldCtrl 再迁移到 newCtrl

## 4. inspector UI

- [ ] StateController inspector 的 "🔴 录制状态" 按钮文字 / 状态正确切换
- [ ] StateSelect inspector 的 "🔴 录制状态 (select)" 按钮镜像 ctrl 状态 (同时 toggle 一致)
- [ ] 录制态下点击按钮 → 退出录制态; 非录制态下点击 → 进入录制态

## 5. 录制外不入库

- [ ] 非录制态下, 拖动节点 Position → ctrlData 不应改变
- [ ] 非录制态下, 改 Color → ctrlData 不应改变 (这是 Wave 2 核心: 不再因为 cc 事件就自动写入)

## 6. 与 copyState / multiSelect 兼容

- [ ] 录制中复制 state → 复制成功, prop 携带 (T07 链路确认)
- [ ] 录制中切 state, 多 select 同时记录: 验证每个 select 的 ctrlData 各自 commit, 不串扰

## 已发现 bug

(见 `BUGS-found-during-wave2.md`)

## 结论

(用户实测后填写)
