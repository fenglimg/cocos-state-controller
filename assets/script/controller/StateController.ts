const { ccclass, menu, property, executeInEditMode } = cc._decorator;
import { EnumStateName, EnumUpdateType } from "./StateEnum";
import { StateErrorManager } from "./StateErrorManager";
import { StateSelect } from "./StateSelect";

cc.Enum(EnumStateName);

@ccclass("StateValue")
export class StateValue {
    @property(cc.String)
    public name: string = "";

    @property({ type: cc.Integer, readonly: true })
    public stateId: number = 0;

    // cc 反序列化要求 @ccclass 必须可以无参构造。
    // 通过工厂方法构造业务实例，避免反序列化路径崩溃。
    public static create(name: string, stateId: number): StateValue {
        const value = new StateValue();
        value.name = name;
        value.stateId = stateId;
        return value;
    }
}

@ccclass("StateController")
@menu("State/StateController")
@executeInEditMode()
export class StateController extends cc.Component {
    /** 状态id自增 */
    @property({ visible: false })
    private stateIdAuto = 0;

    /** 控制器唯一id，如果使用uuid每次打开编辑器就会变 */
    @property({ visible: false })
    public ctrlId = Date.now();

    /** 历史状态名字 */
    @property({ visible: false })
    private _historyStateName: { [key: number]: string } = {};

    /** 是否正在改变 */
    private isChanging?: boolean;
    /** 是否初始 ,假设编辑器默认状态是2，代码里面正好第一次状态也是2，会导致selecteindex那里不刷新状态。 */
    private isInit: boolean = true;

    /**
     * 是否正在录制 (Wave 2 Topic 3 prefab diff 录制路径).
     * 通过普通字段, 不加 @property → 不序列化, 重启编辑器 / 反序列化后自动回 false。
     */
    private _recording: boolean = false;

    // ================== 🔧 IMPL-001: BFS缓存优化 ==================
    /**
     * 🎯 缓存优化说明：
     * - _stateSelectCache: 缓存当前控制器直接控制的所有StateSelect组件
     * - _cacheDirty: 缓存脏标记，当节点结构变化时设为true
     * - 使用缓存后，状态切换从O(n)遍历优化为O(1)查找
     */
    /** 🔧 缓存：存储直接控制的StateSelect组件 */
    private _stateSelectCache: StateSelect[] = null;

    /** 🔧 缓存脏标记：true表示需要重建缓存 */
    private _cacheDirty: boolean = true;

    /** 控制器名字 (反序列化存储字段, inspector 通过 ctrlName getter 显示) */
    @property({ type: cc.String, visible: false })
    private _ctrlName: string = "";

    @property({ displayName: "name", tooltip: "控制器唯一名称" })
    public get ctrlName() {
        return this._ctrlName;
    }

    public set ctrlName(value: string) {
        if (!CC_EDITOR) {
            StateErrorManager.error("非编辑器环境，不更新名称", {
                component: "StateController",
                method: "ctrlName.setter",
            });
            return;
        }
        this._ctrlName = value;
        this.updateState(EnumUpdateType.Name);
    }

    private _previousIndex: number = -1;
    /** 上一次的选中下标 */
    public get previousIndex(): number {
        return this._previousIndex;
    }

    /** 选中的状态下标 (反序列化存储, inspector 通过 selectedIndex getter 显示下拉) */
    @property({ type: EnumStateName, visible: false })
    private _selectedIndex: EnumStateName = 0;

    /** 状态顺序上移触发 (panel 接管, inspector 隐藏) */
    @property({
        visible: false,
        displayName: "状态上移",
        tooltip: "将当前选中的状态上移一位",
    })
    public get moveStateUp() {
        return false;
    }

    public set moveStateUp(value: boolean) {
        if (value) {
            this.adjustSelectedStateOrder(-1);
        }
    }

    /** 状态顺序下移触发 (panel 接管, inspector 隐藏) */
    @property({
        visible: false,
        displayName: "状态下移",
        tooltip: "将当前选中的状态下移一位",
    })
    public get moveStateDown() {
        return false;
    }

    public set moveStateDown(value: boolean) {
        if (value) {
            this.adjustSelectedStateOrder(1);
        }
    }

    /** 复制当前状态触发 (panel 接管, inspector 隐藏) */
    @property({
        visible: false,
        displayName: "复制当前状态",
        tooltip: "以当前状态为模板复制并插入到下一位",
    })
    public get duplicateCurrentState() {
        return false;
    }

