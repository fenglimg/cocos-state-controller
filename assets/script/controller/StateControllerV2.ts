const { ccclass, menu, property, executeInEditMode } = cc._decorator;
import { CapabilityRegistry } from "./CapabilityRegistry";
import { cloneValueByType } from "./NestedCtrlData";
// Wave 3 T07: 让所有 L0 内置 capability 跟着 StateControllerV2 一起被打入产出 (side-effect 自注册).
// 显式 /index: cocos 2.x ts 编译路径不做 folder→index 解析, 写 "./capabilities" 会报
// "Cannot find module './capabilities'" (jest 用 node resolver 能解出, 编辑器不行).
import { EnumPropName, EnumStateName, EnumUpdateType } from "./StateEnumV2";
import { StateErrorManager } from "./StateErrorManagerV2";
import { StateSelectV2 } from "./StateSelectV2";
// 仅取 CtrlStateOpsGroup; CtrlRecordGroup 不再在 controller inspector 暴露(录制改由 StateSelect 承载).
// 该 import 仍会加载整个模块, 触发 CtrlRecordGroup 的 @ccclass 注册 — 旧 prefab 序列化里残留的
// 录制组按 cid 反序列化不报错(重存即清).
import { CtrlRecycleBinGroup, CtrlStateOpsGroup } from "./props/CtrlInspectorGroups";
// 支柱 B: 可序列化跨控制器联动 — 复用运行时 binding capability 接线 (无循环依赖: 该 capability 不 import 本类).
import { MultiCtrlBindingCapability } from "./capabilities/MultiCtrlBindingCapability";

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

// 项目内 Component 脚本不传类名: 引擎按 frame.script(文件名 "StateControllerV2")自动注册,
// 避免 editor 告警 3616 "Should not specify class name ... for Component which defines in project".
// getComponent('StateControllerV2') 与 .fire cid 序列化均不受影响 (cid 由 _RF.uuid 注册).
@ccclass
@menu("State/StateControllerV2")
@executeInEditMode()
export class StateControllerV2 extends cc.Component {
    /** 状态id自增 */
    @property({ visible: false })
    private stateIdAuto = 0;

    /** 控制器唯一id，如果使用uuid每次打开编辑器就会变 */
    @property({ visible: false })
    public ctrlId = Date.now();

    /**
     * 支柱 B: 序列化的跨控制器联动声明. JSON 串 [{sourceStateId,targetCtrlId,targetStateId}].
     * 用 targetCtrlId(数字)代替对象引用以便进 .fire/.prefab 序列化; 运行时 start() 时
     * rehydrateBindings 解析 id→ctrl 对象, 复用 MultiCtrlBindingCapability 接线.
     */
    @property({ visible: false })
    private _bindingsData: string = "";

    /** 支柱 B: ctrlId → 实例 全局注册表, 供 binding 按 id 解析目标控制器. */
    private static _byId: { [id: number]: StateControllerV2 } = {};
    public static getById(id: number): StateControllerV2 | null {
        return (typeof id === "number" && StateControllerV2._byId[id]) || null;
    }

    private static _register(ctrl: StateControllerV2): void {
        if (ctrl && typeof ctrl.ctrlId === "number") StateControllerV2._byId[ctrl.ctrlId] = ctrl;
    }

    private static _unregister(ctrl: StateControllerV2): void {
        if (ctrl && typeof ctrl.ctrlId === "number" && StateControllerV2._byId[ctrl.ctrlId] === ctrl) {
            delete StateControllerV2._byId[ctrl.ctrlId];
        }
    }

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
     *   "manual": 用户点录制按钮关 (默认), StateSelectV2.onRecordingStop 走完整路径 + 弹窗
     *   "auto":   selectedIndex setter 自动触发, StateSelectV2.onRecordingStop 走静默 + Editor.log
     * 字段非 @property, 不序列化. 仅在 stopRecording 调用前后短暂有效.
     */
    public stopRecordingMode: "manual" | "auto" = "manual";

    // ================== 🔧 IMPL-001: BFS缓存优化 ==================
    /**
     * 🎯 缓存优化说明：
     * - _stateSelectCache: 缓存当前控制器直接控制的所有StateSelectV2组件
     * - _cacheDirty: 缓存脏标记，当节点结构变化时设为true
     * - 使用缓存后，状态切换从O(n)遍历优化为O(1)查找
     */
    /** 🔧 缓存：存储直接控制的StateSelectV2组件 */
    private _stateSelectCache: StateSelectV2[] = null;

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
                component: "StateControllerV2",
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

    /** 状态顺序上移触发 (普通访问器, inspector 可见性由 stateOps 折叠组代理) */
    public get moveStateUp() {
        return false;
    }

    public set moveStateUp(value: boolean) {
        if (value) {
            this.adjustSelectedStateOrder(-1);
        }
    }

    /** 状态顺序下移触发 (普通访问器, inspector 可见性由 stateOps 折叠组代理) */
    public get moveStateDown() {
        return false;
    }

    public set moveStateDown(value: boolean) {
        if (value) {
            this.adjustSelectedStateOrder(1);
        }
    }

    /** 复制当前状态触发 (普通访问器, inspector 可见性由 stateOps 折叠组代理) */
    public get duplicateCurrentState() {
        return false;
    }

    public set duplicateCurrentState(value: boolean) {
        if (value) {
            this.copySelectedState();
        }
    }

    /** 删除当前状态触发 (普通访问器, inspector 可见性由 stateOps 折叠组代理) */
    public get deleteCurrentState() {
        return false;
    }

    public set deleteCurrentState(value: boolean) {
        if (value) {
            this.removeSelectedState();
        }
    }

    /** 状态名字列表 (反序列化字段). inspector 通过 states getter/setter 暴露. */
    @property({ type: StateValue, visible: false })
    private _states: StateValue[] = [];

    /**
     * 上一次稳定的 state 快照。
     * Cocos Inspector 数组 UI 会先原地改 this._states 再调 setter, 不能依赖 this._states
     * 推导旧长度/旧 id, 否则新增默认 StateValue(name="", stateId=0) 和删除迁移都会漏判。
     */
    private _stateSnapshot: StateValue[] = [];

    /** 软删除 state 暂存。缩短 states 只移出活跃列表, 不立刻清对应 stateId 数据。 */
    @property({ type: StateValue, visible: false })
    private _deletedStates: StateValue[] = [];

    /**
     * 回收站下拉 (restoreTarget / purgeTarget) 的选项→stateId 反查表 (非序列化)。
     * refreshRecycleBinEnums 注入 enumList 时同步刷新; 选项 value=v 对应 _recycleBinOptionIds[v-1]。
     */
    private _recycleBinOptionIds: number[] = [];

