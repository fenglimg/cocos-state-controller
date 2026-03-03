# 状态控制器优化实施计划

## 总览

| 序号 | 优化项 | 工作量 | 风险 | 优先级 |
|------|--------|--------|------|--------|
| 1 | BFS缓存优化 | 2-3天 | 低 | P0 |
| 2 | selectedPage修复 | 0.5天 | 低 | P0 |
| 3 | 智能属性推断 | 2-3天 | 低 | P1 |
| 4 | 属性监听器 | 2-4天 | 中 | P1 |
| 5 | 数据结构优化 | 3-5天 | 中 | P2 |
| 6 | 单元测试 | 3-5天 | 低 | P2 |

---

## 1. BFS缓存优化

### 📍 修改文件
- `StateController.ts`

### 🎯 目标
将状态切换时的O(n)遍历优化为O(1)缓存查找。

### 📝 实现步骤

#### Step 1: 添加缓存属性
```typescript
// StateController.ts - 在类属性区域添加

/** 🔧 性能优化：StateSelect组件缓存 */
private _stateSelectCache: StateSelect[] = null;

/** 🔧 性能优化：缓存是否需要重建 */
private _cacheDirty: boolean = true;
```

#### Step 2: 实现缓存构建方法
```typescript
// StateController.ts - 添加新方法

/** 🔧 性能优化：构建StateSelect组件缓存 */
private rebuildStateSelectCache() {
    this._stateSelectCache = [];
    this._cacheDirty = false;

    // 使用getComponentsInChildren一次性获取所有StateSelect
    const allSelects = this.node.getComponentsInChildren(StateSelect);

    for (const select of allSelects) {
        // 只缓存属于当前控制器的StateSelect
        // 检查是否在子控制器之前（避免跨控制器污染）
        if (this.isDirectlyControlled(select.node)) {
            this._stateSelectCache.push(select);
        }
    }

    StateErrorManager.debug("StateSelect缓存已重建", {
        component: "StateController",
        method: "rebuildStateSelectCache",
        params: { cachedCount: this._stateSelectCache.length }
    });
}

/** 🔧 性能优化：检查节点是否被当前控制器直接控制 */
private isDirectlyControlled(targetNode: cc.Node): boolean {
    let current = targetNode.parent;

    while (current && current !== this.node) {
        // 如果遇到另一个StateController，则不是直接控制
        if (current.getComponent(StateController)) {
            return false;
        }
        current = current.parent;
    }

    return current === this.node;
}

/** 🔧 性能优化：标记缓存需要重建 */
public markCacheDirty() {
    this._cacheDirty = true;
}
```

#### Step 3: 修改updateState方法
```typescript
// StateController.ts - 替换原有的updateState方法

private updateState(type: EnumUpdataType, value?: unknown) {
    // 🔧 性能优化：使用缓存而非BFS遍历
    if (this._cacheDirty || !this._stateSelectCache) {
        this.rebuildStateSelectCache();
    }

    const cachedSelects = this._stateSelectCache;

    for (const stateSelect of cachedSelects) {
        // 安全检查：确保组件仍然有效
        if (!stateSelect || !stateSelect.node || !stateSelect.node.isValid) {
            this._cacheDirty = true;
            continue;
        }

        switch (type) {
            case EnumUpdataType.State:
                stateSelect.updateState(this);
                break;
            case EnumUpdataType.Name:
                stateSelect.updateCtrlName(this.node);
                break;
            case EnumUpdataType.SelPage:
                stateSelect.updateCtrlPage(this, value as number);
                break;
            case EnumUpdataType.Delete:
                stateSelect.updateDelete(this);
                break;
            case EnumUpdataType.Init:
                stateSelect.updatePreLoad(this);
                break;
            case EnumUpdataType.Prop:
                stateSelect.updateProp(this);
                break;
            case EnumUpdataType.Move:
                // @ts-expect-error 允许使用该方法
                stateSelect.updateStateMove(this, value);
                break;
        }
    }
}
```