    public set duplicateCurrentState(value: boolean) {
        if (value) {
            this.copySelectedState();
        }
    }

    /** 删除当前状态触发 (panel 接管, inspector 隐藏) */
    @property({
        visible: false,
        displayName: "删除当前状态",
        tooltip: "删除当前选中的状态并自动选择相邻状态",
    })
    public get deleteCurrentState() {
        return false;
    }

    public set deleteCurrentState(value: boolean) {
        if (value) {
            this.removeSelectedState();
        }
    }

    /** 选择的状态下标 */
    @property({ type: EnumStateName, displayName: "selectedState", tooltip: "当前选中的状态" })
    public get selectedIndex() {
        return this._selectedIndex;
    }

    public set selectedIndex(value: EnumStateName) {
        if (this.isInit || this._selectedIndex != value) {
            this.isInit = false;

            const originalValue = value;
            // 🔧 边界检查：确保状态索引在有效范围内
            value = Math.max(0, Math.min(this._states.length - 1, value));

            if (originalValue !== value) {
                StateErrorManager.warn("状态索引超出范围，已自动调整", {
                    component: "StateController",
                    method: "selectedIndex.setter",
                    params: { requestedIndex: originalValue, adjustedIndex: value, maxIndex: this._states.length - 1 },
                });
            }

            StateErrorManager.debug("开始状态切换", {
                component: "StateController",
                method: "selectedIndex.setter",
                params: { fromState: this._selectedIndex, toState: value, isInit: this.isInit },
            });

            // 🔧 状态切换流程：标记正在变化 → 保存上一状态 → 更新当前状态 → 触发更新
            this.isChanging = true;

            // Wave 2: 切 state 前通知 (录制中需 commit diff 到 fromState)
            this.updateState(EnumUpdateType.StateWillChange, this._selectedIndex);

            this._previousIndex = this._selectedIndex;
            this._selectedIndex = value;

            // 🔧 通知所有相关组件状态已改变
            this.updateState(EnumUpdateType.State);

            // 🔧 编辑器环境下同步属性更新
            if (CC_EDITOR) {
                this.updateState(EnumUpdateType.Prop);
                // 🔧 IMPL-002.1: 触发selectedPage变更通知
                this._emitSelectedPageChanged();
            }

            this.isChanging = false;

            StateErrorManager.info("状态切换完成", {
                component: "StateController",
                method: "selectedIndex.setter",
                params: { newState: value, stateName: this.selectedPage },
            });
        }
    }

    /** 状态名字列表 (反序列化存储, inspector 由 panel 接管) */
    @property({ type: StateValue, visible: false })
    private _states: StateValue[] = [];

    @property({ type: StateValue, visible: false, tooltip: "状态数量。数组内容为状态名称 (panel 接管, inspector 隐藏)" })
    public get states() {
        return this._states;
    }

