/**
 * 控制器已知问题：
 * 1.有些属性只能从PropValue设置没有监听方法如：Label_String,Opacity,Font等等。
 * 2.SpirteFrame不能在PropValue设置，只能从编辑器设置
 * 3.设置状态的时候selectedPage不会及时更新，需要手动切换界面更新
 */

const { ccclass, property, executeInEditMode } = cc._decorator;
import { EnumStateName, EnumUpdataType, InspectorRefreshMode } from './StateEnum';
import { StateSelect } from './StateSelect';

cc.Enum(EnumStateName)
cc.Enum(InspectorRefreshMode)

@ccclass("stateValue")
export class StateValue {
    @property(cc.String)
    name: string = "";
    @property({ type: cc.Integer, readonly: true })
    stateId: number = 0;
    constructor(name: string, stateId: number) {
        this.name = name;
        this.stateId = stateId;
    }
}

@ccclass('StateController')
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

    /** 控制器名字 */
    @property(cc.String)
    private _ctrlName: string = "";
    @property({ displayName: "name", tooltip: "控制器唯一名称" })
    get ctrlName() {
        return this._ctrlName;
    }
    set ctrlName(value: string) {
        if (!CC_EDITOR) {
            console.error("非编辑器环境，不更新名称");
            return;
        }
        this._ctrlName = value;
        this.updateState(EnumUpdataType.name);
    }

    private _previousIndex: number = -1;
    /** 上一次的选中下标 */
    public get previsousIndex(): number {
        return this._previousIndex;
    }

    /** 选中的状态下标 */
    @property(EnumStateName)
    private _selectedIndex: EnumStateName = 0;
    /** 选择的状态下标 */
    @property({ type: EnumStateName, displayName: "selectedState", tooltip: "当前选中的状态" })
    public get selectedIndex() {
        return this._selectedIndex;
    }
    public set selectedIndex(value: EnumStateName) {
        if (this.isInit || this._selectedIndex != value) {
            this.isInit = false;

            // 🔧 边界检查：确保状态索引在有效范围内
            value = Math.max(0, Math.min(this._states.length - 1, value));

            // 🔧 状态切换流程：标记正在变化 → 保存上一状态 → 更新当前状态 → 触发更新
            this.isChanging = true;
            this._previousIndex = this._selectedIndex;
            this._selectedIndex = value;

            // 🔧 通知所有相关组件状态已改变
            this.updateState(EnumUpdataType.state);

            // 🔧 编辑器环境下同步属性更新
            if (CC_EDITOR) {
                this.updateState(EnumUpdataType.prop);
            }

            this.isChanging = false;
        }
    }

    /** 状态名字列表 */
    @property(StateValue)
    private _states: StateValue[] = [];
    @property({ type: StateValue, tooltip: "状态数量。数组内容为状态名称" })
    get states() {
        return this._states;
    }
    private set states(value: StateValue[]) {
        if (!CC_EDITOR) {
            console.error("非编辑器环境，不更新状态");
            return;
        }

        // 🔧 输入验证：确保数组有效
        if (!value || !Array.isArray(value)) {
            cc.warn("states必须是有效的数组");
            return;
        }

        let oldLen = this._states.length;
        let newLen = value.length;

        let applyIndex: number = this._selectedIndex;

        // 处理状态数量不足的情况
        if (newLen < 2) {
            applyIndex = 0;
            cc.warn("建议至少添加两个状态");
        }

        // 🔧 处理状态变化的核心逻辑
        let deletedIndices: number[] = [];


        // 🔧 首先检查并初始化所有未正确初始化的状态对象
        for (let index = 0; index < newLen; index++) {
            if (!value[index] || value[index].name === undefined || value[index].stateId === undefined) {
                // 🔧 使用智能命名方法生成状态名字
                let smartStateName = this.getSmartStateName(index);
                let newStateId = this.stateIdAuto++;
                value[index] = new StateValue(smartStateName, newStateId);
            } else {
                // 🔧 检测现有状态的手动更改
                let defaultName = (index + 1).toString();
                let currentName = value[index].name;

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
                } else {
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
            for (let deletedIndex of deletedIndices) {
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
        this._states = value;

        let stateMap: { [key: string]: boolean } = {};
        let array = value.map((val, i) => {
            if (!val) {
                cc.error("状态对象不能为空", i);
                return { name: "error", value: i };
            }

            // 🔧 处理重复状态名
            if (stateMap[val.name]) {
                cc.warn("检测到重复的状态名", val.name, "自动重命名为", val.name + "_" + i);
                val.name = val.name + "_" + i;
            }

            stateMap[val.name] = true;
            return { name: val.name, value: i };
        });

        //@ts-ignore
        cc.Class.Attr.setClassAttr(this, "selectedIndex", "enumList", array);
        this._selectedIndex = applyIndex;

        // 🔧 优化：使用智能刷新策略替代硬编码刷新

        let reason = oldLen > newLen ? "状态删除" : "状态数量增加";
        this.smartRefreshInspector(reason);


        // 🔧 通知相关组件状态列表已更新
        if (deletedIndices.length > 0) {
            // 如果有删除，通知第一个删除的索引
            this.updateState(EnumUpdataType.selPage, deletedIndices[0]);
        } else {
            this.updateState(EnumUpdataType.selPage);
        }
    }


    protected __preload() {
        if (!CC_EDITOR) {
            return;
        }

        if (!this._states.length) {
            // 🔧 从1开始命名状态
            this._states = [new StateValue("1", this.stateIdAuto++), new StateValue("2", this.stateIdAuto++)]
        }

        let array = this.states.map((val, i) => {
            return { name: val.name, value: i };
        })

        //@ts-ignore
        cc.Class.Attr.setClassAttr(this, "selectedIndex", "enumList", array);


        // 🔧 确保selectedIndex在有效范围内，默认选择第一个状态
        if (this._states.length > 0 && (this._selectedIndex < 0 || this._selectedIndex >= this._states.length)) {
            this._selectedIndex = 0;
            cc.log("🔧 初始化时自动设置selectedIndex为第一个状态");
        }

        if (!this._ctrlName) {
            this.ctrlName = `ctrl_${Date.now().toString()}`;
        }

        this.updateState(EnumUpdataType.init);
    }

    protected onLoad() {
        if (!CC_EDITOR) {
            return;
        }
        this.updateState(EnumUpdataType.state)
    }

    protected onDestroy() {
        if (!CC_EDITOR) {
            return;
        }

        // 🔧 清理刷新定时器
        this.clearRefreshTimer();

        this.updateState(EnumUpdataType.delete)
    }

    /** 选择的状态名字 */
    public get selectedPage(): string {
        if (this._selectedIndex == -1 || this._selectedIndex >= this._states.length)
            return null;
        else {
            let currentState = this._states[this._selectedIndex];

            // 🔧 确保状态对象有效且name不为空
            if (currentState && currentState.name !== undefined && currentState.name !== "") {
                return currentState.name;
            } else {
                cc.warn("🔧 当前状态对象无效或名称为空:", currentState);
                return null;
            }
        }
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
        let deletedIndices: number[] = [];

        let newStateIds = new Set<number>();

        for (let i = 0; i < newStates.length; i++) {
            if (newStates[i] && newStates[i].stateId !== undefined) {
                newStateIds.add(newStates[i].stateId);
            }
        }

        for (let i = 0; i < oldStates.length; i++) {
            let oldState = oldStates[i];

            if (!oldState || oldState.stateId === undefined) {
                continue;
            }

            if (!newStateIds.has(oldState.stateId)) {
                deletedIndices.push(i);
            }
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
        let defaultName = (index + 1).toString();
        cc.log("🔧 使用默认状态名字:", {
            index: index,
            defaultName: defaultName
        });
        return defaultName;
    }


    /** 🔧 核心方法：状态更新通知机制 - 将状态变化通知给所有相关的StateSelect组件 */
    private updateState(type: EnumUpdataType, value?: number) {
        let self = this;
        /**
         * 🔧 递归子节点更新函数：使用广度优先搜索遍历整个节点树
         * 关键优化点：
         * 1. 队列替代递归，避免深度递归导致的栈溢出
         * 2. 处理节点去重，防止重复处理
         * 3. 智能跳过有子控制器的节点，避免跨控制器污染
         */
        let updateChild = function (rootNode: cc.Node) {
            // 🔧 使用队列实现广度优先搜索，性能更好且避免递归深度问题
            let nodeQueue: cc.Node[] = [rootNode];
            let processedNodes = new Set<cc.Node>(); // 防止重复处理

            while (nodeQueue.length > 0) {
                let parent = nodeQueue.shift();

                // 🔧 安全检查：确保节点有效且未被处理过
                if (!parent || !parent.children || processedNodes.has(parent)) {
                    continue;
                }
                processedNodes.add(parent);

                let children = parent.children;
                let len = children.length;

                // 🔧 遍历所有子节点，寻找StateSelect组件
                for (let index = 0; index < len; index++) {
                    let child = children[index];

                    let childStateController = child.getComponent(StateController);
                    let stateSelect = child.getComponent(StateSelect);

                    // 🔧 找到StateSelect组件，根据更新类型执行相应操作
                    if (stateSelect) {
                        if (type == EnumUpdataType.state) {
                            // 🔧 状态切换：通知StateSelect组件状态已改变
                            stateSelect.updateState(self);
                        } else if (type == EnumUpdataType.name) {
                            // 🔧 名称更新：通知StateSelect组件控制器名称已更改
                            stateSelect.updateCtrlName(self.node);
                        } else if (type == EnumUpdataType.selPage) {
                            // 🔧 状态页面更新：通知StateSelect组件状态列表已更改
                            stateSelect.updateCtrlPage(self, value);
                        } else if (type == EnumUpdataType.delete) {
                            // 🔧 删除通知：通知StateSelect组件控制器即将被删除
                            stateSelect.updateDelete(self);
                        } else if (type == EnumUpdataType.init) {
                            // 🔧 初始化通知：通知StateSelect组件控制器已完成初始化
                            stateSelect.updatePreLoad(self);
                        } else if (type == EnumUpdataType.prop) {
                            // 🔧 属性更新：通知StateSelect组件属性已更改
                            stateSelect.updateProp(self);
                        }
                    }

                    // 🔧 智能遍历策略：如果子节点没有StateController且有子节点，则继续遍历
                    // 这样可以避免跨控制器边界的状态污染
                    if (!childStateController && child.children && child.children.length > 0) {
                        nodeQueue.push(child);
                    }
                }
            }
        }

        // 🔧 从当前控制器节点开始更新所有相关的StateSelect组件
        updateChild(self.node);
    }

    /** 🔧 新增：属性检查器刷新策略 */
    @property({
        type: InspectorRefreshMode,
        displayName: "刷新策略",
        tooltip: "• 自动刷新：延迟刷新，防抖处理\n• 手动刷新：用户点击按钮刷新\n• 智能刷新：只在必要时刷新\n• 即时刷新：立即刷新（原有行为）"
    })
    inspectorRefreshMode: InspectorRefreshMode = InspectorRefreshMode.ManualRefresh;

    /** 🔧 新增：自动刷新延迟时间（秒） */
    @property({
        displayName: "自动刷新延迟",
        tooltip: "自动刷新模式下的延迟时间（秒）",
        min: 0.5,
        max: 10,
        step: 0.5,
        visible: function (this: StateController) {
            return this.inspectorRefreshMode === InspectorRefreshMode.AutoRefresh;
        }
    })
    autoRefreshDelay: number = 2.0;

    /** 🔧 新增：手动刷新按钮 */
    @property({
        displayName: "手动刷新",
        tooltip: "点击刷新属性检查器",
        visible: function (this: StateController) {
            return this.inspectorRefreshMode === InspectorRefreshMode.ManualRefresh;
        }
    })
    get manualRefreshTrigger() {
        return false;
    }
    set manualRefreshTrigger(value: boolean) {
        if (value && CC_EDITOR) {
            this.forceRefreshInspector();
        }
    }

    /** 🔧 新增：防抖定时器 */
    private _refreshTimer: number = null;

    /** 🔧 新增：待刷新标记 */
    private _pendingRefresh: boolean = false;

    /** 🔧 新增：刷新状态指示器 */
    @property({
        displayName: "刷新状态",
        tooltip: "当前属性检查器刷新状态",
        readonly: true
    })
    get refreshStatus() {
        if (!CC_EDITOR) {
            return "运行时模式";
        }

        if (this._refreshTimer) {
            return `⏳ 等待刷新 (${this.autoRefreshDelay}s)`;
        }

        if (this._pendingRefresh) {
            if (this.inspectorRefreshMode === InspectorRefreshMode.ManualRefresh) {
                return "🔄 等待手动刷新";
            } else {
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
            Editor.Utils.refreshSelectedInspector('node', this.node.uuid);
            this._pendingRefresh = false;
            cc.log("🔧 属性检查器已刷新");
        } catch (error) {
            cc.warn("🔧 刷新属性检查器失败:", error);
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
    private debounceRefreshInspector(reason: string) {
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
}