#### Step 4: 在适当时机重建缓存
```typescript
// StateController.ts - 修改__preload方法

protected __preload() {
    // ... 现有代码 ...

    // 🔧 性能优化：初始化时构建缓存
    this._cacheDirty = true;

    this.updateState(EnumUpdataType.Init);
}

// StateController.ts - 修改onDestroy方法

protected onDestroy() {
    if (!CC_EDITOR) {
        return;
    }

    this.clearRefreshTimer();
    this._stateSelectCache = null; // 清理缓存

    this.updateState(EnumUpdataType.Delete);
}
```

#### Step 5: 在StateSelect中通知缓存失效
```typescript
// StateSelect.ts - 在节点结构变化时通知控制器

// 在onLoad中添加节点变化监听
protected onLoad() {
    // ... 现有代码 ...

    // 🔧 性能优化：监听节点层级变化
    this.node.on("child-added", this.onChildAdded, this);
    this.node.on("child-removed", this.onChildRemoved, this);
}

private onChildAdded() {
    this.notifyControllerCacheDirty();
}

private onChildRemoved() {
    this.notifyControllerCacheDirty();
}

private notifyControllerCacheDirty() {
    const ctrl = this.getCurrCtrl();
    if (ctrl && ctrl.markCacheDirty) {
        ctrl.markCacheDirty();
    }
}
```

### ✅ 验证方法
1. 在编辑器中创建多层嵌套节点结构
2. 切换状态，观察控制台日志中的缓存命中情况
3. 动态添加/删除子节点，验证缓存自动重建

---

## 2. selectedPage修复

### 📍 修改文件
- `StateController.ts`

### 🎯 目标
解决"设置状态的时候selectedPage不会及时更新"的问题。

### 📝 实现步骤

#### Step 1: 分析问题根因
当前`selectedPage`是一个getter，从`_states[_selectedIndex]`获取值。问题在于：
- 编辑器UI可能缓存了旧值
- 没有主动通知UI刷新

#### Step 2: 添加selectedPage变更通知
```typescript
// StateController.ts - 修改selectedIndex setter

public set selectedIndex(value: EnumStateName) {
    if (this.isInit || this._selectedIndex != value) {
        // ... 现有代码 ...

        this._previousIndex = this._selectedIndex;
        this._selectedIndex = value;

        // 🔧 修复：主动触发selectedPage的UI更新
        // 通过触发属性变更通知编辑器刷新
        if (CC_EDITOR) {
            // 使用Editor API强制刷新selectedPage显示
            this._emitSelectedPageChanged();
        }

        this.updateState(EnumUpdataType.State);
        // ... 后续代码 ...
    }
}

/** 🔧 新增：通知编辑器selectedPage已变更 */
private _emitSelectedPageChanged() {
    // 方法1：通过标记属性脏来触发刷新
    // @ts-expect-error 使用内部API
    if (this.node && this.node._objFlags) {
        // 触发属性变更检测
        this._selectedPageVersion = (this._selectedPageVersion || 0) + 1;
    }
}
```

#### Step 3: 添加强制刷新API
```typescript
// StateController.ts - 添加公共刷新方法

/** 🔧 新增：强制刷新selectedPage显示 */
public refreshSelectedPage() {
    if (CC_EDITOR) {
        // 触发inspector刷新
        Editor.Utils.refreshSelectedInspector("node", this.node.uuid);
    }
}
```

#### Step 4: 在selectedPage getter中添加调试日志
```typescript
// StateController.ts - 修改selectedPage getter

public get selectedPage(): string {
    const stateName = this._selectedIndex == -1 || this._selectedIndex >= this._states.length
        ? null
        : this._states[this._selectedIndex]?.name || null;

    StateErrorManager.debug("获取selectedPage", {
        component: "StateController",
        method: "selectedPage.getter",
        params: { selectedIndex: this._selectedIndex, stateName: stateName }
    });

    return stateName;
}
```

