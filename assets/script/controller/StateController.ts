/**
 * 控制器已知问题：
 * 1.有些属性只能从PropValue设置没有监听方法如：Label_String,Opacity,Font等等。
 * 2.SpirteFrame不能在PropValue设置，只能从编辑器设置
 * 3.设置状态的时候selectedPage不会及时更新，需要手动切换界面更新
 */

const { ccclass, menu, property, executeInEditMode } = cc._decorator;
import { EnumStateName, EnumUpdataType, InspectorRefreshMode } from "./StateEnum";
import { StateErrorManager } from "./StateErrorManager";
import { StateSelect } from "./StateSelect";

cc.Enum(EnumStateName);
cc.Enum(InspectorRefreshMode);

/**
 * 🔧 M2 序列化版本号常量
 *
 * 当 schema (StateController @property 字段结构) 演进时, 同步递增此版本号:
 * - 1: M2 初始版本 (引入 _serializedVersion + _migrate 框架, schema 未变更)
 * - 2 (M3): _stateSelectCache 按 ctrlId 分桶 + deleteState 触发清理事件 + StateSelect._ctrlData 历史 dead stateId 清扫
 *
 * 旧场景反序列化后若 instance._serializedVersion < CURRENT_VERSION,
 * onLoad 会触发 _migrate(fromVersion) 完成数据迁移。
 */
const CURRENT_VERSION = 2;

@ccclass("stateValue")
export class StateValue {
    @property(cc.String)
    public name: string = "";

    @property({ type: cc.Integer, readonly: true })
    public stateId: number = 0;

    constructor(name: string, stateId: number) {
        this.name = name;
        this.stateId = stateId;
    }
}

@ccclass("StateController")
@menu("State/StateController")
@executeInEditMode()
export class StateController extends cc.Component {
    /**
     * 🔧 M2: 序列化 schema 版本号 (用于未来 _migrate 数据迁移)
     * 默认值 = 1 (M2 阶段当前版本); 旧场景反序列化后若小于 CURRENT_VERSION 会触发 _migrate
     */
    @property({ visible: false })
    private _serializedVersion: number = 1;

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

    // ================== 🔧 IMPL-001 / M3-B1: BFS缓存优化 (按 ctrlId 分桶) ==================
    /**
     * 🎯 缓存优化说明：
     * - _stateSelectCache: Map<ctrlId, StateSelect[]> 按 ctrlId 分桶缓存当前控制器直接控制的 StateSelect
     * - _cacheDirty: Map<ctrlId, boolean> 每个 ctrlId 的脏标记
     * - 使用缓存后，状态切换从 O(n) BFS 遍历优化为 O(1) 字典查找
     *
     * M3-B1 修复: 嵌套场景下 (父 + 子 controller) 不同 ctrlId 的缓存独立失效，
     * 避免父控制器 markCacheDirty 错误清掉子控制器缓存导致跨 controller 串扰。
     *
     * 注: _stateSelectCache 不加 @property — 它是 runtime cache，重建即可。
     */
    /**
     * 🔧 缓存：存储 ctrlId -> 直接控制的 StateSelect 组件列表
     *
     * 失效语义: Map 中无 entry = 需重建; 重建后 set 入 Map.
     * (M3 Gemini review WARNING: 删除冗余 _cacheDirty 字段, Map 自身就是脏标记)
     */
    private _stateSelectCache: Map<number, StateSelect[]> = new Map();