    /**
     * 回收站只读预览中的 stateId (非 @property, 不序列化, 重载/反序列化后自动回 -1)。
     * -1 = 未预览。预览不改 selectedIndex (激活态高亮不变), 仅把回收态数据只读叠加到节点;
     * 任何退出路径 (退出/恢复/切state/录制/销毁) 都先 exitPreview 按快照精确还原。
     */
    private _previewingStateId: number = -1;

    /** 状态列表 inspector 入口. cocos 数组 UI 的 + / × / 拖动会调 setter, 走完整 invariants. */
    @property({ type: StateValue, displayName: "states", tooltip: "状态列表 — 用 cocos 数组 UI 直接添加/删除/重排/改名" })
    public get states() {
        return this._states;
    }

    private set states(value: StateValue[]) {
        if (!CC_EDITOR) {
            StateErrorManager.error("非编辑器环境，不更新状态", {
                component: "StateControllerV2",
                method: "states.setter",
            });
            return;
        }

        // TASK-002: 录制中不能修改状态列表 (避免 ctrlData 索引错位).
        if (this._recording) {
            StateErrorManager.warn("录制中不能修改状态列表, 请先停止/撤销录制", {
                component: "StateControllerV2",
                method: "states.setter",
            });
            return;
        }

        // 🔧 输入验证：确保数组有效
        if (!value || !Array.isArray(value)) {
            StateErrorManager.warn("states必须是有效的数组", {
                component: "StateControllerV2",
                method: "states.setter",
                params: { valueType: typeof value, isArray: Array.isArray(value) },
            });
            return;
        }

        const oldStates = this._stateSnapshot.length > 0 ? this._stateSnapshot : this.cloneStateSnapshot(this._states);
        const oldLen = oldStates.length;
        const newLen = value.length;

        let applyIndex: number = this._selectedIndex;

        // 处理状态数量不足的情况
        if (newLen < 2) {
            applyIndex = 0;
            StateErrorManager.warn("建议至少添加两个状态", {
                component: "StateControllerV2",
                method: "states.setter",
                params: { currentStateCount: newLen },
            });
        }

        // 🔧 处理状态变化的核心逻辑
        let deletedIndices: number[] = [];

        // 🔧 首先检查并初始化所有未正确初始化的状态对象
        for (let index = 0; index < newLen; index++) {
            // 🔧 新增的状态由编辑器默认构造，name为""且stateId为0（未分配），需要正确初始化
            const isUninitialized
                = !value[index]
                  || value[index].name === undefined
                  || value[index].stateId === undefined
                  || (value[index].name === "" && value[index].stateId === 0 && index >= oldLen);
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
            deletedIndices = this.findDeletedIndices(oldStates, value);
            this.stashDeletedStates(oldStates, deletedIndices, value);
            let adjustment = 0;
            // #S5: 仅"删在选中**之前**(严格 <)"的 state 才下移选中, 让选中跟随; 删选中**自身**
            // (deletedIndex == applyIndex) 不下移 → 选中保持原 index = 补位进来的下一个 state(用户裁定"选下一个")。
            // 旧 <= 会在删选中自身时多减一位 → 落到前一个; 且与 removeSelectedState 预设值双重调整。
            for (const deletedIndex of deletedIndices) {
                if (deletedIndex < applyIndex) {
                    adjustment++;
                }
            }
            // 应用调整 (clamp 到合法范围: 删末位选中时 applyIndex 可能越界, Math.min 兜底)
            let newIndex = Math.max(0, applyIndex - adjustment);
            newIndex = Math.min(newIndex, newLen - 1);
            applyIndex = newIndex;
        }

        // 🔧 更新内部状态数组
        StateErrorManager.debug("开始更新状态数组", {
            component: "StateControllerV2",
            method: "states.setter",
            params: { oldLength: oldLen, newLength: newLen, deletedCount: deletedIndices.length },
        });

        this._states = value;
        this.ensureUniqueStateIds();

        const stateMap: { [key: string]: boolean } = {};
        const array = value.map((val, i) => {
            if (!val) {
                StateErrorManager.error("状态对象不能为空", {
                    component: "StateControllerV2",
                    method: "states.setter",
                    params: { stateIndex: i },
                });
                return { name: "error", value: i };
            }

            // 🔧 处理重复状态名
            if (stateMap[val.name]) {
                const newName = val.name + "_" + i;
                StateErrorManager.warn("检测到重复的状态名，自动重命名", {
                    component: "StateControllerV2",
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

        this.refreshStateSnapshot();

        // 🔧 通知相关组件状态列表已更新
        if (deletedIndices.length > 0) {
            StateErrorManager.info("状态列表更新完成（包含删除）", {
                component: "StateControllerV2",
                method: "states.setter",
                params: { finalStateCount: newLen, deletedIndices: deletedIndices, currentIndex: applyIndex },
            });
            // state 数据以 stateId 为身份保留。缩短 states 只刷新枚举, 不做 index 数据迁移/清理。
            this.updateState(EnumUpdateType.SelPage);
            // 删除后选中态可能补位/clamp 到新 index (这里 _selectedIndex 是直接赋值, 没走 setter 的
            // 节点 apply 流程), 故主动重绘节点到新选中 state — 否则节点残留被删 state 的视觉,
            // 表现为"删除后当前状态没切换"(尤其删末位/只剩一个状态时)。
            // 注意: 只在删除分支补 apply。新增分支若也 apply 会污染新 state 的 propData。
            this.updateState(EnumUpdateType.State);
        }
        else {
            StateErrorManager.info("状态列表更新完成", {
                component: "StateControllerV2",
                method: "states.setter",
                params: { finalStateCount: newLen, currentIndex: applyIndex },
            });
            this.updateState(EnumUpdateType.SelPage);
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

            // 切换激活态前先退出回收态预览 (按快照还原, 避免预览值残留/与新激活态混淆)
            if (this._previewingStateId >= 0) this.exitPreview();

            // 模型 Z: 录制中切 state → 自动 stopRecording, 把改动 commit 到 fromState 后再切.
            // 标记 stopRecordingMode="auto" 让 StateSelectV2.onRecordingStop 走静默 + log 路径,
            // 不弹"未跟随 prop"窗 (高频操作不打扰). stopRecording 后 _recording=false,
            // 后续 StateWillChange / onStateWillChange 看到 !isRecording 自动跳过, 不重复 commit.
            if (this._recording) {
                this.stopRecordingMode = "auto";
                try {
                    this.stopRecording();
                }
                finally {
                    this.stopRecordingMode = "manual";
                }
            }

            const originalValue = value;
            // 🔧 边界检查：确保状态索引在有效范围内
            value = Math.max(0, Math.min(this._states.length - 1, value));

            if (originalValue !== value) {
                StateErrorManager.warn("状态索引超出范围，已自动调整", {
                    component: "StateControllerV2",
                    method: "selectedIndex.setter",
                    params: { requestedIndex: originalValue, adjustedIndex: value, maxIndex: this._states.length - 1 },
                });
            }

            StateErrorManager.debug("开始状态切换", {
                component: "StateControllerV2",
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
            CapabilityRegistry.dispatch("onStateWillChange", {
                ctrl: this, fromState: this._selectedIndex, toState: value, propType: undefined, propRef: undefined,
            });

            this._previousIndex = this._selectedIndex;
            this._selectedIndex = value;

            // 🔧 通知所有相关组件状态已改变
            this.updateState(EnumUpdateType.State);
            // Wave 2 T25: capability 层广播 state 已切
            // W6-2b: 同 onStateWillChange, 留 propType / propRef 字段位
            CapabilityRegistry.dispatch("onStateChanged", {
                ctrl: this, fromState: this._previousIndex, toState: value, propType: undefined, propRef: undefined,
            });

            // 🔧 编辑器环境下同步属性更新
            if (CC_EDITOR) {
                this.updateState(EnumUpdateType.Prop);
                // 🔧 IMPL-002.1: 触发selectedPage变更通知
                this._emitSelectedPageChanged();
            }

            this.isChanging = false;

            StateErrorManager.info("状态切换完成", {
                component: "StateControllerV2",
                method: "selectedIndex.setter",
                params: { newState: value, stateName: this.selectedPage },
            });
        }
    }

    /** 状态操作折叠组 (上移/下移/复制/删除) — inspector 可折叠区域, 代理到本类同名访问器. */
    @property({ type: CtrlStateOpsGroup, displayName: "状态操作", tooltip: "对当前选中状态的结构操作 (上移/下移/复制/删除)" })
    public stateOps = new CtrlStateOpsGroup();

    /** 回收站折叠组 (恢复/彻底删除已移除状态) — inspector 可折叠区域, 代理到本类回收站访问器. */
    @property({ type: CtrlRecycleBinGroup, displayName: "回收站", tooltip: "已移除状态的暂存区 — 可恢复, 或彻底删除 (硬删数据, 不可恢复)" })
    public recycleBin = new CtrlRecycleBinGroup();

    /**
     * 一键刷新 inspector (对齐 StateSelectV2.refreshInspectorTrigger).
     * 在 panel/外部改了状态后 inspector 偶尔不自动刷新时手动触发, 重建 state 枚举 + 强制 cocos refreshSelectedInspector.
     */
    @property({ displayName: "🔄 刷新 inspector", tooltip: "手动刷新 inspector: 重建 state 枚举显示 + 强制 cocos refreshSelectedInspector" })
    public get refreshInspectorTrigger(): boolean {
        return false;
    }

    public set refreshInspectorTrigger(_value: boolean) {
        if (!CC_EDITOR) return;
        this.refreshSelectedPage();
        this.forceRefreshInspector();
    }

    /** 🔧 调整当前选中状态的顺序 */
    private adjustSelectedStateOrder(offset: number) {
        if (!CC_EDITOR) {
            StateErrorManager.error("仅在编辑器中调整状态顺序", {
                component: "StateControllerV2",
                method: "adjustSelectedStateOrder",
            });
            return;
        }

        // TASK-002: 录制中不能调整状态顺序.
        if (this._recording) {
            StateErrorManager.warn("录制中不能调整状态顺序, 请先停止/撤销录制", {
                component: "StateControllerV2",
                method: "adjustSelectedStateOrder",
            });
            return;
        }

        if (!this._states || this._states.length === 0) {
            StateErrorManager.warn("当前没有可调整的状态", {
                component: "StateControllerV2",
                method: "adjustSelectedStateOrder",
            });
            return;
        }

        const fromIndex = this._selectedIndex;
        if (fromIndex < 0 || fromIndex >= this._states.length) {
            StateErrorManager.warn("选中的状态索引无效，无法调整顺序", {
                component: "StateControllerV2",
                method: "adjustSelectedStateOrder",
                params: { selectedIndex: fromIndex, stateCount: this._states.length },
            });
            return;
        }

        const targetIndex = fromIndex + offset;
        if (targetIndex < 0 || targetIndex >= this._states.length) {
            StateErrorManager.warn("已到达边界，无法继续移动", {
                component: "StateControllerV2",
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

        // 🔧 通知 StateSelectV2 携带数据一起移动
        this.updateState(EnumUpdateType.Move, { fromIndex: fromIndex, toIndex: targetIndex });

        StateErrorManager.info("状态顺序已调整", {
            component: "StateControllerV2",
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
                component: "StateControllerV2",
                method: "copySelectedState",
            });
            return;
        }

        // TASK-002: 录制中不能复制状态.
        if (this._recording) {
            StateErrorManager.warn("录制中不能复制状态, 请先停止/撤销录制", {
                component: "StateControllerV2",
                method: "copySelectedState",
            });
            return;
        }

        if (!this._states || this._states.length === 0) {
            StateErrorManager.warn("当前没有可复制的状态", {
                component: "StateControllerV2",
                method: "copySelectedState",
            });
            return;
        }

        const index = this._selectedIndex;
        if (index < 0 || index >= this._states.length) {
            StateErrorManager.warn("选中的状态索引无效，无法复制", {
                component: "StateControllerV2",
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
        // 先派发 Copy 让各 StateSelectV2 深拷贝 pageData, 再发 State 让所有 select apply 当前 state
        this.updateState(EnumUpdateType.Copy, { fromIndex: index, toIndex: insertIndex });
        this.updateState(EnumUpdateType.State);

        StateErrorManager.info("已复制当前状态", {
            component: "StateControllerV2",
            method: "copySelectedState",
            params: { fromIndex: index, insertIndex: insertIndex, originName: baseName, newName: copyName },
        });
    }

    /** 🔧 删除当前选中的状态，至少保留一个 */
    private removeSelectedState() {
        if (!CC_EDITOR) {
            StateErrorManager.error("仅在编辑器中删除状态", {
                component: "StateControllerV2",
                method: "removeSelectedState",
            });
            return;
        }

        // TASK-002: 录制中不能删除状态.
        if (this._recording) {
            StateErrorManager.warn("录制中不能删除状态, 请先停止/撤销录制", {
                component: "StateControllerV2",
                method: "removeSelectedState",
            });
            return;
        }

        if (!this._states || this._states.length === 0) {
            StateErrorManager.warn("当前没有可删除的状态", {
                component: "StateControllerV2",
                method: "removeSelectedState",
            });
            return;
        }

        if (this._states.length <= 1) {
            StateErrorManager.warn("至少保留一个状态，已取消删除", {
                component: "StateControllerV2",
                method: "removeSelectedState",
                params: { stateCount: this._states.length },
            });
            return;
        }

        const index = this._selectedIndex;
        if (index < 0 || index >= this._states.length) {
            StateErrorManager.warn("选中的状态索引无效，无法删除", {
                component: "StateControllerV2",
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
            component: "StateControllerV2",
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
        StateControllerV2._register(this); // 支柱 B: 编辑器期也登记, 供 binding 解析 + 面板观测
        if (!CC_EDITOR) {
            return;
        }

        // 初始化 inspector 折叠组的 owner 回引 (facade 代理到本类访问器)
        this.stateOps.owner = this;
        this.recycleBin.owner = this;

        StateErrorManager.debug("开始控制器预加载", {
            component: "StateControllerV2",
            method: "__preload",
            params: { hasStates: !!this._states.length, ctrlName: this._ctrlName },
        });

        if (!this._states.length) {
            // 🔧 从1开始命名状态
            this._states = [StateValue.create("1", this.stateIdAuto++), StateValue.create("2", this.stateIdAuto++)];
            StateErrorManager.info("创建默认状态", {
                component: "StateControllerV2",
                method: "__preload",
                params: { defaultStates: ["1", "2"] },
            });
        }

        // 🔧 修复历史数据: 部分老 prefab 的 state 全是 stateId=0(未分配)或存在重复,
        // 会导致"按 id 切换/联动定位"落到首个匹配 state(无法切换), 这里保证 stateId 唯一.
        this.ensureUniqueStateIds();
        this.refreshStateSnapshot();

        const array = this.states.map((val, i) => {
            return { name: val.name, value: i };
        });

        // @ts-expect-error 允许使用该方法
        cc.Class.Attr.setClassAttr(this, "selectedIndex", "enumList", array);

        // 回收站下拉初始 enumList 注入 (反序列化后 _deletedStates 可能已有暂存项)
        this.refreshRecycleBinEnums();

        // 🔧 确保selectedIndex在有效范围内，默认选择第一个状态
        if (this._states.length > 0 && (this._selectedIndex < 0 || this._selectedIndex >= this._states.length)) {
            this._selectedIndex = 0;
            StateErrorManager.info("初始化时自动设置selectedIndex为第一个状态", {
                component: "StateControllerV2",
                method: "__preload",
            });
        }

        if (!this._ctrlName) {
            this.ctrlName = `ctrl_${Date.now().toString()}`;
            StateErrorManager.debug("生成默认控制器名称", {
                component: "StateControllerV2",
                method: "__preload",
                params: { generatedName: this._ctrlName },
            });
        }

        StateErrorManager.info("控制器预加载完成", {
            component: "StateControllerV2",
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

    /**
     * 保证每个 state 的 stateId 唯一(修复历史数据)。
     * 重复 / 非法(undefined/非数字)的 stateId 会重新分配自增 id, 并把 stateIdAuto seed 到最大 id 之后,
     * 避免后续新增 state 再次撞 id。首个出现的合法 id 保留(含 0), 故对已正常的数据是幂等空操作。
     */
    private ensureUniqueStateIds(): void {
        const states = this._states || [];
        let maxId = -1;
        for (const s of states) {
            if (s && typeof s.stateId === "number" && s.stateId > maxId) {
                maxId = s.stateId;
            }
        }
        // stateIdAuto 必须领先于现存最大 id, 否则自增分配会与既有 id 撞车
        if (this.stateIdAuto <= maxId) {
            this.stateIdAuto = maxId + 1;
        }

        const seen: { [id: number]: boolean } = {};
        let repaired = 0;
        for (const s of states) {
            if (!s) {
                continue;
            }
            const invalid = typeof s.stateId !== "number" || seen[s.stateId];
            if (invalid) {
                s.stateId = this.stateIdAuto++;
                repaired++;
            }
            seen[s.stateId] = true;
        }

        if (repaired > 0) {
            StateErrorManager.info("修复重复/未分配的 stateId", {
                component: "StateControllerV2",
                method: "ensureUniqueStateIds",
                params: { ctrlName: this._ctrlName, repairedCount: repaired, stateCount: states.length },
            });
        }
    }

    private cloneStateSnapshot(states: StateValue[]): StateValue[] {
        const snapshot: StateValue[] = [];
        for (const state of states || []) {
            if (!state) continue;
            snapshot.push(StateValue.create(state.name, state.stateId));
        }
        return snapshot;
    }

    private refreshStateSnapshot(): void {
        this._stateSnapshot = this.cloneStateSnapshot(this._states);
    }

    private stashDeletedStates(oldStates: StateValue[], deletedIndices: number[], activeStates: StateValue[]): void {
        if (!deletedIndices.length) return;
        if (!this._deletedStates) this._deletedStates = [];
        const activeIds = new Set<number>();
        for (const state of activeStates || []) {
            if (state && typeof state.stateId === "number") {
                activeIds.add(state.stateId);
            }
        }
        const stashedIds = new Set<number>();
        for (const state of this._deletedStates) {
            if (state && typeof state.stateId === "number") {
                stashedIds.add(state.stateId);
            }
        }
        for (const index of deletedIndices) {
            const state = oldStates[index];
            if (!state || typeof state.stateId !== "number") continue;
            if (activeIds.has(state.stateId) || stashedIds.has(state.stateId)) continue;
            this._deletedStates.push(StateValue.create(state.name, state.stateId));
            stashedIds.add(state.stateId);
        }
        this.refreshRecycleBinEnums();
    }

    /** 回收站: 列出所有暂存的已删除 state (不可变副本, panel 渲染回收站列表用). */
    public listDeletedStates(): { name: string, stateId: number }[] {
        const out: { name: string, stateId: number }[] = [];
        for (const s of this._deletedStates || []) {
            if (s && typeof s.stateId === "number") out.push({ name: s.name, stateId: s.stateId });
        }
        return out;
    }

    public restoreLastDeletedState(): boolean {
        if (!this._deletedStates || this._deletedStates.length === 0) {
            StateErrorManager.warn("没有可恢复的 state", {
                component: "StateControllerV2",
                method: "restoreLastDeletedState",
            });
            return false;
        }
        const last = this._deletedStates[this._deletedStates.length - 1];
        return this.restoreDeletedState(last.stateId);
    }

    /**
     * 回收站: 恢复指定 stateId 的暂存 state, 追加到尾部并选中.
     * 具体属性数据自动接回 —— _ctrlData 以 stateId 寻址, 软删时从未清理过该页数据。
     */
    public restoreDeletedState(stateId: number): boolean {
        if (!CC_EDITOR) {
            StateErrorManager.error("仅在编辑器中恢复状态", {
                component: "StateControllerV2",
                method: "restoreDeletedState",
            });
            return false;
        }
        if (!this._deletedStates || this._deletedStates.length === 0) return false;
        const i = this._deletedStates.findIndex(s => s && s.stateId === stateId);
        if (i < 0) {
            StateErrorManager.warn("回收站中找不到该 state, 无法恢复", {
                component: "StateControllerV2",
                method: "restoreDeletedState",
                params: { stateId },
            });
            return false;
        }
        // 恢复前退出预览: 恢复后会以激活态重新 apply, 不需要预览叠加
        if (this._previewingStateId >= 0) this.exitPreview();
        const restored = this._deletedStates.splice(i, 1)[0];
        if (!restored) return false;
        this.states = [...this._states, StateValue.create(restored.name, restored.stateId)];
        this.selectedIndex = this._states.length - 1;
        this.refreshRecycleBinEnums();
        return true;
    }

    /**
     * 回收站硬删: 把指定 stateId 从回收站移除, 并广播 PurgeStateId 让所有受控
     * StateSelectV2 清掉 _ctrlData[stateId] 的页数据 —— 不可恢复。
     */
    public purgeDeletedState(stateId: number): boolean {
        if (!CC_EDITOR) {
            StateErrorManager.error("仅在编辑器中彻底删除状态", {
                component: "StateControllerV2",
                method: "purgeDeletedState",
            });
            return false;
        }
        if (!this._deletedStates || this._deletedStates.length === 0) return false;
        const i = this._deletedStates.findIndex(s => s && s.stateId === stateId);
        if (i < 0) {
            StateErrorManager.warn("回收站中找不到该 state, 无法彻底删除", {
                component: "StateControllerV2",
                method: "purgeDeletedState",
                params: { stateId },
            });
            return false;
        }
        // 硬删前退出预览 (尤其当正预览的就是它 — 数据即将被清, 先按快照还原节点)
        if (this._previewingStateId >= 0) this.exitPreview();
        this._deletedStates.splice(i, 1);
        // 数据实体散在各受控 StateSelectV2 上, 广播让它们各自 delete pageData[stateId]
        this.updateState(EnumUpdateType.PurgeStateId, stateId);
        this.refreshRecycleBinEnums();
        StateErrorManager.info("已彻底删除 state 数据 (不可恢复)", {
            component: "StateControllerV2",
            method: "purgeDeletedState",
            params: { stateId },
        });
        return true;
    }

    /** 回收站: 清空 —— 对所有暂存项执行硬删. */
    public purgeAllDeletedStates(): boolean {
        if (!CC_EDITOR) {
            StateErrorManager.error("仅在编辑器中清空回收站", {
                component: "StateControllerV2",
                method: "purgeAllDeletedStates",
            });
            return false;
        }
        if (!this._deletedStates || this._deletedStates.length === 0) return false;
        // 清空前退出预览 (数据即将被清, 先按快照还原节点)
        if (this._previewingStateId >= 0) this.exitPreview();
        const ids: number[] = [];
        for (const s of this._deletedStates) {
            if (s && typeof s.stateId === "number") ids.push(s.stateId);
        }
        this._deletedStates = [];
        for (const id of ids) {
            this.updateState(EnumUpdateType.PurgeStateId, id);
        }
        this.refreshRecycleBinEnums();
        StateErrorManager.info("已清空回收站 (不可恢复)", {
            component: "StateControllerV2",
            method: "purgeAllDeletedStates",
            params: { count: ids.length },
        });
        return true;
    }

    // ===== 回收站 inspector 折叠组 (CtrlRecycleBinGroup) 代理 =====

    /** 回收站只读展示: ["name (id N)", ...]. */
    public getDeletedStatesDisplay(): string[] {
        return (this._deletedStates || []).map(s => `${s.name} (id ${s.stateId})`);
    }

    /**
     * 注入回收站两个下拉 (restoreTarget / purgeTarget) 的 enumList 到 CtrlRecycleBinGroup 类上,
     * 并刷新 value→stateId 反查表. 在回收站内容变化处调 (stash / restore / purge / __preload)。
     * 注入到类而非实例: 编辑器读嵌套 facade 枚举走类 __attrs__ (同 SelectExcludeGroup.addExcludeTrigger)。
     */
    public refreshRecycleBinEnums(): void {
        if (!CC_EDITOR) return;
        const items = this._deletedStates || [];
        this._recycleBinOptionIds = items.map(s => s.stateId);
        const options = items.map((s, i) => ({ name: `${s.name} (id ${s.stateId})`, value: i + 1 }));
        const restoreEnum = [
            { name: items.length ? "(选择要恢复的状态…)" : "(回收站为空)", value: 0 },
            ...options,
        ];
        const purgeEnum = [
            { name: items.length ? "(选择要彻底删除的状态…)" : "(回收站为空)", value: 0 },
            ...options,
        ];
        const previewEnum = [
            { name: items.length ? "(选择要预览的状态…)" : "(回收站为空)", value: 0 },
            ...options,
        ];
        // @ts-expect-error setClassAttr 在 cocos 2.x d.ts 中未声明
        cc.Class.Attr.setClassAttr(CtrlRecycleBinGroup, "restoreTarget", "enumList", restoreEnum);
        // @ts-expect-error setClassAttr 在 cocos 2.x d.ts 中未声明
        cc.Class.Attr.setClassAttr(CtrlRecycleBinGroup, "purgeTarget", "enumList", purgeEnum);
        // @ts-expect-error setClassAttr 在 cocos 2.x d.ts 中未声明
        cc.Class.Attr.setClassAttr(CtrlRecycleBinGroup, "previewTarget", "enumList", previewEnum);
    }

    /** 把下拉 value 反查成 stateId (value>=1, 选项 index=value-1). */
    private _recycleStateIdOfOption(value: number): number {
        if (typeof value !== "number" || value <= 0) return -1;
        const stateId = this._recycleBinOptionIds[value - 1];
        return typeof stateId === "number" ? stateId : -1;
    }

    /** 回收站下拉「↩ 恢复状态」: 选中即恢复. */
    public recycleRestorePick(value: number): void {
        if (!CC_EDITOR) return;
        const stateId = this._recycleStateIdOfOption(value);
        if (stateId < 0) return;
        this.restoreDeletedState(stateId);
    }

    /** 回收站下拉「🗑 彻底删除」: 选中 → 弹窗确认 → 硬删 (不可恢复). */
    public recyclePurgePick(value: number): void {
        if (!CC_EDITOR) return;
        const stateId = this._recycleStateIdOfOption(value);
        if (stateId < 0) return;
        const item = (this._deletedStates || []).find(s => s.stateId === stateId);
        const label = item ? `${item.name} (id ${stateId})` : `id ${stateId}`;
        this.showDialog({
            type: "warning",
            title: "彻底删除状态数据",
            message: `将彻底删除「${label}」的数据, 不可恢复。确定?`,
            buttons: ["彻底删除", "取消"],
            defaultId: 1,
            cancelId: 1,
        }, (idx) => {
            if (idx === 0) this.purgeDeletedState(stateId);
        });
    }

    /** 回收站「清空回收站」: 弹窗确认 → 全部硬删 (不可恢复). */
    public recyclePurgeAll(): void {
        if (!CC_EDITOR) return;
        const n = (this._deletedStates || []).length;
        if (!n) return;
        this.showDialog({
            type: "warning",
            title: "清空回收站",
            message: `将彻底删除回收站内全部 ${n} 个状态的数据, 不可恢复。确定?`,
            buttons: ["清空回收站", "取消"],
            defaultId: 1,
            cancelId: 1,
        }, (idx) => {
            if (idx === 0) this.purgeAllDeletedStates();
        });
    }

    /** 回收站下拉「👁 预览」: 选中即进入只读预览 (inspector 折叠组代理). */
    public recyclePreviewPick(value: number): void {
        if (!CC_EDITOR) return;
        const stateId = this._recycleStateIdOfOption(value);
        if (stateId < 0) return;
        this.previewDeletedState(stateId);
    }

    /** 回收站「退出预览」按钮 (inspector 折叠组代理). */
    public recycleExitPreview(): void {
        if (!CC_EDITOR) return;
        this.exitPreview();
    }

    // ===== 回收站只读预览 =====

    /** 是否正在预览某个回收态. */
    public get isPreviewing(): boolean {
        return this._previewingStateId >= 0;
    }

    /** 当前预览的 stateId (-1 = 未预览). */
    public get previewingStateId(): number {
        return this._previewingStateId;
    }

    /**
     * 进入某个回收态的只读预览: 把该 stateId 的数据叠加到受控节点 (不改 selectedIndex)。
     * 单实例: 预览另一个前先退出当前预览。仅回收站内的 stateId 可预览; 录制中先停预览不允许进入。
     */
    public previewDeletedState(stateId: number): boolean {
        if (!CC_EDITOR) {
            StateErrorManager.error("仅在编辑器中预览状态", {
                component: "StateControllerV2",
                method: "previewDeletedState",
            });
            return false;
        }
        // 录制中不预览 (避免把预览值 commit 进激活态)
        if (this._recording) {
            StateErrorManager.warn("录制中不能预览回收态, 请先停止录制", {
                component: "StateControllerV2",
                method: "previewDeletedState",
            });
            return false;
        }
        const exists = (this._deletedStates || []).some(s => s && s.stateId === stateId);
        if (!exists) {
            StateErrorManager.warn("回收站中找不到该 state, 无法预览", {
                component: "StateControllerV2",
                method: "previewDeletedState",
                params: { stateId },
            });
            return false;
        }
        // 已在预览同一个 → no-op; 预览别的 → 先退出当前 (按快照还原) 再进
        if (this._previewingStateId === stateId) return true;
        if (this._previewingStateId >= 0) this.exitPreview();
        this._previewingStateId = stateId;
        this.updateState(EnumUpdateType.PreviewEnter, stateId);
        StateErrorManager.info("进入回收态只读预览", {
            component: "StateControllerV2",
            method: "previewDeletedState",
            params: { stateId },
        });
        return true;
    }

    /** 退出预览: 通知所有受控 StateSelectV2 按快照精确还原节点. 幂等, 未预览时 no-op. */
    public exitPreview(): boolean {
        if (this._previewingStateId < 0) return false;
        const wasPreviewing = this._previewingStateId;
        this._previewingStateId = -1;
        this.updateState(EnumUpdateType.PreviewExit);
        StateErrorManager.info("退出回收态预览", {
            component: "StateControllerV2",
            method: "exitPreview",
            params: { stateId: wasPreviewing },
        });
        return true;
    }

    /** Wave 2 T16: 场景切换前的兜底 commit hook. */
    private _onSceneBeforeLaunch(): void {
        // 场景切换前退出预览, 按快照还原节点 (预览态不应被序列化进场景)
        if (this._previewingStateId >= 0) this.exitPreview();
        if (this._recording) {
            StateErrorManager.info("场景切换前自动停止录制", {
                component: "StateControllerV2",
                method: "_onSceneBeforeLaunch",
                params: { ctrlName: this._ctrlName },
            });
            this.stopRecording();
        }
    }

    protected onLoad() {
        StateControllerV2._register(this); // 支柱 B: 运行时也登记 (start() rehydrate 需按 id 解析目标)
        if (!CC_EDITOR) {
            // Wave 3: runtime 启动 capability hook (HomePage 等用此跳到指定 state)
            CapabilityRegistry.dispatch("onRuntimeInit", { ctrl: this });
            return;
        }
        this.updateState(EnumUpdateType.State);
    }

    /**
     * 支柱 B: 运行时把序列化 binding 解析并接线. 放在 start() 而非 onLoad —
     * Cocos 保证所有组件 onLoad 先于任意 start, 故此刻全场景控制器都已登记进 _byId,
     * 跨控制器目标按 id 解析不受加载顺序影响.
     */
    protected start() {
        if (CC_EDITOR) return;
        this.rehydrateBindings();
    }

    protected onDestroy() {
        StateControllerV2._unregister(this); // 支柱 B
        if (!CC_EDITOR) {
            return;
        }
        // 销毁前退出预览, 按快照还原节点
        if (this._previewingStateId >= 0) this.exitPreview();
        // Wave 2 T16: onDestroy 兜底 - 若仍在录制, stopRecording 触发 final commit
        if (this._recording) {
            StateErrorManager.info("控制器销毁前自动停止录制 (commit final diff)", {
                component: "StateControllerV2",
                method: "onDestroy",
            });
            this.stopRecording();
        }
        if (cc.director && typeof cc.director.off === "function") {
            cc.director.off(cc.Director.EVENT_BEFORE_SCENE_LAUNCH, this._onSceneBeforeLaunch, this);
        }
        this.updateState(EnumUpdateType.Delete);
    }

    // ===== 支柱 B: 可序列化跨控制器联动 API =====

    /** 读出序列化的联动声明 (容错: 坏数据返回空). */
    public getBindings(): { sourceStateId: number, targetCtrlId: number, targetStateId: number }[] {
        if (!this._bindingsData) return [];
        try {
            const arr = JSON.parse(this._bindingsData);
            if (!Array.isArray(arr)) return [];
            return arr
                .filter(b => b && typeof b.sourceStateId === "number" && typeof b.targetCtrlId === "number" && typeof b.targetStateId === "number")
                .map(b => ({ sourceStateId: b.sourceStateId, targetCtrlId: b.targetCtrlId, targetStateId: b.targetStateId }));
        }
        catch {
            return [];
        }
    }

    private _saveBindings(list: { sourceStateId: number, targetCtrlId: number, targetStateId: number }[]): void {
        this._bindingsData = JSON.stringify(list);
    }

    /** 新增/更新一条联动: 本控制器切到 sourceStateId → 目标控制器(targetCtrlId)切到 targetStateId. 同 (源态,目标) 覆盖. */
    public addBinding(sourceStateId: number, targetCtrlId: number, targetStateId: number): boolean {
        if (typeof sourceStateId !== "number" || typeof targetCtrlId !== "number" || typeof targetStateId !== "number") return false;
        const list = this.getBindings();
        const i = list.findIndex(b => b.sourceStateId === sourceStateId && b.targetCtrlId === targetCtrlId);
        if (i >= 0) list[i].targetStateId = targetStateId;
        else list.push({ sourceStateId, targetCtrlId, targetStateId });
        this._saveBindings(list);
        return true;
    }

    /** 删除一条联动. */
    public removeBinding(sourceStateId: number, targetCtrlId: number): boolean {
        const list = this.getBindings();
        const i = list.findIndex(b => b.sourceStateId === sourceStateId && b.targetCtrlId === targetCtrlId);
        if (i < 0) return false;
        list.splice(i, 1);
        this._saveBindings(list);
        return true;
    }

    /** 清空本控制器全部联动 (序列化 + 运行时接线). */
    public clearBindings(): void {
        this._bindingsData = "";
        MultiCtrlBindingCapability.clearAllBindings(this);
    }

    /**
     * 把序列化 binding 解析成运行时接线 (复用 MultiCtrlBindingCapability). 幂等: 先清后接, 重复调用不叠加.
     * 目标 ctrlId 未登记 (未加载) 时跳过该条, 不抛.
     */
    public rehydrateBindings(): void {
        MultiCtrlBindingCapability.clearAllBindings(this);
        const list = this.getBindings();
        for (let i = 0; i < list.length; i++) {
            const b = list[i];
            const target = StateControllerV2.getById(b.targetCtrlId);
            if (target) MultiCtrlBindingCapability.addBinding(this, b.sourceStateId, target, b.targetStateId);
        }
    }

    /** 选择的状态名字 */
    public get selectedPage(): string {
        // 🔧 IMPL-002.4: 添加调试日志
        StateErrorManager.debug("获取selectedPage", {
            component: "StateControllerV2",
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
                    component: "StateControllerV2",
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
            component: "StateControllerV2",
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
                component: "StateControllerV2",
                method: "refreshSelectedPage",
            });
            return;
        }

        StateErrorManager.info("手动刷新selectedPage", {
            component: "StateControllerV2",
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
            component: "StateControllerV2",
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
                    component: "StateControllerV2",
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
                component: "StateControllerV2",
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
            component: "StateControllerV2",
            method: "getSmartStateName",
            params: { index: index, defaultName: defaultName },
        });
        return defaultName;
    }

    // ================== 🔧 IMPL-001: BFS缓存优化方法 ==================

    /**
     * 🔧 重建StateSelectV2缓存
     * 使用getComponentsInChildren一次性获取所有StateSelectV2，然后过滤出直接控制的组件
     */
    private rebuildStateSelectCache(): void {
        if (!this._cacheDirty && this._stateSelectCache !== null) {
            return; // 缓存有效，无需重建
        }

        StateErrorManager.debug("开始重建StateSelectV2缓存", {
            component: "StateControllerV2",
            method: "rebuildStateSelectCache",
            params: { ctrlName: this._ctrlName },
        });

        const allStateSelects = this.node.getComponentsInChildren(StateSelectV2);
        this._stateSelectCache = allStateSelects.filter(ss => this.isDirectlyControlled(ss.node));

        this._cacheDirty = false;

        StateErrorManager.info("StateSelectV2缓存重建完成", {
            component: "StateControllerV2",
            method: "rebuildStateSelectCache",
            params: { cachedCount: this._stateSelectCache.length },
        });
    }

    /**
     * 🔧 检查节点是否被当前控制器直接控制
     * 直接控制 = 节点与控制器之间没有其他StateControllerV2
     */
    private isDirectlyControlled(targetNode: cc.Node): boolean {
        // #T1: targetNode 自身带其它 StateControllerV2 → 归它(及其子树)管, 不是本(祖先)控制器直接控制。
        // 原实现只查父链中间 controller, 漏了 targetNode 自身 → 自带 controller 的节点被祖先双 claim。
        if (targetNode && targetNode !== this.node) {
            const ownController = targetNode.getComponent(StateControllerV2);
            if (ownController && ownController !== this) {
                return false;
            }
        }

        let current: cc.Node = targetNode;

        while (current && current !== this.node) {
            const parent = current.parent;
            if (!parent) break;

            // 如果父节点不是当前控制器节点，检查父节点上是否有其他StateControllerV2
            if (parent !== this.node) {
                const parentController = parent.getComponent(StateControllerV2);
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
     * 当节点增删或StateSelectV2组件增删时调用
     */
    public markCacheDirty(): void {
        this._cacheDirty = true;
        StateErrorManager.debug("缓存已标记为脏", {
            component: "StateControllerV2",
            method: "markCacheDirty",
            params: { ctrlName: this._ctrlName },
        });
    }

    /** 🔧 核心方法：状态更新通知机制 - 使用缓存优化 (IMPL-001) */
    private updateState(type: EnumUpdateType, value?: unknown) {
        // 🔧 IMPL-001: 使用缓存替代BFS遍历
        this.rebuildStateSelectCache();

        // 🔧 直接遍历缓存的StateSelectV2组件
        for (const stateSelect of this._stateSelectCache) {
            // 注意：不能用 `!stateSelect.node.active` 做过滤。
            // 那会让"上一个 state 把 node 关掉、新 state 应该重新开"的场景失效 —
            // 下一次 updateState 因为 node.active=false 而被 skip，永远拿不到 active=true 的 apply。
            // 这里只过滤真正失效的组件/节点。
            if (!stateSelect || !stateSelect.node || !stateSelect.node.isValid) {
                continue;
            }

            if (type == EnumUpdateType.State) {
                // 🔧 状态切换：通知StateSelectV2组件状态已改变
                stateSelect.updateState(this);
                // Wave 2: 录制中切 state, apply 完新 state 后通知 select 重拍 snapshot
                if (this._recording && typeof (stateSelect as any).onStateChanged === "function") {
                    (stateSelect as any).onStateChanged(this);
                }
                // 刻意不调 stateSelect.forceRefreshInspector(): 全量刷新 inspector
                // 会丢焦点 / 抖动. inspector 陈旧显示由 panel 主动接管 (无插件闭环).
            }
            else if (type == EnumUpdateType.Name) {
                // 🔧 名称更新：通知StateSelectV2组件控制器名称已更改
                stateSelect.updateCtrlName(this.node);
            }
            else if (type == EnumUpdateType.SelPage) {
                // 🔧 状态页面更新：通知StateSelectV2组件状态列表已更改
                stateSelect.updateCtrlPage(this, value as number);
            }
            else if (type == EnumUpdateType.Delete) {
                // 🔧 删除通知：通知StateSelectV2组件控制器即将被删除
                stateSelect.updateDelete(this);
            }
            else if (type == EnumUpdateType.Init) {
                // 🔧 初始化通知：通知StateSelectV2组件控制器已完成初始化
                stateSelect.updatePreLoad(this);
            }
            else if (type == EnumUpdateType.Prop) {
                // 🔧 属性更新：通知StateSelectV2组件属性已更改
                stateSelect.updateProp(this);
            }
            else if (type == EnumUpdateType.Move) {
                // 🔧 状态顺序变更：通知StateSelectV2同步状态数据顺序
                // @ts-expect-error 允许使用该方法
                stateSelect.updateStateMove(this, value);
            }
            else if (type == EnumUpdateType.Copy) {
                // 🔧 状态复制：通知 StateSelectV2 深拷贝 pageData[fromIndex] → pageData[toIndex]
                // @ts-expect-error 允许使用该方法
                stateSelect.updateStateCopy(this, value);
            }
            else if (type == EnumUpdateType.RecordingStart) {
                // Wave 2: 录制开始, StateSelectV2 拍 snapshot
                if (typeof (stateSelect as any).onRecordingStart === "function") {
                    (stateSelect as any).onRecordingStart(this);
                }
            }
            else if (type == EnumUpdateType.RecordingStop) {
                // Wave 2: 录制结束, StateSelectV2 final commit + 清 snapshot
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
            else if (type == EnumUpdateType.PurgeStateId) {
                // 回收站硬删: 清掉该 stateId 在本 select 上的页数据, value = stateId
                if (typeof (stateSelect as any).purgeStateData === "function") {
                    (stateSelect as any).purgeStateData(this, value as number);
                }
            }
            else if (type == EnumUpdateType.PreviewEnter) {
                // 回收站预览: 快照 + apply 该 stateId 数据到节点, value = stateId
                if (typeof (stateSelect as any).enterPreview === "function") {
                    (stateSelect as any).enterPreview(this, value as number);
                }
            }
            else if (type == EnumUpdateType.PreviewExit) {
                // 回收站预览退出: 按快照精确还原节点
                if (typeof (stateSelect as any).exitPreview === "function") {
                    (stateSelect as any).exitPreview();
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
     * 进入录制态: 通知所有 StateSelectV2.onRecordingStart 拍 snapshot.
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
        // 录制前先退出回收态预览 (避免把预览值当作节点改动 commit 进激活态)
        if (this._previewingStateId >= 0) this.exitPreview();
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
            component: "StateControllerV2",
            method: "_doStartRecording",
            params: { ctrlName: this._ctrlName },
        });
        this.updateState(EnumUpdateType.RecordingStart);
        // Wave 2 T25: capability 层广播 (let 其它 capability 如 timeline/undo 监听)
        CapabilityRegistry.dispatch("onRecordingStart", { ctrl: this });
    }

    /**
     * 扫所有受控 StateSelectV2 上的 controlled prop, 节点当前值 vs ctrlData[currentState] 不一致
     * 即 dirty. 返回 [{ select, propType?, propRef?, current, stored }, ...].
     *
     * W6-2a-fixup: schema 升级 - dirty entry 含双 key (内置 propType / 自定义 propRef).
     * 调用方 promptDirtyAndStart 显示与写回路径同步兼容.
     */
    private collectControlledDirty(): Array<{ select: StateSelectV2, propType?: EnumPropName, propRef?: string, current: unknown, stored: unknown }> {
        const out: Array<{ select: StateSelectV2, propType?: EnumPropName, propRef?: string, current: unknown, stored: unknown }> = [];
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
                StateErrorManager.warn("collectControlledDirty: StateSelectV2 收集 dirty 失败", {
                    component: "StateControllerV2",
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
    private promptDirtyAndStart(dirty: Array<{ select: StateSelectV2, propType?: EnumPropName, propRef?: string, current: unknown, stored: unknown }>): void {
        const lines = dirty.map((d) => {
            const nodeName = (d.select.node && d.select.node.name) || "?";
            // W6-2a-fixup: 显示兼容 - 自定义走 propRef, 内置走 EnumPropName[propType]
            const label = d.propRef !== undefined
                ? d.propRef
                : (d.propType !== undefined ? EnumPropName[d.propType] : "(unknown)");
            return `  [${nodeName}] ${label}`;
        });
        const message = `节点上以下已跟随的 prop 与 state[${this._selectedIndex}] 存储不一致:\n${lines.join("\n")}\n\n如何处理后再进入录制态?`;
        const onSave = () => {
            // 把节点当前值写进 ctrlData (类似 commit 路径)
            for (const d of dirty) {
                try {
                    const propData = (d.select as any).getPropData(this._selectedIndex, this.ctrlId);
                    if (!propData) continue;
                    if (d.propRef !== undefined) {
                        // W6-2a-fixup: 自定义 propRef 走直写 propData[propRef].
                        // 注: dirty 来源已用 cloneValueByType 拍快照 (snapshot 已 clone),
                        // 这里再 clone 一次保证 ctrlData 不与节点共享引用.
                        const tp = (d.select as any).resolveTrackableProp
                            ? (d.select as any).resolveTrackableProp(d.propRef)
                            : undefined;
                        (propData as any)[d.propRef] = tp
                            ? cloneValueByType(d.current, tp.cocosType)
                            : d.current;
                    }
                    else if (d.propType !== undefined) {
                        // W6-2c2: 走 StateSelectV2.writePropByEnum 保证写 string propRef key (跟 production 一致)
                        (d.select as any).writePropByEnum(propData, d.propType, d.current);
                    }
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
                    try {
                        select.updateState(this);
                    }
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
                        if (first) {
                            cb(0);
                            return;
                        }
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
     * 退出录制态: 通知所有 StateSelectV2.onRecordingStop final commit + 清 snapshot.
     * 幂等: 未在录制时 no-op。
     */
    public stopRecording(): void {
        if (!this._recording) {
            return;
        }
        this._recording = false;
        StateErrorManager.info("停止录制", {
            component: "StateControllerV2",
            method: "stopRecording",
            params: { ctrlName: this._ctrlName },
        });
        this.updateState(EnumUpdateType.RecordingStop);
        // Wave 2 T25: capability 层广播
        CapabilityRegistry.dispatch("onRecordingStop", { ctrl: this });
    }

    /**
     * 录制按钮: 切换 isRecording (普通访问器, inspector 可见性由 recording 折叠组代理).
     */
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
     * 把 ctrlData[_recordingStartState] 回滚到录制开始前的值 (复用 StateSelectV2.onRecordingStart
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
                    try {
                        (select as any).applyRecordingSnapshot(this, fromState);
                    }
                    catch (e) {
                        StateErrorManager.warn("cancelRecording: applyRecordingSnapshot 失败", {
                            component: "StateControllerV2",
                            method: "cancelRecording",
                            params: { error: (e as Error).message },
                        });
                    }
                }
            }
        }
        this._recording = false;
        StateErrorManager.info("撤销录制", {
            component: "StateControllerV2",
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
     * 普通访问器, inspector 可见性由 recording 折叠组代理.
     */
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
                component: "StateControllerV2",
                method: "forceRefreshInspector",
                params: { error: (error as Error).message },
            });
        }
    }
}

// back-compat 导出别名: 仅 JS 导出名, 不触发 @ccclass (引擎/panel 按 cid "StateControllerV2" 识别).
// 供既有测试用 `{ StateController }` / `Mod.StateController` 沿用, 不影响 V2 与旧版共存.
export { StateControllerV2 as StateController };