### ✅ 验证方法
1. 在Inspector中选择不同状态
2. 确认selectedPage显示立即更新
3. 通过代码切换状态，观察UI是否同步

---

## 3. 智能属性推断

### 📍 修改文件
- `StateSelect.ts`
- `StateEnum.ts`

### 🎯 目标
根据节点现有组件自动推荐可控制的属性。

### 📝 实现步骤

#### Step 1: 添加属性可用性检测方法
```typescript
// StateSelect.ts - 添加新方法

/** 🔧 智能推断：扫描节点可用的属性类型 */
public scanAvailableProperties(): EnumPropName[] {
    const available: EnumPropName[] = [];

    // 节点基础属性始终可用
    const nodeProps = [
        EnumPropName.Active,
        EnumPropName.Position,
        EnumPropName.Scale,
        EnumPropName.Color,
        EnumPropName.Size,
        EnumPropName.Euler,
        EnumPropName.Anchor,
        EnumPropName.Opacity,
    ];
    available.push(...nodeProps);

    // 根据组件类型添加可用属性
    if (this.node.getComponent(cc.Label)) {
        available.push(
            EnumPropName.LabelString,
            EnumPropName.LabelFontSize,
            EnumPropName.LabelLineHeight,
            EnumPropName.LabelSpacingX,
            EnumPropName.LabelWrapEnable,
            EnumPropName.Font
        );
        if (this.node.getComponent(cc.LabelOutline)) {
            available.push(EnumPropName.LabelOutlineColor);
        }
    }

    if (this.node.getComponent(cc.Sprite)) {
        available.push(
            EnumPropName.SpriteFrame,
            EnumPropName.SpriteFillRange
        );
    }

    if (this.node.getComponent(cc.Button)) {
        available.push(EnumPropName.ButtonInteractable);
    }

    if (this.node.getComponent(cc.Slider)) {
        available.push(EnumPropName.SliderProgress);
    }

    if (this.node.getComponent(cc.EditBox)) {
        available.push(EnumPropName.EditboxString);
    }

    if (this.node.getComponent(cc.ProgressBar)) {
        available.push(EnumPropName.ProgressBarProgress);
    }

    if (this.node.getComponent(cc.Toggle)) {
        available.push(EnumPropName.ToggleIsChecked);
    }

    if (this.node.getComponent(cc.RichText)) {
        available.push(EnumPropName.RichTextString);
    }

    if (this.node.getComponent(cc.ScrollView)) {
        available.push(EnumPropName.ScrollViewEnabled);
    }

    if (this.node.getComponent(cc.Mask)) {
        available.push(EnumPropName.MaskEnabled);
    }

    if (this.node.getComponent(cc.Widget)) {
        available.push(
            EnumPropName.WidgetEnabled,
            EnumPropName.WidgetAlignMode,
            EnumPropName.WidgetIsAlignTop,
            EnumPropName.WidgetIsAlignBottom,
            EnumPropName.WidgetIsAlignLeft,
            EnumPropName.WidgetIsAlignRight,
            EnumPropName.WidgetIsAlignHorizontalCenter,
            EnumPropName.WidgetIsAlignVerticalCenter,
            EnumPropName.WidgetTop,
            EnumPropName.WidgetBottom,
            EnumPropName.WidgetLeft,
            EnumPropName.WidgetRight,
            EnumPropName.WidgetHorizontalCenter,
            EnumPropName.WidgetVerticalCenter
        );
    }

    return available;
}

/** 🔧 智能推断：检查属性是否可用 */
public isPropertyAvailable(propType: EnumPropName): boolean {
    const available = this.scanAvailableProperties();
    return available.includes(propType);
}
```

