const { ccclass, menu, property, executeInEditMode } = cc._decorator;
import { CapabilityRegistry } from "./CapabilityRegistry";
// Wave 3 T07: 让所有 L0 内置 capability 跟着 StateController 一起被打入产出 (side-effect 自注册).
// 显式 /index: cocos 2.x ts 编译路径不做 folder→index 解析, 写 "./capabilities" 会报
// "Cannot find module './capabilities'" (jest 用 node resolver 能解出, 编辑器不行).
import "./capabilities/index";
import { EnumPropName, EnumStateName, EnumUpdateType } from "./StateEnum";
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

    /**
     * 录制开始时的 selectedIndex (TASK-002 cancelRecording 用).
     * 在 _doStartRecording 中赋值; cancelRecording 用它定位需要回滚的 ctrlData state.
     * 非 @property, 不序列化.
     */
    private _recordingStartState: number = -1;

    /**
     * 标记当前 stopRecording 的触发来源 (模型 Z, 切 state 时自动停).
     *   "manual": 用户点录制按钮关 (默认), StateSelect.onRecordingStop 走完整路径 + 弹窗
     *   "auto":   selectedIndex setter 自动触发, StateSelect.onRecordingStop 走静默 + Editor.log
     * 字段非 @property, 不序列化. 仅在 stopRecording 调用前后短暂有效.
     */
    public _stopRecordingMode: "manual" | "auto" = "manual";

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
    @property({ visible: false })
    private _ctrlName: string = "";

    @property({ displayName: "控制器 id", tooltip: "控制器唯一名称" })
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
    @property({ type: EnumStateName, displayName: "state", tooltip: "当前选中的状态" })
    public get selectedIndex() {
        return this._selectedIndex;
    }

    public set selectedIndex(value: EnumStateName) {
        if (this.isInit || this._selectedIndex != value) {
            this.isInit = false;

            // 模型 Z: 录制中切 state → 自动 stopRecording, 把改动 commit 到 fromState 后再切.
            // 标记 _stopRecordingMode="auto" 让 StateSelect.onRecordingStop 走静默 + log 路径,
            // 不弹"未跟随 prop"窗 (高频操作不打扰). stopRecording 后 _recording=false,
            // 后续 StateWillChange / onStateWillChange 看到 !isRecording 自动跳过, 不重复 commit.
            if (this._recording) {
                this._stopRecordingMode = "auto";
                try {
                    this.stopRecording();
                }
                finally {
                    this._stopRecordingMode = "manual";
                }
            }

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
            // Wave 2 T25: capability 层广播 state 切换
            // W6-2b: 留 propType / propRef 字段位 (state-change 事件本身不针对单 prop, 占位让下游 capability
            //   读 ctx 不会 undefined 报错; per-prop 事件在 onPropertyControlled / onPropertyReleased 派发).
            CapabilityRegistry.dispatch("onStateWillChange", { ctrl: this, fromState: this._selectedIndex, toState: value, propType: undefined, propRef: undefined });

            this._previousIndex = this._selectedIndex;
            this._selectedIndex = value;

            // 🔧 通知所有相关组件状态已改变
            this.updateState(EnumUpdateType.State);
            // Wave 2 T25: capability 层广播 state 已切
            // W6-2b: 同 onStateWillChange, 留 propType / propRef 字段位
            CapabilityRegistry.dispatch("onStateChanged", { ctrl: this, fromState: this._previousIndex, toState: value, propType: undefined, propRef: undefined });

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

    /** 状态名字列表 (反序列化字段). inspector 通过 states getter/setter 暴露. */
    @property({ type: StateValue, visible: false })
    private _states: StateValue[] = [];

    /** 状态列表 inspector 入口. cocos 数组 UI 的 + / × / 拖动会调 setter, 走完整 invariants. */
    @property({ type: StateValue, displayName: "states", tooltip: "状态列表 — 用 cocos 数组 UI 直接添加/删除/重排/改名" })
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

        // TASK-002: 录制中不能修改状态列表 (避免 ctrlData 索引错位).
        if (this._recording) {
            StateErrorManager.warn("录制中不能修改状态列表, 请先停止/撤销录制", {
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

        // TASK-002: 录制中不能调整状态顺序.
        if (this._recording) {
            StateErrorManager.warn("录制中不能调整状态顺序, 请先停止/撤销录制", {
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

        // TASK-002: 录制中不能复制状态.
        if (this._recording) {
            StateErrorManager.warn("录制中不能复制状态, 请先停止/撤销录制", {
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

        // TASK-002: 录制中不能删除状态.
        if (this._recording) {
            StateErrorManager.warn("录制中不能删除状态, 请先停止/撤销录制", {
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

        // Wave 2 T16: 兜底 commit - 场景切换时自动 stopRecording
        // 即使用户没主动停录, 切场景前也会 commit 当前 state 的 diff, 避免数据丢失
        if (cc.director && typeof cc.director.on === "function") {
            cc.director.on(cc.Director.EVENT_BEFORE_SCENE_LAUNCH, this._onSceneBeforeLaunch, this);
        }

        this.updateState(EnumUpdateType.Init);
    }

    /** Wave 2 T16: 场景切换前的兜底 commit hook. */
    private _onSceneBeforeLaunch(): void {
        if (this._recording) {
            StateErrorManager.info("场景切换前自动停止录制", {
                component: "StateController",
                method: "_onSceneBeforeLaunch",
                params: { ctrlName: this._ctrlName },
            });
            this.stopRecording();
        }
    }

    protected onLoad() {
        if (!CC_EDITOR) {
            // Wave 3: runtime 启动 capability hook (HomePage 等用此跳到指定 state)
            CapabilityRegistry.dispatch("onRuntimeInit", { ctrl: this });
            return;
        }
        this.updateState(EnumUpdateType.State);
    }

    protected onDestroy() {
        if (!CC_EDITOR) {
            return;
        }
        // Wave 2 T16: onDestroy 兜底 - 若仍在录制, stopRecording 触发 final commit
        if (this._recording) {
            StateErrorManager.info("控制器销毁前自动停止录制 (commit final diff)", {
                component: "StateController",
                method: "onDestroy",
            });
            this.stopRecording();
        }
        if (cc.director && typeof cc.director.off === "function") {
            cc.director.off(cc.Director.EVENT_BEFORE_SCENE_LAUNCH, this._onSceneBeforeLaunch, this);
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
     * (焦点丢失 / 滚动跳动). 现在去掉, selectedPage 的陈旧显示由 panel 主动接管.
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
                // Wave 2: 录制中切 state, apply 完新 state 后通知 select 重拍 snapshot
                if (this._recording && typeof (stateSelect as any).onStateChanged === "function") {
                    (stateSelect as any).onStateChanged(this);
                }
                // 刻意不调 stateSelect.forceRefreshInspector(): 全量刷新 inspector
                // 会丢焦点 / 抖动. inspector 陈旧显示由 panel 主动接管 (无插件闭环).
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
     * 当前是否正在录制 (Wave 2 Topic 3). readonly, 通过 startRecording / stopRecording 修改。
     */
    public get isRecording(): boolean {
        return this._recording;
    }

    /**
     * 进入录制态: 通知所有 StateSelect.onRecordingStart 拍 snapshot.
     * 幂等: 已经在录制时 no-op。
     *
     * 模型 Z dirty 检测: 进入录制前若发现节点已勾跟随的 prop 跟 ctrlData[currentState]
     * 不一致 (用户没录就改了节点), 弹窗 3 选 1: 保存到当前 state / 丢弃恢复 / 取消.
     * 弹窗异步, 用户选完才真正进入录制态. 编辑器外 (jest / 运行时) 无 Editor.Dialog,
     * 走默认行为 = "保存到当前 state" (defaultId=0).
     */
    public startRecording(): void {
        if (this._recording) {
            return;
        }
        const dirty = this.collectControlledDirty();
        if (dirty.length === 0) {
            this._doStartRecording();
            return;
        }
        this.promptDirtyAndStart(dirty);
    }

    /** 真正进入录制态 (无 dirty 检查). dirty 弹窗 / 直接 startRecording 都走这一条. */
    private _doStartRecording(): void {
        this._recording = true;
        // TASK-002: 记录录制开始时的 state, 供 cancelRecording 回滚定位.
        this._recordingStartState = this._selectedIndex;
        StateErrorManager.info("开始录制", {
            component: "StateController",
            method: "_doStartRecording",
            params: { ctrlName: this._ctrlName },
        });
        this.updateState(EnumUpdateType.RecordingStart);
        // Wave 2 T25: capability 层广播 (let 其它 capability 如 timeline/undo 监听)
        CapabilityRegistry.dispatch("onRecordingStart", { ctrl: this });
    }

    /**
     * 扫所有受控 StateSelect 上的 controlled prop, 节点当前值 vs ctrlData[currentState] 不一致
     * 即 dirty. 返回 [{ select, propType, current, stored }, ...].
     */
    private collectControlledDirty(): Array<{ select: StateSelect, propType: EnumPropName, current: unknown, stored: unknown }> {
        const out: Array<{ select: StateSelect, propType: EnumPropName, current: unknown, stored: unknown }> = [];
        this.rebuildStateSelectCache();
        if (!this._stateSelectCache) return out;
        for (const select of this._stateSelectCache) {
            try {
                const list = (select as any).collectDirtyControlled
                    ? (select as any).collectDirtyControlled(this)
                    : [];
                for (const entry of list) out.push({ select, ...entry });
            }
            catch (e) {
                StateErrorManager.warn("collectControlledDirty: StateSelect 收集 dirty 失败", {
                    component: "StateController",
                    method: "collectControlledDirty",
                    params: { error: (e as Error).message },
                });
            }
        }
        return out;
    }

    /**
     * dirty 弹窗: 节点上跟当前 state 不一致的 controlled prop, 3 选 1.
     *  0 = 保存到当前 state (默认)  → commit 节点当前值到 ctrlData + _doStartRecording
     *  1 = 丢弃恢复存储值          → 应用 ctrlData 回节点 (updateState) + _doStartRecording
     *  2 = 取消                    → 不进入录制态
     */
    private promptDirtyAndStart(dirty: Array<{ select: StateSelect, propType: EnumPropName, current: unknown, stored: unknown }>): void {
        const lines = dirty.map(d => {
            const nodeName = d.select.node && d.select.node.name || "?";
            return `  [${nodeName}] ${EnumPropName[d.propType]}`;
        });
        const message = `节点上以下已跟随的 prop 与 state[${this._selectedIndex}] 存储不一致:\n${lines.join("\n")}\n\n如何处理后再进入录制态?`;
        const onSave = () => {
            // 把节点当前值写进 ctrlData (类似 commit 路径)
            for (const d of dirty) {
                try {
                    const propData = (d.select as any).getPropData(this._selectedIndex, this.ctrlId);
                    if (propData) propData[d.propType] = d.current;
                }
                catch (_) { /* noop */ }
            }
            this._doStartRecording();
        };
        const onDiscard = () => {
            // 应用 ctrlData 回节点
            this.rebuildStateSelectCache();
            if (this._stateSelectCache) {
                for (const select of this._stateSelectCache) {
                    try { select.updateState(this); }
                    catch (_) { /* noop */ }
                }
            }
            this._doStartRecording();
        };
        this.showDialog({
            type: "info",
            title: "进入录制前: 节点有未保存改动",
            message,
            buttons: ["保存到当前 state", "丢弃恢复存储值", "取消"],
            defaultId: 0,
            cancelId: 2,
        }, (idx) => {
            if (idx === 0) onSave();
            else if (idx === 1) onDiscard();
            // idx === 2: 取消, 什么都不做
        });
    }

    /**
     * 弹窗封装. cocos 2.x 文档明确 Editor.Dialog 仅 main process 可达, component 在
     * scene renderer 进程跑不通. 用 Electron renderer 原生 window.confirm (同步) 兜底:
     *   - 2 按钮: 一次 confirm, OK=0 / Cancel=1
     *   - 3 按钮: 串联两次 confirm 拼出
     *   - jest 环境: 走 Editor.Dialog (mock 注入), 真编辑器走 window.confirm
     */
    private showDialog(opts: { title: string, message: string, buttons: string[], defaultId?: number, cancelId?: number, type?: string }, cb: (idx: number) => void): void {
        // 优先 Editor.Dialog (jest mock 走这条; 真编辑器 main process 才有)
        try {
            const Ed = (globalThis as any).Editor;
            if (Ed && Ed.Dialog && typeof Ed.Dialog.messageBox === "function") {
                let resolved = false;
                const sync = Ed.Dialog.messageBox(opts, (idx: number) => {
                    if (!resolved) {
                        resolved = true;
                        cb(typeof idx === "number" ? idx : (opts.defaultId || 0));
                    }
                });
                if (!resolved && typeof sync === "number") {
                    resolved = true;
                    cb(sync);
                }
                if (resolved) return;
            }
        }
        catch (_) { /* fall through to window.confirm */ }

        // renderer 同步 fallback (跳过 jsdom: 它的 confirm 是 noop 永远返 false, 测试场景走默认)
        const nav = (globalThis as any).navigator;
        const isJsdom = !!(nav && nav.userAgent && nav.userAgent.indexOf("jsdom") >= 0);
        if (!isJsdom) {
            try {
                const w = (globalThis as any).window;
                if (w && typeof w.confirm === "function") {
                    const head = `${opts.title}\n\n${opts.message}`;
                    if (opts.buttons.length === 2) {
                        const ok = w.confirm(`${head}\n\n确定 = ${opts.buttons[0]}\n取消 = ${opts.buttons[1]}`);
                        cb(ok ? 0 : 1);
                        return;
                    }
                    if (opts.buttons.length === 3) {
                        const first = w.confirm(`${head}\n\n确定 = ${opts.buttons[0]}\n取消 = (进入下一选项)`);
                        if (first) { cb(0); return; }
                        const second = w.confirm(`继续选择:\n\n确定 = ${opts.buttons[1]}\n取消 = ${opts.buttons[2]}`);
                        cb(second ? 1 : 2);
                        return;
                    }
                }
            }
            catch (_) { /* fall through to defaultId */ }
        }

        cb(typeof opts.defaultId === "number" ? opts.defaultId : 0);
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
        // Wave 2 T25: capability 层广播
        CapabilityRegistry.dispatch("onRecordingStop", { ctrl: this });
    }

    /**
     * 录制按钮: 切换 isRecording (Wave 2 实装).
     */
    @property({
        displayName: "🔴 录制",
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
     * 撤销本次录制 (TASK-002, 模型 Z inspector 闭环).
     *
     * 把 ctrlData[_recordingStartState] 回滚到录制开始前的值 (复用 StateSelect.onRecordingStart
     * 已拍的 _snapshot), 置 _recording=false, 不调 stopRecording (避免触发 commit / RecordingStop).
     *
     * 设计:
     *   - 与 stopRecording 平行, 不复用 stopRecording 路径 (后者会 commit + dispatch RecordingStop, 是 cancel 要避免的)
     *   - 录制是事务, cancel 必须完全回滚, 不留 commit 痕迹
     *   - dispatch onRecordingCancel 让其它 capability (如 timeline / undo) 监听
     */
    public cancelRecording(): void {
        if (!this._recording) {
            return;
        }
        const fromState = this._recordingStartState;
        this.rebuildStateSelectCache();
        if (this._stateSelectCache) {
            for (const select of this._stateSelectCache) {
                if (!select || !select.node || !select.node.isValid) continue;
                if (typeof (select as any).applyRecordingSnapshot === "function") {
                    try { (select as any).applyRecordingSnapshot(this, fromState); }
                    catch (e) {
                        StateErrorManager.warn("cancelRecording: applyRecordingSnapshot 失败", {
                            component: "StateController",
                            method: "cancelRecording",
                            params: { error: (e as Error).message },
                        });
                    }
                }
            }
        }
        this._recording = false;
        StateErrorManager.info("撤销录制", {
            component: "StateController",
            method: "cancelRecording",
            params: { ctrlName: this._ctrlName, fromState },
        });
        // 重新应用 state[fromState] 回节点, 让视觉与回滚后的 ctrlData 一致
        this.updateState(EnumUpdateType.State);
        // TASK-002: capability 层广播 cancel 事件 (与 stop 区分, 不发 RecordingStop)
        CapabilityRegistry.dispatch("onRecordingCancel", { ctrl: this, fromState });
    }

    /**
     * 撤销录制按钮 (TASK-002): 仅录制态下点击有效, 调 cancelRecording.
     */
    @property({
        displayName: "⤺ 撤销本次录制",
        tooltip: "丢弃本次录制改动, 回到录制开始前的状态",
    })
    public get cancelRecordTrigger() {
        return false;
    }

    public set cancelRecordTrigger(_value: boolean) {
        if (!CC_EDITOR) return;
        if (this._recording) {
            this.cancelRecording();
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