    private set states(value: StateValue[]) {
        if (!CC_EDITOR) {
            StateErrorManager.error("非编辑器环境，不更新状态", {
                component: "StateController",
                method: "states.setter",
            });
            return;
        }

        // 🔧 输入验证：确保数组有效
        if (!value || !Array.isArray(value)) {
            StateErrorManager.warn("states必须是有效的数组", {
                component: "StateController",
                method: "states.setter",
                params: { valueType: typeof value, isArray: Array.isArray(value) },
            });
            return;
        }

        const oldLen = this._states.length;
        const newLen = value.length;

        let applyIndex: number = this._selectedIndex;

        // 处理状态数量不足的情况
        if (newLen < 2) {
            applyIndex = 0;
            StateErrorManager.warn("建议至少添加两个状态", {
                component: "StateController",
                method: "states.setter",
                params: { currentStateCount: newLen },
            });
        }

        // 🔧 处理状态变化的核心逻辑
        let deletedIndices: number[] = [];

        // 🔧 首先检查并初始化所有未正确初始化的状态对象
        for (let index = 0; index < newLen; index++) {
            // 🔧 新增的状态由编辑器默认构造，name为""且stateId为0（未分配），需要正确初始化
            const isUninitialized =
                !value[index] ||
                value[index].name === undefined ||
                value[index].stateId === undefined ||
                (value[index].name === "" && value[index].stateId === 0 && index >= oldLen);
            if (isUninitialized) {
                // 🔧 使用智能命名方法生成状态名字
                const smartStateName = this.getSmartStateName(index);
                const newStateId = this.stateIdAuto++;
                value[index] = StateValue.create(smartStateName, newStateId);
            }
            else {
                // 🔧 检测现有状态的手动更改
                const defaultName = (index + 1).toString();
                const currentName = value[index].name;

                // 只有当名字不是默认名字时，才可能是手动修改的
                if (currentName !== defaultName) {
                    // 检查是否已经在历史记录中
                    if (!this._historyStateName[index] || this._historyStateName[index] !== currentName) {
                        // 记录或更新历史记录
                        if (!this._historyStateName) {
                            this._historyStateName = {};
                        }
                        this._historyStateName[index] = currentName;
                    }
                }
                else {
                    // 如果改回了默认名字，删除历史记录
                    if (this._historyStateName && this._historyStateName[index]) {
                        delete this._historyStateName[index];
                    }
                }
            }
        }

        if (oldLen > newLen) {
            // 🔧 处理状态删除：找到所有被删除的状态索引
            deletedIndices = this.findDeletedIndices(this._states, value);
            let adjustment = 0;
            // 计算需要调整的量
            for (const deletedIndex of deletedIndices) {
                if (deletedIndex <= applyIndex) {
                    adjustment++;
                }
            }
            // 应用调整
            if (adjustment > 0) {
                let newIndex = Math.max(0, applyIndex - adjustment);
                newIndex = Math.min(newIndex, newLen - 1);
                applyIndex = newIndex;
            }
        }

        // 🔧 更新内部状态数组
        StateErrorManager.debug("开始更新状态数组", {
            component: "StateController",
            method: "states.setter",
            params: { oldLength: oldLen, newLength: newLen, deletedCount: deletedIndices.length },
        });

        this._states = value;

        const stateMap: { [key: string]: boolean } = {};
        const array = value.map((val, i) => {
            if (!val) {
                StateErrorManager.error("状态对象不能为空", {
                    component: "StateController",
                    method: "states.setter",
                    params: { stateIndex: i },
                });
                return { name: "error", value: i };
            }

            // 🔧 处理重复状态名
            if (stateMap[val.name]) {
                const newName = val.name + "_" + i;
                StateErrorManager.warn("检测到重复的状态名，自动重命名", {
                    component: "StateController",
                    method: "states.setter",
                    params: { originalName: val.name, newName: newName },
                });
                val.name = newName;
            }

            stateMap[val.name] = true;
            return { name: val.name, value: i };
        });

        // @ts-expect-error 允许使用该方法
        cc.Class.Attr.setClassAttr(this, "selectedIndex", "enumList", array);
        this._selectedIndex = applyIndex;

        // 刻意不调 forceRefreshInspector: 自动强刷会打断当前操作 (焦点丢失 / 抖动),
        // selectedPage 等 getter @property 的陈旧显示由用户点 "刷新检查器" 按钮解决.

        // 🔧 通知相关组件状态列表已更新
        if (deletedIndices.length > 0) {
            StateErrorManager.info("状态列表更新完成（包含删除）", {
                component: "StateController",
                method: "states.setter",
                params: { finalStateCount: newLen, deletedIndices: deletedIndices, currentIndex: applyIndex },
            });
            // 如果有删除，通知第一个删除的索引
            this.updateState(EnumUpdateType.SelPage, deletedIndices[0]);
        }
        else {
            StateErrorManager.info("状态列表更新完成", {
                component: "StateController",
                method: "states.setter",
                params: { finalStateCount: newLen, currentIndex: applyIndex },
            });
            this.updateState(EnumUpdateType.SelPage);
        }
    }