#### Step 2: 添加一键配置方法
```typescript
// StateSelect.ts - 添加新方法

/** 🔧 智能推断：自动配置所有可用属性 */
public autoConfigureAllProperties() {
    const available = this.scanAvailableProperties();
    let configured = 0;

    for (const propType of available) {
        if (!this.isPropertyControlled(propType)) {
            this.togglePropertyControl(propType, true);
            configured++;
        }
    }

    StateErrorManager.info("自动配置属性完成", {
        component: "StateSelect",
        method: "autoConfigureAllProperties",
        params: { total: available.length, configured: configured }
    });

    return configured;
}

/** 🔧 智能推断：检查属性是否已被控制 */
public isPropertyControlled(propType: EnumPropName): boolean {
    const propData = this.getPropData();
    if (!propData.$$controlledProps$$) {
        return false;
    }
    return Object.values(propData.$$controlledProps$$).includes(propType);
}

/** 🔧 智能推断：切换属性控制状态 */
public togglePropertyControl(propType: EnumPropName, controlled: boolean) {
    const propData = this.getPropData();
    propData.$$controlledProps$$ = propData.$$controlledProps$$ || {};

    const propKey = EnumPropName[propType];

    if (controlled) {
        // 启用控制：记录并获取当前值
        propData.$$controlledProps$$[propKey] = propType;
        const currentValue = PropHandlerManager.getValue(propType, this.node);
        if (currentValue !== undefined) {
            propData[propType] = currentValue;
        }
    } else {
        // 禁用控制：移除记录
        delete propData.$$controlledProps$$[propKey];
    }
}
```

#### Step 3: 在StateToolsProps中添加快捷按钮
```typescript
// StateToolsProps.ts - 添加自动配置按钮

@property({
    displayName: "自动配置",
    tooltip: "自动配置所有可用属性",
})
public get autoConfigureTrigger() {
    return false;
}

public set autoConfigureTrigger(value: boolean) {
    if (value && this.owner && CC_EDITOR) {
        const count = this.owner.autoConfigureAllProperties();
        StateErrorManager.info(`已自动配置 ${count} 个属性`, {
            component: "StateToolsProps",
            method: "autoConfigureTrigger"
        });
    }
}
```

### ✅ 验证方法
1. 在不同组件类型的节点上添加StateSelect
2. 点击"自动配置"按钮
3. 确认只有相关属性被启用

---

## 4. 属性监听器

### 📍 修改文件
- `StateSelect.ts`

### 🎯 目标
解决"有些属性只能从PropValue设置没有监听方法"的问题。

### 📝 实现步骤

#### Step 1: 添加自动同步配置
```typescript
// StateSelect.ts - 添加配置属性

/** 🔧 属性监听：是否启用自动同步 */
@property({
    displayName: "自动同步属性",
    tooltip: "启用后，外部修改属性会自动同步到当前状态",
})
private _autoSyncEnabled: boolean = false;

public get autoSyncEnabled(): boolean {
    return this._autoSyncEnabled;
}

/** 🔧 属性监听：同步检测间隔（毫秒） */
@property({
    displayName: "同步间隔(ms)",
    tooltip: "自动同步的检测间隔，默认500ms",
    min: 100,
    max: 2000,
    step: 100,
    visible: function(this: StateSelect) {
        return this._autoSyncEnabled;
    }
})
private _syncInterval: number = 500;
```