    /** 控制器名字 */
    @property(cc.String)
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
        this.updateState(EnumUpdataType.Name);
    }

    private _previousIndex: number = -1;
    /** 上一次的选中下标 */
    public get previsousIndex(): number {
        return this._previousIndex;
    }

    /** 选中的状态下标 */
    @property(EnumStateName)
    private _selectedIndex: EnumStateName = 0;

    /** 状态顺序上移触发 */
    @property({
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

    /** 状态顺序下移触发 */
    @property({
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

    /** 复制当前状态触发 */
    @property({
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

    /** 删除当前状态触发 */
    @property({
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
            this._previousIndex = this._selectedIndex;
            this._selectedIndex = value;

            // 🔧 通知所有相关组件状态已改变
            this.updateState(EnumUpdataType.State);

            // 🔧 编辑器环境下同步属性更新
            if (CC_EDITOR) {
                this.updateState(EnumUpdataType.Prop);
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

    /** 状态名字列表 */
    @property(StateValue)
    private _states: StateValue[] = [];

    @property({ type: StateValue, tooltip: "状态数量。数组内容为状态名称" })
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
                value[index] = new StateValue(smartStateName, newStateId);
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

            // 🔧 M3-B3: 对每个被删除的 stateId 分发清理事件 (避免 _ctrlData 残留)
            for (const deletedIndex of deletedIndices) {
                const deletedState = this._states[deletedIndex];
                if (deletedState && deletedState.stateId !== undefined) {
                    this.deleteState(deletedState.stateId);
                }
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

        // 🔧 优化：使用智能刷新策略替代硬编码刷新

        const reason = oldLen > newLen ? "状态删除" : "状态数量增加";
        this.smartRefreshInspector(reason);

        // 🔧 通知相关组件状态列表已更新
        if (deletedIndices.length > 0) {
            StateErrorManager.info("状态列表更新完成（包含删除）", {
                component: "StateController",
                method: "states.setter",
                params: { finalStateCount: newLen, deletedIndices: deletedIndices, currentIndex: applyIndex },
            });
            // 如果有删除，通知第一个删除的索引
            this.updateState(EnumUpdataType.SelPage, deletedIndices[0]);
        }
        else {
            StateErrorManager.info("状态列表更新完成", {
                component: "StateController",
                method: "states.setter",
                params: { finalStateCount: newLen, currentIndex: applyIndex },
            });
            this.updateState(EnumUpdataType.SelPage);
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
        this.updateState(EnumUpdataType.Move, { fromIndex: fromIndex, toIndex: targetIndex });

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
        const newState = new StateValue(copyName, this.stateIdAuto++);

        const newStates = [...this._states];
        const insertIndex = newStates.length;
        newStates.push(newState);

        this._selectedIndex = insertIndex;
        this.states = newStates;
        this.updateState(EnumUpdataType.State);

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

        // 🔧 M3-B3: 通知 StateSelect 清理 _ctrlData[ctrlId][stateId] 孤儿残留
        if (removed && removed.stateId !== undefined) {
            this.deleteState(removed.stateId);
        }

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
            this._states = [new StateValue("1", this.stateIdAuto++), new StateValue("2", this.stateIdAuto++)];
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

        this.updateState(EnumUpdataType.Init);
    }

    protected onLoad() {
        // 🔧 M2: schema 版本检查 + 触发 _migrate (无论运行时还是编辑器都需迁移)
        if (this._serializedVersion < CURRENT_VERSION) {
            this._migrate(this._serializedVersion);
            this._serializedVersion = CURRENT_VERSION;
        }

        if (!CC_EDITOR) {
            return;
        }
        this.updateState(EnumUpdataType.State);
    }

    /**
     * 🔧 M2: 数据迁移钩子
     *
     * 子类或后续版本可在此方法中根据 fromVersion 做对应迁移:
     * - if (fromVersion < 2) { ... }   // M3: StateController 端无 schema 变更, 仅版本号同步
     * - if (fromVersion < 3) { ... }
     *
     * @param fromVersion 当前数据的旧版本号 (即 _serializedVersion 反序列化后的值)
     */
    protected _migrate(fromVersion: number): void {
        // M3 v1 → v2: StateController 端目前无 schema 变更, 仅版本号同步
        // (StateSelect 端会做 _ctrlData dead stateId 清扫)
        if (fromVersion < 2) {
            this._serializedVersion = 2;
        }
    }

    protected onDestroy() {
        if (!CC_EDITOR) {
            return;
        }

        // 🔧 清理刷新定时器
        this.clearRefreshTimer();

        this.updateState(EnumUpdataType.Delete);
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
     * 🔧 IMPL-002.2: 触发selectedPage变更通知
     * 在编辑器环境下触发属性检查器刷新
     */
    private _emitSelectedPageChanged(): void {
        if (!CC_EDITOR) {
            return;
        }

        StateErrorManager.debug("触发selectedPage变更通知", {
            component: "StateController",
            method: "_emitSelectedPageChanged",
            params: { selectedPage: this.selectedPage, selectedIndex: this._selectedIndex },
        });

        // 触发编辑器刷新（延迟一帧确保数据已更新）
        setTimeout(() => {
            if (this.node && this.node.isValid) {
                this.forceRefreshInspector();
            }
        }, 0);
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

    // ================== 🔧 IMPL-001 / M3-B1: BFS缓存优化方法 (按 ctrlId 分桶) ==================

    /**
     * 🔧 M3-B1: 按 ctrlId 重建 StateSelect 缓存
     * 使用 getComponentsInChildren 一次性获取所有 StateSelect，然后过滤出指定 ctrlId 直接控制的组件
     *
     * @param ctrlId 要重建缓存的目标 controller ctrlId; 默认 this.ctrlId
     * @returns 重建后的 StateSelect 列表 (同时已写入 this._stateSelectCache)
     */
    private rebuildStateSelectCacheForCtrl(ctrlId: number): StateSelect[] {
        StateErrorManager.debug("开始重建 StateSelect 缓存 (按 ctrlId)", {
            component: "StateController",
            method: "rebuildStateSelectCacheForCtrl",
            params: { ctrlName: this._ctrlName, ctrlId: ctrlId },
        });

        const allStateSelects = this.node.getComponentsInChildren(StateSelect);
        const filtered = allStateSelects.filter((ss) => {
            // 仅筛选: (a) ss._ctrlsMap 已记录此 controller; (b) 节点路径上无其他中间 controller (相对当前 controller)
            // 注: _ctrlsMap 是 private, 用 (ss as any) 突破访问限制
            const ctrlsMap = (ss as any)._ctrlsMap as { [ctrlId: string]: StateController };
            if (!ctrlsMap || ctrlsMap[ctrlId] !== this) {
                return false;
            }
            return this.isDirectlyControlled(ss.node, ctrlId);
        });

        this._stateSelectCache.set(ctrlId, filtered);

        StateErrorManager.info("StateSelect 缓存重建完成 (按 ctrlId)", {
            component: "StateController",
            method: "rebuildStateSelectCacheForCtrl",
            params: { ctrlId: ctrlId, cachedCount: filtered.length },
        });

        return filtered;
    }

    /**
     * 🔧 M3-B1: 检查节点是否被指定 ctrlId 的当前控制器直接控制
     * 直接控制 = 节点与控制器之间没有其他 StateController (具有 ctrlId 区分能力)
     *
     * @param targetNode 目标节点
     * @param _ctrlId 目标 ctrlId (当前简化实现: 仅用 'this' 引用判定; 多 ctrlId 实例同节点不分裂判定)
     */
    private isDirectlyControlled(targetNode: cc.Node, _ctrlId?: number): boolean {
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
     * 🔧 M3-B1: 标记缓存为脏，需要重建 (按 ctrlId 分桶)
     *
     * - 不传参数 → 清除所有 ctrlId 的缓存 (兼容旧调用语义, 也用于 onDestroy 全清)
     * - 传 ctrlId → 仅清除指定 ctrlId 的缓存 (避免父子嵌套时跨 controller 串扰)
     *
     * @param ctrlId 可选, 指定要失效的 ctrlId; 不传则全清
     */
    public markCacheDirty(ctrlId?: number): void {
        if (ctrlId === undefined || ctrlId === null) {
            this._stateSelectCache.clear();
            StateErrorManager.debug("缓存已全部标记为脏", {
                component: "StateController",
                method: "markCacheDirty",
                params: { ctrlName: this._ctrlName, scope: "all" },
            });
        }
        else {
            this._stateSelectCache.delete(ctrlId);
            StateErrorManager.debug("缓存已标记为脏 (单 ctrlId)", {
                component: "StateController",
                method: "markCacheDirty",
                params: { ctrlName: this._ctrlName, ctrlId: ctrlId },
            });
        }
    }

    /** 🔧 核心方法：状态更新通知机制 - 使用缓存优化 (IMPL-001 / M3-B1: 按 ctrlId 分桶) */
    private updateState(type: EnumUpdataType, value?: unknown) {
        // 🔧 M3-B1: 按 ctrlId 取/重建缓存 — 避免父子嵌套场景的串扰
        const ctrlId = this.ctrlId;
        const cached = this._stateSelectCache.get(ctrlId) ?? this.rebuildStateSelectCacheForCtrl(ctrlId);

        // 🔧 直接遍历缓存的StateSelect组件
        for (const stateSelect of cached) {
            if (!stateSelect || !stateSelect.node || !stateSelect.node.active) {
                continue;
            }

            if (type == EnumUpdataType.State) {
                // 🔧 状态切换：通知StateSelect组件状态已改变
                stateSelect.updateState(this);
            }
            else if (type == EnumUpdataType.Name) {
                // 🔧 名称更新：通知StateSelect组件控制器名称已更改
                stateSelect.updateCtrlName(this.node);
            }
            else if (type == EnumUpdataType.SelPage) {
                // 🔧 状态页面更新：通知StateSelect组件状态列表已更改
                stateSelect.updateCtrlPage(this, value as number);
            }
            else if (type == EnumUpdataType.Delete) {
                // 🔧 M3-B3: 删除通知 — 若 value 提供 stateId, 则定向清理 _ctrlData[ctrlId][stateId];
                //         否则 (整 controller 销毁时) 走 fallback 清整个 _ctrlData[ctrlId]
                stateSelect.updateDelete(this, value as number | undefined);
            }
            else if (type == EnumUpdataType.Init) {
                // 🔧 初始化通知：通知StateSelect组件控制器已完成初始化
                stateSelect.updatePreLoad(this);
            }
            else if (type == EnumUpdataType.Prop) {
                // 🔧 属性更新：通知StateSelect组件属性已更改
                stateSelect.updateProp(this);
            }
            else if (type == EnumUpdataType.Move) {
                // 🔧 状态顺序变更：通知StateSelect同步状态数据顺序
                // @ts-expect-error 允许使用该方法
                stateSelect.updateStateMove(this, value);
            }
        }
    }

    // ================== 🔧 M3-B3: deleteState 显式清理事件 ==================
    /**
     * 🔧 M3-B3: 公共方法 - 删除指定 stateId 时分发 EnumUpdataType.Delete 事件
     *
     * 用于触发所有受控 StateSelect 清理 _ctrlData[ctrlId][stateId] 残留 (避免孤儿数据).
     *
     * 用例: editor 内删除某 state 时调用; M3 之前 removeSelectedState 不分发 Delete (导致 _ctrlData 孤儿膨胀).
     * 注: removeSelectedState 走 states setter 路径已通过 SelPage 通知; 此方法补足 stateId 级清理。
     *
     * @param stateId 要删除的状态 stateId
     */
    public deleteState(stateId: number): void {
        StateErrorManager.debug("分发 stateId 删除事件", {
            component: "StateController",
            method: "deleteState",
            params: { ctrlId: this.ctrlId, stateId: stateId },
        });
        this.updateState(EnumUpdataType.Delete, stateId);
    }

    // ================== 🔧 刷新优化功能使用说明 ==================
    /**
     * 🎯 属性检查器刷新优化功能说明：
     *
     * 1. **智能刷新 (推荐)**：
     *    - 自动判断是否需要刷新
     *    - 只在状态数量变化时刷新
     *    - 平衡性能和体验
     *
     * 2. **自动刷新**：
     *    - 延迟刷新，避免频繁操作
     *    - 可配置延迟时间 (0.5-10秒)
     *    - 适合快速编辑场景
     *
     * 3. **手动刷新**：
     *    - 完全控制刷新时机
     *    - 点击按钮主动刷新
     *    - 适合性能敏感场景
     *
     */

    /** 🔧 新增：属性检查器刷新策略 */
    @property({
        type: InspectorRefreshMode,
        displayName: "刷新策略",
        tooltip: "• 自动刷新：延迟刷新，防抖处理\n• 手动刷新：用户点击按钮刷新",
    })
    private inspectorRefreshMode: InspectorRefreshMode = InspectorRefreshMode.ManualRefresh;

    /** 🔧 新增：自动刷新延迟时间（秒） */
    @property({
        displayName: "自动刷新延迟",
        tooltip: "自动刷新模式下的延迟时间（秒）",
        min: 0.5,
        max: 10,
        step: 0.5,
        visible: function (this: StateController) {
            return this.inspectorRefreshMode === InspectorRefreshMode.AutoRefresh;
        },
    })
    private autoRefreshDelay: number = 2.0;

    /** 🔧 新增：手动刷新按钮 */
    @property({
        displayName: "手动刷新",
        tooltip: "点击刷新属性检查器",
        visible: function (this: StateController) {
            return this.inspectorRefreshMode === InspectorRefreshMode.ManualRefresh;
        },
    })
    public get manualRefreshTrigger() {
        return false;
    }

    public set manualRefreshTrigger(value: boolean) {
        if (value && CC_EDITOR) {
            this.forceRefreshInspector();
        }
    }

    /** 🔧 新增：防抖定时器 */
    private _refreshTimer: ReturnType<typeof setTimeout> = null;

    /** 🔧 新增：待刷新标记 */
    private _pendingRefresh: boolean = false;

    /** 🔧 新增：刷新状态指示器 */
    @property({
        displayName: "刷新状态",
        tooltip: "当前属性检查器刷新状态",
        readonly: true,
    })
    public get refreshStatus() {
        if (!CC_EDITOR) {
            return "运行时模式";
        }

        if (this._refreshTimer) {
            return `⏳ 等待刷新 (${this.autoRefreshDelay}s)`;
        }

        if (this._pendingRefresh) {
            if (this.inspectorRefreshMode === InspectorRefreshMode.ManualRefresh) {
                return "🔄 等待手动刷新";
            }
            else {
                return "⏸️ 等待智能刷新";
            }
        }

        return "✅ 已同步";
    }

    /** 🔧 新增：强制刷新属性检查器 */
    private forceRefreshInspector() {
        if (!CC_EDITOR) {
            return;
        }

        try {
            Editor.Utils.refreshSelectedInspector("node", this.node.uuid);
            this._pendingRefresh = false;
            StateErrorManager.info("属性检查器已刷新", {
                component: "StateController",
                method: "forceRefreshInspector",
            });
        }
        catch (error) {
            StateErrorManager.warn("刷新属性检查器失败", {
                component: "StateController",
                method: "forceRefreshInspector",
                params: { error: error.message },
            });
        }
    }

    /** 🔧 新增：智能刷新 - 根据策略决定是否刷新 */
    private smartRefreshInspector(reason: string = "状态变化") {
        if (!CC_EDITOR) {
            return;
        }
        switch (this.inspectorRefreshMode) {
            case InspectorRefreshMode.AutoRefresh:
                // 防抖刷新
                this.debounceRefreshInspector(reason);
                break;
            case InspectorRefreshMode.ManualRefresh:
                // 手动刷新：仅标记待刷新
                this._pendingRefresh = true;
                break;
        }
    }

    /** 🔧 新增：防抖刷新 */
    private debounceRefreshInspector(_reason: string) {
        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
        }

        this._pendingRefresh = true;

        this._refreshTimer = setTimeout(() => {
            this.forceRefreshInspector();
            this._refreshTimer = null;
        }, this.autoRefreshDelay * 1000);
    }

    /** 🔧 新增：清理刷新定时器 */
    private clearRefreshTimer() {
        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
            this._refreshTimer = null;
        }
    }
}