    /** 🔧 调整当前选中状态的顺序 */
    private adjustSelectedStateOrder(offset: number) {
        if (!CC_EDITOR) {
            StateErrorManager.error("仅在编辑器中调整状态顺序", {
                component: "StateController",
                method: "adjustSelectedStateOrder",
            });
            return;
        }

        if (!this._states || this._states.length === 0) {
            StateErrorManager.warn("当前没有可调整的状态", {
                component: "StateController",
                method: "adjustSelectedStateOrder",
            });
            return;
        }

        const fromIndex = this._selectedIndex;
        if (fromIndex < 0 || fromIndex >= this._states.length) {
            StateErrorManager.warn("选中的状态索引无效，无法调整顺序", {
                component: "StateController",
                method: "adjustSelectedStateOrder",
                params: { selectedIndex: fromIndex, stateCount: this._states.length },
            });
            return;
        }

        const targetIndex = fromIndex + offset;
        if (targetIndex < 0 || targetIndex >= this._states.length) {
            StateErrorManager.warn("已到达边界，无法继续移动", {
                component: "StateController",
                method: "adjustSelectedStateOrder",
                params: { fromIndex: fromIndex, targetIndex: targetIndex, stateCount: this._states.length },
            });
            return;
        }

        const newStates = [...this._states];
        const [moved] = newStates.splice(fromIndex, 1);
        newStates.splice(targetIndex, 0, moved);

        // 🔧 同步历史命名记录的顺序，避免新增状态时名称错位
        this.reorderHistoryNames(fromIndex, targetIndex);

        // 先更新选中索引，再触发 setter 以同步 inspector
        this._selectedIndex = targetIndex;
        this.states = newStates;

        // 🔧 通知 StateSelect 携带数据一起移动
        this.updateState(EnumUpdateType.Move, { fromIndex: fromIndex, toIndex: targetIndex });

        StateErrorManager.info("状态顺序已调整", {
            component: "StateController",
            method: "adjustSelectedStateOrder",
            params: { fromIndex: fromIndex, toIndex: targetIndex, stateName: moved?.name },
        });
    }

    /** 🔧 辅助：同步_historyStateName 顺序 */
    private reorderHistoryNames(fromIndex: number, toIndex: number) {
        if (!this._historyStateName) {
            return;
        }

        const newHistory: { [key: number]: string } = {};

        Object.keys(this._historyStateName).forEach((key) => {
            const idx = parseInt(key, 10);
            if (isNaN(idx)) {
                return;
            }

            const name = this._historyStateName[idx];

            if (idx === fromIndex) {
                newHistory[toIndex] = name;
            }
            else if (fromIndex < toIndex && idx > fromIndex && idx <= toIndex) {
                // 向下移动：中间元素整体上移一位
                newHistory[idx - 1] = name;
            }
            else if (fromIndex > toIndex && idx >= toIndex && idx < fromIndex) {
                // 向上移动：中间元素整体下移一位
                newHistory[idx + 1] = name;
            }
            else {
                newHistory[idx] = name;
            }
        });

        this._historyStateName = newHistory;
    }

    /** 🔧 复制当前选中的状态并插入到下一位 */
    private copySelectedState() {
        if (!CC_EDITOR) {
            StateErrorManager.error("仅在编辑器中复制状态", {
                component: "StateController",
                method: "copySelectedState",
            });
            return;
        }

        if (!this._states || this._states.length === 0) {
            StateErrorManager.warn("当前没有可复制的状态", {
                component: "StateController",
                method: "copySelectedState",
            });
            return;
        }

        const index = this._selectedIndex;
        if (index < 0 || index >= this._states.length) {
            StateErrorManager.warn("选中的状态索引无效，无法复制", {
                component: "StateController",
                method: "copySelectedState",
                params: { selectedIndex: index, stateCount: this._states.length },
            });
            return;
        }

        const origin = this._states[index];
        const baseName = origin && origin.name ? origin.name : this.getSmartStateName(this._states.length);
        const copyName = `${baseName}_copy`;
        const newState = StateValue.create(copyName, this.stateIdAuto++);

        const newStates = [...this._states];
        const insertIndex = index + 1;
        newStates.splice(insertIndex, 0, newState);

        this._selectedIndex = insertIndex;
        this.states = newStates;
        // 先派发 Copy 让各 StateSelect 深拷贝 pageData, 再发 State 让所有 select apply 当前 state
        this.updateState(EnumUpdateType.Copy, { fromIndex: index, toIndex: insertIndex });
        this.updateState(EnumUpdateType.State);

        StateErrorManager.info("已复制当前状态", {
            component: "StateController",
            method: "copySelectedState",
            params: { fromIndex: index, insertIndex: insertIndex, originName: baseName, newName: copyName },
        });
    }