#### Step 2: 实现属性变化检测
```typescript
// StateSelect.ts - 添加监听逻辑

/** 🔧 属性监听：上次检测的属性值快照 */
private _propertySnapshot: Map<EnumPropName, TPropValue> = new Map();

/** 🔧 属性监听：同步检测定时器 */
private _syncCheckTimer: number = null;

/** 🔧 属性监听：启动属性变化检测 */
private startPropertyWatch() {
    if (!CC_EDITOR || !this._autoSyncEnabled) {
        return;
    }

    this.stopPropertyWatch();

    this._syncCheckTimer = setInterval(() => {
        this.checkPropertyChanges();
    }, this._syncInterval) as unknown as number;
}

/** 🔧 属性监听：停止属性变化检测 */
private stopPropertyWatch() {
    if (this._syncCheckTimer) {
        clearInterval(this._syncCheckTimer);
        this._syncCheckTimer = null;
    }
}

/** 🔧 属性监听：检测属性变化 */
private checkPropertyChanges() {
    if (!this.node || !this.node.isValid || !this._autoSyncEnabled) {
        return;
    }

    const controlledProps = this.getControlledProps();

    for (const propType of controlledProps) {
        const currentValue = PropHandlerManager.getValue(propType, this.node);
        const lastValue = this._propertySnapshot.get(propType);

        // 深度比较（处理对象类型）
        if (!this.deepEqualValue(currentValue, lastValue)) {
            // 检测到外部变化
            this.onPropertyExternallyChanged(propType, lastValue, currentValue);
        }
    }

    // 更新快照
    this.updatePropertySnapshot();
}

/** 🔧 属性监听：获取受控属性列表 */
private getControlledProps(): EnumPropName[] {
    const propData = this.getPropData();
    if (!propData.$$controlledProps$$) {
        return [];
    }
    return Object.values(propData.$$controlledProps$$);
}

/** 🔧 属性监听：处理属性外部变化 */
private onPropertyExternallyChanged(
    propType: EnumPropName,
    oldValue: TPropValue,
    newValue: TPropValue
) {
    StateErrorManager.info("检测到属性外部变化，自动同步", {
        component: "StateSelect",
        method: "onPropertyExternallyChanged",
        params: {
            propType: EnumPropName[propType],
            oldValue: this.formatValue(oldValue),
            newValue: this.formatValue(newValue)
        }
    });

    // 同步到当前状态
    const propData = this.getPropData();
    propData[propType] = newValue;
}

/** 🔧 属性监听：更新属性快照 */
private updatePropertySnapshot() {
    const controlledProps = this.getControlledProps();
    this._propertySnapshot.clear();

    for (const propType of controlledProps) {
        const value = PropHandlerManager.getValue(propType, this.node);
        this._propertySnapshot.set(propType, this.cloneValue(value));
    }
}

/** 🔧 属性监听：深度比较值 */
private deepEqualValue(a: TPropValue, b: TPropValue): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;

    // 处理cc.Vec2
    if (a instanceof cc.Vec2 && b instanceof cc.Vec2) {
        return a.x === b.x && a.y === b.y;
    }

    // 处理cc.Vec3
    if (a instanceof cc.Vec3 && b instanceof cc.Vec3) {
        return a.x === b.x && a.y === b.y && a.z === b.z;
    }

    // 处理cc.Color
    if (a instanceof cc.Color && b instanceof cc.Color) {
        return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
    }

    // 处理cc.Size
    if (a instanceof cc.Size && b instanceof cc.Size) {
        return a.width === b.width && a.height === b.height;
    }

    return a === b;
}

/** 🔧 属性监听：克隆值 */
private cloneValue(value: TPropValue): TPropValue {
    if (value === null || value === undefined) return value;

    if (value instanceof cc.Vec2) return cc.v2(value.x, value.y);
    if (value instanceof cc.Vec3) return cc.v3(value.x, value.y, value.z);
    if (value instanceof cc.Color) return cc.color(value.r, value.g, value.b, value.a);
    if (value instanceof cc.Size) return cc.size(value.width, value.height);

    return value;
}

/** 🔧 属性监听：格式化值用于日志 */
private formatValue(value: TPropValue): string {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}
```

#### Step 3: 在生命周期中集成
```typescript
// StateSelect.ts - 修改onLoad和onDestroy

protected onLoad() {
    // ... 现有代码 ...

    // 🔧 属性监听：启动监听
    if (this._autoSyncEnabled) {
        this.updatePropertySnapshot();
        this.startPropertyWatch();
    }
}

protected onDestroy() {
    // ... 现有代码 ...

    // 🔧 属性监听：停止监听
    this.stopPropertyWatch();
    this._propertySnapshot.clear();
}
```

### ✅ 验证方法
1. 启用"自动同步属性"选项
2. 在Inspector中直接修改节点属性
3. 确认修改被自动记录到当前状态

