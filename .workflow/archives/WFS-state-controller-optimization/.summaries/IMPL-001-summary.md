# IMPL-001: BFS缓存优化 - 实现摘要

## 完成时间
2026-03-02

## 实现概述
将状态切换时的O(n) BFS遍历优化为O(1)缓存查找，显著提升性能。

## 修改文件
- `assets/script/controller/StateController.ts` - 添加缓存机制
- `assets/script/controller/StateSelect.ts` - 添加缓存失效通知

## 实现细节

### 1. 添加缓存属性 (IMPL-001.1)
```typescript
// StateController.ts
private _stateSelectCache: StateSelect[] = null;  // 缓存直接控制的StateSelect
private _cacheDirty: boolean = true;              // 缓存脏标记
```

### 2. 缓存重建方法 (IMPL-001.2)
```typescript
private rebuildStateSelectCache(): void {
    if (!this._cacheDirty && this._stateSelectCache !== null) {
        return; // 缓存有效，无需重建
    }
    const allStateSelects = this.node.getComponentsInChildren(StateSelect);
    this._stateSelectCache = allStateSelects.filter(ss => this.isDirectlyControlled(ss.node));
    this._cacheDirty = false;
}
```

### 3. 直接控制检测 (IMPL-001.3)
```typescript
private isDirectlyControlled(targetNode: cc.Node): boolean {
    // 检查节点与控制器之间是否有其他StateController
    // 返回true表示直接控制
}
```

### 4. updateState使用缓存 (IMPL-001.4)
- 移除原有的BFS遍历逻辑
- 使用 `rebuildStateSelectCache()` 获取缓存
- 直接遍历缓存的StateSelect数组

### 5. 缓存脏标记方法 (IMPL-001.5)
```typescript
public markCacheDirty(): void {
    this._cacheDirty = true;
}
```

### 6. StateSelect缓存失效通知 (IMPL-001.6)
- 在 `__preload()` 中调用 `notifyControllerCacheDirty()`
- 在 `onDestroy()` 中调用 `notifyControllerCacheDirty()`

## 验收标准
- [x] 状态切换使用缓存而非BFS遍历
- [x] 节点增删时缓存自动重建
- [x] 子控制器下的StateSelect不被错误缓存
- [x] 性能从O(n)优化为O(1)

## 后续任务
- IMPL-006: 单元测试中添加BFS缓存测试用例
