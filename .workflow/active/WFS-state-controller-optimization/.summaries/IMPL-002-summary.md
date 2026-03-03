# IMPL-002: selectedPage修复 - 实现摘要

## 完成时间
2026-03-02

## 实现概述
解决"设置状态时selectedPage不会及时更新"的问题，通过添加变更通知机制确保编辑器界面及时刷新。

## 修改文件
- `assets/script/controller/StateController.ts`

## 实现细节

### 1. 触发变更通知 (IMPL-002.1)
在 `selectedIndex` setter 中添加 `_emitSelectedPageChanged()` 调用：
```typescript
if (CC_EDITOR) {
    this.updateState(EnumUpdataType.Prop);
    // 🔧 IMPL-002.1: 触发selectedPage变更通知
    this._emitSelectedPageChanged();
}
```

### 2. 实现变更通知方法 (IMPL-002.2)
```typescript
private _emitSelectedPageChanged(): void {
    if (!CC_EDITOR) return;
    // 触发编辑器刷新（延迟一帧确保数据已更新）
    setTimeout(() => {
        if (this.node && this.node.isValid) {
            this.forceRefreshInspector();
        }
    }, 0);
}
```

### 3. 公共刷新方法 (IMPL-002.3)
```typescript
public refreshSelectedPage(): void {
    if (!CC_EDITOR) return;
    this._emitSelectedPageChanged();
}
```

### 4. 调试日志 (IMPL-002.4)
在 `selectedPage` getter 中添加调试日志：
```typescript
StateErrorManager.debug("获取selectedPage", {
    component: "StateController",
    method: "selectedPage.getter",
    params: { selectedIndex: this._selectedIndex, statesCount: this._states.length },
});
```

## 验收标准
- [x] 状态切换后selectedPage立即更新
- [x] refreshSelectedPage()方法可正常调用
- [x] 调试日志正确输出状态信息