---

## 5. 数据结构优化

### 📍 修改文件
- `StateSelect.ts`

### 🎯 目标
简化三层嵌套的`_ctrlData`结构，提升访问效率。

### ⚠️ 风险评估
- **向后兼容性**: 需要保留旧数据读取逻辑
- **数据迁移**: 需要处理现有场景数据

### 📝 实现步骤

#### Step 1: 设计新的扁平化结构
```typescript
// StateSelect.ts - 定义新的数据结构

/** 🔧 数据结构优化：扁平化的状态数据 */
interface FlatStateData {
    /** 控制器ID */
    ctrlId: number;
    /** 状态ID */
    stateId: number;
    /** 属性类型 */
    propType: EnumPropName;
    /** 属性值 */
    value: TPropValue;
}

/** 🔧 数据结构优化：使用Map存储 */
private _flatData: Map<string, TPropValue> = new Map();

/** 🔧 数据结构优化：生成组合键 */
private makeKey(ctrlId: number, stateId: number, propType: EnumPropName): string {
    return `${ctrlId}_${stateId}_${propType}`;
}

/** 🔧 数据结构优化：快速获取属性值 */
public getPropValueFast(ctrlId: number, stateId: number, propType: EnumPropName): TPropValue | undefined {
    return this._flatData.get(this.makeKey(ctrlId, stateId, propType));
}

/** 🔧 数据结构优化：快速设置属性值 */
public setPropValueFast(ctrlId: number, stateId: number, propType: EnumPropName, value: TPropValue) {
    this._flatData.set(this.makeKey(ctrlId, stateId, propType), value);
}
```

#### Step 2: 实现数据迁移
```typescript
// StateSelect.ts - 添加迁移逻辑

/** 🔧 数据迁移：是否已迁移到新结构 */
private _migrated: boolean = false;

/** 🔧 数据迁移：从旧结构迁移数据 */
private migrateFromLegacyData() {
    if (this._migrated || !this._ctrlData) {
        return;
    }

    let migratedCount = 0;

    // 遍历旧结构
    for (const ctrlIdStr of Object.keys(this._ctrlData)) {
        const ctrlId = parseInt(ctrlIdStr, 10);
        if (isNaN(ctrlId)) continue;

        const page = this._ctrlData[ctrlIdStr];
        if (!page) continue;

        for (const stateIdStr of Object.keys(page)) {
            const stateId = parseInt(stateIdStr, 10);
            if (isNaN(stateId)) continue;

            const prop = page[stateIdStr];
            if (!prop) continue;

            // 迁移属性值
            for (const propTypeStr of Object.keys(prop)) {
                const propType = parseInt(propTypeStr, 10);
                if (isNaN(propType) || propType === 0) continue;

                const value = prop[propType];
                if (value !== undefined) {
                    this.setPropValueFast(ctrlId, stateId, propType, value);
                    migratedCount++;
                }
            }
        }
    }

    this._migrated = true;

    if (migratedCount > 0) {
        StateErrorManager.info("数据迁移完成", {
            component: "StateSelect",
            method: "migrateFromLegacyData",
            params: { migratedCount }
        });
    }
}
```

#### Step 3: 修改现有方法使用新结构
```typescript
// StateSelect.ts - 修改getPropData方法

/** 获取当前状态属性数据（兼容模式） */
public getPropData(): TProp {
    const ctrl = this.getCurrCtrl();
    if (!ctrl) return {};

    const ctrlId = ctrl.ctrlId;
    const stateId = ctrl.selectedIndex;

    // 🔧 优先使用新结构
    if (this._migrated) {
        // 从扁平结构重建TProp对象（保持API兼容）
        const result: TProp = {};
        const prefix = `${ctrlId}_${stateId}_`;

        for (const [key, value] of this._flatData) {
            if (key.startsWith(prefix)) {
                const propType = parseInt(key.split('_')[2], 10);
                if (!isNaN(propType)) {
                    result[propType] = value;
                }
            }
        }

        return result;
    }

    // 回退到旧结构
    const ctrlData = this._ctrlData[ctrlId];
    if (!ctrlData) return {};

    const stateName = ctrl.selectedPage;
    return ctrlData[stateName] || ctrlData.$$default$$ || {};
}
```