    /** 🔧 删除当前选中的状态，至少保留一个 */
    private removeSelectedState() {
        if (!CC_EDITOR) {
            StateErrorManager.error("仅在编辑器中删除状态", {
                component: "StateController",
                method: "removeSelectedState",
            });
            return;
        }

        if (!this._states || this._states.length === 0) {
            StateErrorManager.warn("当前没有可删除的状态", {
                component: "StateController",
                method: "removeSelectedState",
            });
            return;
        }

        if (this._states.length <= 1) {
            StateErrorManager.warn("至少保留一个状态，已取消删除", {
                component: "StateController",
                method: "removeSelectedState",
                params: { stateCount: this._states.length },
            });
            return;
        }

        const index = this._selectedIndex;
        if (index < 0 || index >= this._states.length) {
            StateErrorManager.warn("选中的状态索引无效，无法删除", {
                component: "StateController",
                method: "removeSelectedState",
                params: { selectedIndex: index, stateCount: this._states.length },
            });
            return;
        }

        const removed = this._states[index];
        const newStates = [...this._states];
        newStates.splice(index, 1);

        // 🔧 同步历史命名，保持索引与状态对齐
        if (this._historyStateName) {
            const newHistory: { [key: number]: string } = {};
            Object.keys(this._historyStateName).forEach((key) => {
                const oldIdx = parseInt(key, 10);
                if (isNaN(oldIdx)) return;
                if (oldIdx < index) {
                    newHistory[oldIdx] = this._historyStateName[oldIdx];
                }
                else if (oldIdx > index) {
                    newHistory[oldIdx - 1] = this._historyStateName[oldIdx];
                }
            });
            this._historyStateName = newHistory;
        }

        // 🔧 预设新的选中索引，避免 setter 收到越界值
        const newIndex = Math.min(index, newStates.length - 1);
        this._selectedIndex = newIndex;

        this.states = newStates;

        StateErrorManager.info("已删除当前状态", {
            component: "StateController",
            method: "removeSelectedState",
            params: {
                removedIndex: index,
                removedName: removed?.name,
                newSelectedIndex: newIndex,
                remainingCount: newStates.length,
            },
        });
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    protected __preload() {
        if (!CC_EDITOR) {
            return;
        }

        StateErrorManager.debug("开始控制器预加载", {
            component: "StateController",
            method: "__preload",
            params: { hasStates: !!this._states.length, ctrlName: this._ctrlName },
        });

        if (!this._states.length) {
            // 🔧 从1开始命名状态
            this._states = [StateValue.create("1", this.stateIdAuto++), StateValue.create("2", this.stateIdAuto++)];
            StateErrorManager.info("创建默认状态", {
                component: "StateController",
                method: "__preload",
                params: { defaultStates: ["1", "2"] },
            });
        }

        const array = this.states.map((val, i) => {
            return { name: val.name, value: i };
        });

        // @ts-expect-error 允许使用该方法
        cc.Class.Attr.setClassAttr(this, "selectedIndex", "enumList", array);

        // 🔧 确保selectedIndex在有效范围内，默认选择第一个状态
        if (this._states.length > 0 && (this._selectedIndex < 0 || this._selectedIndex >= this._states.length)) {
            this._selectedIndex = 0;
            StateErrorManager.info("初始化时自动设置selectedIndex为第一个状态", {
                component: "StateController",
                method: "__preload",
            });
        }

        if (!this._ctrlName) {
            this.ctrlName = `ctrl_${Date.now().toString()}`;
            StateErrorManager.debug("生成默认控制器名称", {
                component: "StateController",
                method: "__preload",
                params: { generatedName: this._ctrlName },
            });
        }

        StateErrorManager.info("控制器预加载完成", {
            component: "StateController",
            method: "__preload",
            params: { ctrlId: this.ctrlId, ctrlName: this._ctrlName, stateCount: this._states.length },
        });

        this.updateState(EnumUpdateType.Init);
    }

    protected onLoad() {
        if (!CC_EDITOR) {
            return;
        }
        this.updateState(EnumUpdateType.State);
    }

    protected onDestroy() {
        if (!CC_EDITOR) {
            return;
        }
        this.updateState(EnumUpdateType.Delete);
    }

    /** 选择的状态名字 */
    public get selectedPage(): string {
        // 🔧 IMPL-002.4: 添加调试日志
        StateErrorManager.debug("获取selectedPage", {
            component: "StateController",
            method: "selectedPage.getter",
            params: { selectedIndex: this._selectedIndex, statesCount: this._states.length },
        });

        if (this._selectedIndex == -1 || this._selectedIndex >= this._states.length)
            return null;
        else {
            const currentState = this._states[this._selectedIndex];

            // 🔧 确保状态对象有效且name不为空
            if (currentState && currentState.name !== undefined && currentState.name !== "") {
                return currentState.name;
            }
            else {
                StateErrorManager.warn("当前状态对象无效或名称为空", {
                    component: "StateController",
                    method: "selectedPage.getter",
                    params: { currentState: currentState, selectedIndex: this._selectedIndex },
                });
                return null;
            }
        }
    }

    // ================== 🔧 IMPL-002: selectedPage修复 ==================

    /**
     * 触发 selectedPage 变更通知 (仅日志, 不再自动刷新 inspector).
     *
     * 历史: 这里曾在切状态后 setTimeout 强刷 inspector, 体验上会打断当前操作
     * (焦点丢失 / 滚动跳动). 现在去掉, selectedPage 的陈旧显示由用户主动点
     * inspector 上的 "刷新检查器" 按钮 (manualRefreshTrigger) 解决.
     */
    private _emitSelectedPageChanged(): void {
        if (!CC_EDITOR) {
            return;
        }
        StateErrorManager.debug("selectedPage 变更", {
            component: "StateController",
            method: "_emitSelectedPageChanged",
            params: { selectedPage: this.selectedPage, selectedIndex: this._selectedIndex },
        });
    }

    /**
     * 🔧 IMPL-002.3: 公共方法 - 手动刷新selectedPage显示
     * 供外部在需要时手动调用
     */
    public refreshSelectedPage(): void {
        if (!CC_EDITOR) {
            StateErrorManager.warn("refreshSelectedPage仅在编辑器环境可用", {
                component: "StateController",
                method: "refreshSelectedPage",
            });
            return;
        }

        StateErrorManager.info("手动刷新selectedPage", {
            component: "StateController",
            method: "refreshSelectedPage",
            params: { selectedPage: this.selectedPage, selectedIndex: this._selectedIndex },
        });

        this._emitSelectedPageChanged();
    }

    public set selectedPage(val: string) {
        for (let index = 0, len = this._states.length; index < len; index++) {
            if (this._states[index].name == val) {
                this.selectedIndex = index;
                return;
            }
        }
    }

    /** 找到所有被删除的状态索引 */
    private findDeletedIndices(oldStates: StateValue[], newStates: StateValue[]): number[] {
        StateErrorManager.debug("开始检测删除的状态", {
            component: "StateController",
            method: "findDeletedIndices",
            params: { oldCount: oldStates.length, newCount: newStates.length },
        });

        const deletedIndices: number[] = [];

        const newStateIds = new Set<number>();

        for (let i = 0; i < newStates.length; i++) {
            if (newStates[i] && newStates[i].stateId !== undefined) {
                newStateIds.add(newStates[i].stateId);
            }
        }

        for (let i = 0; i < oldStates.length; i++) {
            const oldState = oldStates[i];

            if (!oldState || oldState.stateId === undefined) {
                StateErrorManager.warn("发现无效的旧状态对象", {
                    component: "StateController",
                    method: "findDeletedIndices",
                    params: { stateIndex: i },
                });
                continue;
            }

            if (!newStateIds.has(oldState.stateId)) {
                deletedIndices.push(i);
            }
        }

        if (deletedIndices.length > 0) {
            StateErrorManager.info("检测到删除的状态", {
                component: "StateController",
                method: "findDeletedIndices",
                params: { deletedIndices: deletedIndices, deletedCount: deletedIndices.length },
            });
        }

        return deletedIndices;
    }

    /** 🔧 辅助方法：生成智能状态名字，优先使用历史记录 */
    private getSmartStateName(index: number): string {
        // 检查历史记录中是否有该索引的自定义名字
        if (this._historyStateName && this._historyStateName[index]) {
            return this._historyStateName[index];
        }

        // 默认从1开始命名
        const defaultName = (index + 1).toString();
        StateErrorManager.debug("使用默认状态名字", {
            component: "StateController",
            method: "getSmartStateName",
            params: { index: index, defaultName: defaultName },
        });
        return defaultName;
    }

    // ================== 🔧 IMPL-001: BFS缓存优化方法 ==================

    /**
     * 🔧 重建StateSelect缓存
     * 使用getComponentsInChildren一次性获取所有StateSelect，然后过滤出直接控制的组件
     */
    private rebuildStateSelectCache(): void {
        if (!this._cacheDirty && this._stateSelectCache !== null) {
            return; // 缓存有效，无需重建
        }

        StateErrorManager.debug("开始重建StateSelect缓存", {
            component: "StateController",
            method: "rebuildStateSelectCache",
            params: { ctrlName: this._ctrlName },
        });

        const allStateSelects = this.node.getComponentsInChildren(StateSelect);
        this._stateSelectCache = allStateSelects.filter(ss => this.isDirectlyControlled(ss.node));

        this._cacheDirty = false;

        StateErrorManager.info("StateSelect缓存重建完成", {
            component: "StateController",
            method: "rebuildStateSelectCache",
            params: { cachedCount: this._stateSelectCache.length },
        });
    }

    /**
     * 🔧 检查节点是否被当前控制器直接控制
     * 直接控制 = 节点与控制器之间没有其他StateController
     */
    private isDirectlyControlled(targetNode: cc.Node): boolean {
        let current: cc.Node = targetNode;

        while (current && current !== this.node) {
            const parent = current.parent;
            if (!parent) break;

            // 如果父节点不是当前控制器节点，检查父节点上是否有其他StateController
            if (parent !== this.node) {
                const parentController = parent.getComponent(StateController);
                if (parentController && parentController !== this) {
                    // 发现了中间控制器，该节点不是直接控制的
                    return false;
                }
            }

            current = parent;
        }

        return current === this.node;
    }

    /**
     * 🔧 公共方法：标记缓存为脏，需要重建
     * 当节点增删或StateSelect组件增删时调用
     */
    public markCacheDirty(): void {
        this._cacheDirty = true;
        StateErrorManager.debug("缓存已标记为脏", {
            component: "StateController",
            method: "markCacheDirty",
            params: { ctrlName: this._ctrlName },
        });
    }

    /** 🔧 核心方法：状态更新通知机制 - 使用缓存优化 (IMPL-001) */
    private updateState(type: EnumUpdateType, value?: unknown) {
        // 🔧 IMPL-001: 使用缓存替代BFS遍历
        this.rebuildStateSelectCache();

        // 🔧 直接遍历缓存的StateSelect组件
        for (const stateSelect of this._stateSelectCache) {
            // 注意：不能用 `!stateSelect.node.active` 做过滤。
            // 那会让"上一个 state 把 node 关掉、新 state 应该重新开"的场景失效 —
            // 下一次 updateState 因为 node.active=false 而被 skip，永远拿不到 active=true 的 apply。
            // 这里只过滤真正失效的组件/节点。
            if (!stateSelect || !stateSelect.node || !stateSelect.node.isValid) {
                continue;
            }

            if (type == EnumUpdateType.State) {
                // 🔧 状态切换：通知StateSelect组件状态已改变
                stateSelect.updateState(this);
                // 刻意不调 stateSelect.forceRefreshInspector(): 全量刷新 inspector
                // 会丢焦点 / 抖动. propValue 等 getter @property 在切 state 后显示
                // 陈旧由用户主动按 "刷新检查器" 按钮解决 (跟 werewolf 项目默认
                // ManualRefresh 模式一致).
            }
            else if (type == EnumUpdateType.Name) {
                // 🔧 名称更新：通知StateSelect组件控制器名称已更改
                stateSelect.updateCtrlName(this.node);
            }
            else if (type == EnumUpdateType.SelPage) {
                // 🔧 状态页面更新：通知StateSelect组件状态列表已更改
                stateSelect.updateCtrlPage(this, value as number);
            }
            else if (type == EnumUpdateType.Delete) {
                // 🔧 删除通知：通知StateSelect组件控制器即将被删除
                stateSelect.updateDelete(this);
            }
            else if (type == EnumUpdateType.Init) {
                // 🔧 初始化通知：通知StateSelect组件控制器已完成初始化
                stateSelect.updatePreLoad(this);
            }
            else if (type == EnumUpdateType.Prop) {
                // 🔧 属性更新：通知StateSelect组件属性已更改
                stateSelect.updateProp(this);
            }
            else if (type == EnumUpdateType.Move) {
                // 🔧 状态顺序变更：通知StateSelect同步状态数据顺序
                // @ts-expect-error 允许使用该方法
                stateSelect.updateStateMove(this, value);
            }
            else if (type == EnumUpdateType.Copy) {
                // 🔧 状态复制：通知 StateSelect 深拷贝 pageData[fromIndex] → pageData[toIndex]
                // @ts-expect-error 允许使用该方法
                stateSelect.updateStateCopy(this, value);
            }
            else if (type == EnumUpdateType.RecordingStart) {
                // Wave 2: 录制开始, StateSelect 拍 snapshot
                if (typeof (stateSelect as any).onRecordingStart === "function") {
                    (stateSelect as any).onRecordingStart(this);
                }
            }
            else if (type == EnumUpdateType.RecordingStop) {
                // Wave 2: 录制结束, StateSelect final commit + 清 snapshot
                if (typeof (stateSelect as any).onRecordingStop === "function") {
                    (stateSelect as any).onRecordingStop(this);
                }
            }
            else if (type == EnumUpdateType.StateWillChange) {
                // Wave 2: 切 state 前通知 (录制中触发 diff commit), value = fromState
                if (typeof (stateSelect as any).onStateWillChange === "function") {
                    (stateSelect as any).onStateWillChange(this, value as number);
                }
            }
        }
    }

    /**
     * 当前 state 的格式化标签 (readonly, inspector 极简形态展示)
     * 格式: "`${index}. ${stateName}`", e.g. "1. hover"
     * 越界时返回 "-" fallback (不抛错)。
     */
    @property({
        displayName: "当前状态",
        tooltip: "当前选中 state 的 index + 名称",
        readonly: true,
    })
    public get currentStateLabel(): string {
        const idx = this._selectedIndex;
        if (!this._states || this._states.length === 0) {
            return "-";
        }
        if (idx < 0 || idx >= this._states.length) {
            return "-";
        }
        const s = this._states[idx];
        const name = s && s.name ? s.name : "";
        return `${idx}. ${name}`;
    }

    /** 手动刷新属性检查器按钮 (panel 接管, inspector 隐藏) */
    @property({
        visible: false,
        displayName: "刷新检查器",
        tooltip: "点击刷新属性检查器 (状态列表 / selectedIndex 下拉等)",
    })
    public get manualRefreshTrigger() {
        return false;
    }

    public set manualRefreshTrigger(value: boolean) {
        if (value && CC_EDITOR) {
            this.forceRefreshInspector();
        }
    }

    /**
     * 当前是否正在录制 (Wave 2 Topic 3). readonly, 通过 startRecording / stopRecording 修改。
     */
    public get isRecording(): boolean {
        return this._recording;
    }

    /**
     * 进入录制态: 通知所有 StateSelect.onRecordingStart 拍 snapshot.
     * 幂等: 已经在录制时 no-op。
     */
    public startRecording(): void {
        if (this._recording) {
            return;
        }
        this._recording = true;
        StateErrorManager.info("开始录制", {
            component: "StateController",
            method: "startRecording",
            params: { ctrlName: this._ctrlName },
        });
        this.updateState(EnumUpdateType.RecordingStart);
    }

    /**
     * 退出录制态: 通知所有 StateSelect.onRecordingStop final commit + 清 snapshot.
     * 幂等: 未在录制时 no-op。
     */
    public stopRecording(): void {
        if (!this._recording) {
            return;
        }
        this._recording = false;
        StateErrorManager.info("停止录制", {
            component: "StateController",
            method: "stopRecording",
            params: { ctrlName: this._ctrlName },
        });
        this.updateState(EnumUpdateType.RecordingStop);
    }

    /**
     * 录制按钮: 切换 isRecording (Wave 2 实装).
     */
    @property({
        displayName: "🔴 录制状态",
        tooltip: "进入/退出录制模式. 录制中, 节点改动自动写入当前 state",
    })
    public get recordTrigger() {
        return this._recording;
    }

    public set recordTrigger(_value: boolean) {
        if (!CC_EDITOR) return;
        if (this._recording) {
            this.stopRecording();
        }
        else {
            this.startRecording();
        }
    }

    /**
     * 打开 panel 按钮 stub (Wave 1 后由 panel 注册 IPC 接管). 当前仅 cc.warn 占位。
     */
    @property({
        displayName: "⚙️ 打开 Panel",
        tooltip: "打开 StateController panel 编辑窗口 (Wave 2 panel 实装后接管)",
    })
    public get openPanelTrigger() {
        return false;
    }

    public set openPanelTrigger(value: boolean) {
        if (value && CC_EDITOR) {
            cc.warn("[StateController] panel 尚未实现, 等待 Wave 2 Gemini 委托交付。");
        }
    }

    /** 强制刷新属性检查器 (states 变化后由内部直接调用, 不再走 strategy 分支) */
    private forceRefreshInspector() {
        if (!CC_EDITOR) {
            return;
        }
        try {
            Editor.Utils.refreshSelectedInspector("node", this.node.uuid);
        }
        catch (error) {
            StateErrorManager.warn("刷新属性检查器失败", {
                component: "StateController",
                method: "forceRefreshInspector",
                params: { error: (error as Error).message },
            });
        }
    }
}