### ✅ 验证方法
1. 打开使用旧数据结构的场景
2. 确认数据自动迁移
3. 验证状态切换功能正常

---

## 6. 单元测试

### 📍 新增文件
- `assets/script/Controller/__tests__/StateController.test.ts`
- `assets/script/Controller/__tests__/StateSelect.test.ts`
- `assets/script/Controller/__tests__/StatePropHandler.test.ts`

### 🎯 目标
补充核心功能的单元测试，确保重构安全性。

### 📝 测试用例

#### StateController测试
```typescript
// StateController.test.ts

describe('StateController', () => {
    describe('状态管理', () => {
        it('应该正确初始化默认状态', () => {
            // 测试__preload创建默认状态
        });

        it('应该正确切换selectedIndex', () => {
            // 测试状态切换逻辑
        });

        it('应该处理越界索引', () => {
            // 测试边界检查
        });
    });

    describe('BFS缓存优化', () => {
        it('应该正确构建StateSelect缓存', () => {
            // 测试rebuildStateSelectCache
        });

        it('应该跳过子控制器下的StateSelect', () => {
            // 测试isDirectlyControlled
        });

        it('应该在节点变化时标记缓存脏', () => {
            // 测试markCacheDirty
        });
    });

    describe('状态操作', () => {
        it('应该正确复制状态', () => {
            // 测试copySelectedState
        });

        it('应该正确删除状态', () => {
            // 测试removeSelectedState
        });

        it('应该正确调整状态顺序', () => {
            // 测试adjustSelectedStateOrder
        });
    });
});
```

#### StateSelect测试
```typescript
// StateSelect.test.ts

describe('StateSelect', () => {
    describe('智能属性推断', () => {
        it('应该正确扫描Label组件可用属性', () => {
            // 测试scanAvailableProperties
        });

        it('应该正确检测属性可用性', () => {
            // 测试isPropertyAvailable
        });

        it('应该正确自动配置属性', () => {
            // 测试autoConfigureAllProperties
        });
    });

    describe('属性监听', () => {
        it('应该检测到外部属性变化', () => {
            // 测试checkPropertyChanges
        });

        it('应该正确深度比较值', () => {
            // 测试deepEqualValue
        });
    });

    describe('数据结构', () => {
        it('应该正确迁移旧数据', () => {
            // 测试migrateFromLegacyData
        });

        it('应该正确使用扁平结构', () => {
            // 测试getPropValueFast/setPropValueFast
        });
    });
});
```

#### StatePropHandler测试
```typescript
// StatePropHandler.test.ts

describe('PropHandlerManager', () => {
    it('应该正确注册和获取处理器', () => {
        // 测试register/getHandler
    });

    it('应该正确处理所有已注册属性类型', () => {
        // 遍历所有EnumPropName测试
    });
});
```

### ✅ 验证方法
1. 运行 `npm test` 或编辑器内测试
2. 确保覆盖率 > 80%
3. 所有测试通过

---

## 实施顺序建议

```
Week 1:
├── Day 1-2: BFS缓存优化 + selectedPage修复
├── Day 3-5: 智能属性推断

Week 2:
├── Day 1-3: 属性监听器
├── Day 4-5: 数据结构优化（可选）

Week 3:
├── Day 1-5: 单元测试 + 回归测试
```

---

## 注意事项

1. **向后兼容**: 所有修改必须保持与现有场景数据的兼容性
2. **编辑器测试**: 每个修改都需要在Cocos Creator编辑器中实际测试
3. **性能监控**: 优化后需要对比前后性能指标
4. **日志级别**: 开发期间设置`StateErrorManager.setLogLevel(ErrorLevel.DEBUG)`
