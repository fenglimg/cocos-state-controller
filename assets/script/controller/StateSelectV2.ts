/**
 * 这个类主要目的是为了存以下结构数据：状态对应的属性
 *
 *      _ctrlData数据存储结构
 *
 *      ctrlId:{
 *          //$$lastState$$ : state1
 *          $$default$$:{
 *              $$changedProp$$:[]
 *              $$lastProp$$:EnumPropName.active
 *              EnumPropName.active : true,//active
 *              1 : v3,//postion,
 *              .....
 *          }
 *          stateUUId0 : {
 *              $$changedProp$$:[]
 *              $$lastProp$$:EnumPropName.active
 *              EnumPropName.active : true,//active
 *              .....
 *          },
 *          stateUUId1:{
 *              $$lastProp$$:EnumPropName.pos
 *              1 : v3,//postion,
 *              .....
 *          }
 *          stateName1:{},
 *      }
 *
 */

const {
    ccclass, property, menu, executeInEditMode, disallowMultiple,
} = cc._decorator;
import { SelectExcludeGroup, SelectRecordGroup, SelectValueOpsGroup } from "./props/SelectInspectorGroups";
import { StateControllerV2 } from "./StateControllerV2";
import { EnumCtrlName, EnumExcludeSlot, EnumPropName, EnumStateName } from "./StateEnumV2";
import { StateErrorManager } from "./StateErrorManagerV2";
import { PropHandlerManager } from "./StatePropHandlerV2";
import { PropertyControlService } from "./StatePropertyControlService";
// W6-2a: 自定义组件 propRef 路径基础设施 (W6-1 引入, 本 task 接入)
// W6-4: SYSTEM_EXCLUDE 用于 inspector 排除清单 union (excludedPropsDisplay getter)
import { listTrackableProps, TrackableProp, SYSTEM_EXCLUDE } from "./PrefabIntrospection";
import { cloneValueByType, eqValueByType } from "./NestedCtrlData";
import { ENUM_TO_PROPREF, PROPREF_TO_ENUM, LEGACY_DROPPED_ENUMS, enumToPropRef, AMBIGUOUS_DECOMPOSE, isAmbiguousAggregatePropRef } from "./EnumPropRefMap";
// W6-2b: capability dispatch (propRef 字段派发给 hooks)
import { CapabilityRegistry } from "./CapabilityRegistry";

cc.Enum(EnumCtrlName);
cc.Enum(EnumStateName);
cc.Enum(EnumExcludeSlot);
cc.Enum(EnumPropName);

/** 属性类型 */
export type TPropValue = number | boolean | string | cc.Vec3 | cc.Vec2 | cc.Color | cc.Size | cc.Quat | cc.SpriteFrame | cc.Font | undefined;

type TPropDictionary = {
    [propType: number]: TPropValue
};

/** 🔧 架构重构：新的属性数据结构 */
export type TProp = TPropDictionary & {
    /** 上一次选择的属性 */
    $$lastProp$$?: EnumPropName

    /** 🔧 新增：受控属性列表（控制复选框状态） */
    $$controlledProps$$?: { [propName: string]: EnumPropName }

    /** 🔧 新增：已变更属性数据（实际保存的数据） */
    $$propertyData$$?: { [propType: number]: TPropValue }

    /** 🔧 兼容性：保留原有的changedProp结构（逐步迁移） */
    $$changedProp$$?: { [name: string]: EnumPropName }
};

type TPage = {
    /** v2 storage: state data is keyed by StateValue.stateId, not mutable state index. */
    $$stateKeyMode$$?: "stateId"
    /** 上次选择的状态 */
    // $$lastState$$?: number,
    /** 默认状态属性 */
    $$default$$?: TProp
    [state: number]: TProp
};

type TCtrl = {
    [stateId: string]: TPage
};

// 项目内 Component 脚本不传类名: 引擎按 frame.script(文件名 "StateSelectV2")自动注册,
// 避免 editor 告警 3616. getComponent('StateSelectV2') 与 cid 序列化不受影响.
@ccclass
@menu("State/StateSelectV2")
@executeInEditMode()
@disallowMultiple()
export class StateSelectV2 extends cc.Component {
    // #region 1. 序列化字段与字段访问器
    // cocos @property 层 + 主要 getter/setter, 必须留在 StateSelectV2 类上
    // (服务于反射 / 编辑器 inspector / 场景序列化)

    /** root节点所有的ctrl */
    @property({ visible: false })
    private _ctrlsMap: { [ctrlId: string]: StateControllerV2 } = {};

    /** 当前选中的ctrl名称对应的ctrlId (反序列化字段, panel 接管, inspector 隐藏) */
    @property({ type: EnumCtrlName, visible: false })
    private _currCtrlId: number = null;

    /** 控制器所在节点 (反序列化字段, panel 接管, inspector 隐藏) */
    @property({ type: cc.Node, visible: false })
    private _root: cc.Node = null;

    /** 控制器所在节点 (root getter, panel 接管, inspector 隐藏) */
    @property({ type: cc.Node, visible: false, tooltip: "控制器所在节点，仅提示用", readonly: true })
    public get root() {
        return this._root;
    }

    /** 当前状态要改变的属性 (panel 接管, inspector 隐藏) */
    @property({ type: EnumPropName, visible: false })
    private _propKey: EnumPropName = EnumPropName.Non;

    /** 当前状态要改变的属性值 (panel 接管, inspector 隐藏) */
    @property({ visible: false })
    private _propValue: TPropValue = null;

    /** 🔧 新增：界面标识变量 - 用于标明当前正在展示属性值的属性类型 (panel 接管, inspector 隐藏) */
    @property({ type: EnumPropName, visible: false })
    private _currentDisplayProp: EnumPropName = EnumPropName.Non;

    @property({ visible: false })
    private _isDeleteCurr: boolean = false;

    /** Track1: 切 state 复位 propKey 时置真, 抑制 handleValidPropSelection 的回写/物化 (非序列化, 瞬态). */
    private _suppressPropCapture: boolean = false;

    // #endregion

    // #region W6-4 inspector 排除清单 UI
    // 三件套 inspector @property: 排除清单 readonly + 添加排除下拉 + 恢复跟随下拉
    // 走 cocos 2.x 原生 @property + cc.Class.Attr.setClassAttr 动态注入 enumList (套 TASK-001 homePageState 模板).
    // 不在 __preload 之前实例化, 因为 SYSTEM_EXCLUDE 需要 require IntrospectionMod.

    /**
     * W6-4: inspector 显示当前所有被排除的 prop (SYSTEM_EXCLUDE + _userExcludedProps).
     * Readonly 列表, 用户在下方 + 添加排除 / - 恢复跟随 下拉操作.
     */
    /** 普通访问器 (含 reconcile 副作用), inspector 可见性由 excludeGroup 折叠组代理. */
    public get excludedPropsDisplay(): string[] {
        // W6-4 C 方案: inspector 渲染时机做 reconcile (idempotent, O(N) 小数组). 用户在 _userExcludedProps
        // 数组 inspector +/- 后, 这里 diff 上次快照 → 触发 togglePropertyControl 同步跟随状态.
        this.reconcileUserExcluded();
        // 双标记 (纯显示, 不改 _userExcludedProps 原始数据 / 下拉 enumList): 系统项加 [系统];
        // 用户失效项 (不在当前 listTrackableProps, 多因组件被删 / prop 改名) 加 [失效] 提示可在 - 下拉里清掉.
        // trackable 计算失败时 (node 缺失等) 置 null, 退化为不打失效标记, 避免误标.
        let trackable: Set<string> | null = null;
        try {
            if (this.node) trackable = new Set(listTrackableProps(this.node).map(p => p.propRef));
        }
        catch {
            trackable = null;
        }
        const sysMarked = SYSTEM_EXCLUDE.map(r => `[系统] ${r}`);
        const userMarked = (this._userExcludedProps || []).map(r => (trackable && !trackable.has(r)) ? `[失效] ${r}` : r);
        return [...sysMarked, ...userMarked];
    }

    /**
     * W6-4 C 方案: diff _userExcludedProps vs _lastSeenExcluded, 同步 togglePropertyControl.
     * 加项 → togglePropertyControl(propRef, false) 从跟随移除. 删项 → togglePropertyControl(propRef, true) 重新接入.
     * idempotent: 已同步过的状态不重复 trigger.
     */
    private reconcileUserExcluded(): void {
        if (!CC_EDITOR) return;
        const current = this._userExcludedProps || [];
        const last = this._lastSeenExcluded || [];
        const currentSet = new Set(current);
        const lastSet = new Set(last);
        // 新加项: 在 current 不在 last → 排除 (从跟随中移除)
        for (const propRef of current) {
            if (!lastSet.has(propRef)) {
                try {
                    this.togglePropertyControl(propRef, false);
                }
                catch (e) {
                    StateErrorManager.warn("reconcileUserExcluded: 排除失败", { component: "StateSelectV2", method: "reconcileUserExcluded", params: { propRef, error: (e as Error).message } });
                }
            }
        }
        // 删除项: 在 last 不在 current → 重新跟随
        for (const propRef of last) {
            if (!currentSet.has(propRef)) {
                try {
                    this.togglePropertyControl(propRef, true);
                }
                catch (e) {
                    StateErrorManager.warn("reconcileUserExcluded: 恢复跟随失败", { component: "StateSelectV2", method: "reconcileUserExcluded", params: { propRef, error: (e as Error).message } });
                }
            }
        }
        this._lastSeenExcluded = current.slice();
        // 顺便刷下拉选项 (排除清单变, 下拉可选项要跟着变)
        this.refreshExcludeEnumLists();
    }

    /**
     * M2b-1: 干净的排除 mutation API — 显式替代 excludedPropsDisplay getter 的副作用路径
     * (reconcileUserExcluded). 插件 inspector 行内排除徽标点击走此方法.
     *
     * 与 reconcile 同效但单次精确: 改 _userExcludedProps + 调 togglePropertyControl 同步跟随态,
     * 并同步 _lastSeenExcluded 快照, 避免后续 excludedPropsDisplay getter reconcile 重复 toggle.
     * 幂等: 重复排除不重复入列; 恢复未排除项 / 排除空 ref 安全.
     *
     * @param propRef 受跟踪 propRef ("cc.Sprite.spriteFrame" / "MyComp.heat" / "cc.Node.x")
     * @param excluded true=排除(退出跟随); false=恢复跟随
     */
    public setPropExcluded(propRef: string, excluded: boolean): void {
        if (!propRef) return;
        if (!this._userExcludedProps) this._userExcludedProps = [];
        const idx = this._userExcludedProps.indexOf(propRef);
        if (excluded) {
            if (idx === -1) this._userExcludedProps.push(propRef);
            try {
                this.togglePropertyControl(propRef, false);
            }
            catch (e) {
                StateErrorManager.warn("setPropExcluded: 排除失败", { component: "StateSelectV2", method: "setPropExcluded", params: { propRef, error: (e as Error).message } });
            }
        }
        else {
            if (idx >= 0) this._userExcludedProps.splice(idx, 1);
            try {
                this.togglePropertyControl(propRef, true);
            }
            catch (e) {
                StateErrorManager.warn("setPropExcluded: 恢复跟随失败", { component: "StateSelectV2", method: "setPropExcluded", params: { propRef, error: (e as Error).message } });
            }
        }
        // 与 reconcile 路径快照一致, 避免下次 getter reconcile 把刚做的 toggle 又翻回去
        this._lastSeenExcluded = this._userExcludedProps.slice();
        this.refreshExcludeEnumLists();
    }

    /**
     * W6-4 C 方案: "+ 添加排除" 下拉选项缓存 (instance scope, 非序列化).
     * enumList value=v 对应 _addExcludeOptions[v-1] (value=0 是 sentinel "(选一个...)").
     * refreshExcludeEnumLists 注入 enumList 时同步刷新.
     */
    private _addExcludeOptions: string[] = [];

    /**
     * W6-4 C 方案: "+ 添加排除" 快捷下拉. enumList index=0 是 sentinel "(选一个...)", 真实选项 value 从 1 起.
     * getter 永远返回 0 → 用户操作完显示回到 sentinel (符合"未选"语义). setter 收 0 noop, 收 >0 处理.
     * 处理逻辑: 反查 _addExcludeOptions[value-1] 得 propRef → push 到 _userExcludedProps (cocos 数组同步).
     * 移除跟随由 reconcileUserExcluded 在下一次 inspector 渲染时统一做. 删除走 cocos 数组原生 - 按钮 (不再有 removeExcludeTrigger).
     */
    /** 普通访问器, inspector 可见性 + 动态 enumList 由 excludeGroup 折叠组代理. */
    public get addExcludeTrigger(): number {
        return 0;
    }

    public set addExcludeTrigger(v: number) {
        if (!CC_EDITOR) return;
        if (typeof v !== "number" || !Number.isFinite(v) || v === 0) return;
        // v 是 enumList value (>=1), 真实选项 index = v-1
        const propRef = this._addExcludeOptions[v - 1];
        if (!propRef) return;
        if (!this._userExcludedProps) this._userExcludedProps = [];
        if (this._userExcludedProps.indexOf(propRef) === -1) {
            this._userExcludedProps.push(propRef);
        }
        // reconcileUserExcluded 会在下次 excludedPropsDisplay getter 调用时同步 togglePropertyControl
        // 但 setter 完成后 inspector 立即重渲染, 通常 getter 紧接着被调用. 这里也手动 reconcile 一下兜底:
        this.reconcileUserExcluded();
    }

    /**
     * 「- 恢复跟随」下拉选项缓存 (instance scope, 非序列化). 对称 _addExcludeOptions.
     * enumList value=v 对应 _removeExcludeOptions[v-1] (value=0 是 sentinel "(选一个恢复跟随)").
     * 列原始 _userExcludedProps 全列 (含失效项), refreshExcludeEnumLists 注入时同步刷新.
     */
    private _removeExcludeOptions: string[] = [];

    /**
     * 「- 恢复跟随」快捷下拉 (对称 addExcludeTrigger). enumList[0] 是 sentinel "(选一个恢复跟随)", 真实选项 value 从 1 起.
     * getter 恒返回 0 (操作完回到未选). setter 收 0/非法 noop, 收 >0 反查 _removeExcludeOptions[v-1] 得 propRef →
     * setPropExcluded(propRef, false): 从 _userExcludedProps 移除 (即便 ref 失效, splice 照常完成, togglePropertyControl 安全 no-op),
     * 同时恢复跟随. 一个下拉同时覆盖 "逐项恢复" 与 "清理失效 key" 两个诉求.
     */
    /** 普通访问器, inspector 可见性 + 动态 enumList 由 excludeGroup 折叠组代理. */
    public get removeExcludeTrigger(): number {
        return 0;
    }

    public set removeExcludeTrigger(v: number) {
        if (!CC_EDITOR) return;
        if (typeof v !== "number" || !Number.isFinite(v) || v === 0) return;
        const propRef = this._removeExcludeOptions[v - 1];
        if (!propRef) return;
        this.setPropExcluded(propRef, false);
    }

    /**
     * W6-4 C 方案: 注入 addExcludeTrigger 下拉选项.
     *
     * 选项规则: enumList = [sentinel "(选一个...)" value=0, ...listTrackableProps - SYSTEM_EXCLUDE - _userExcludedProps value=1,2,...].
     * 用户选 sentinel = noop, 选其它 = 加入 _userExcludedProps (cocos 数组自动同步显示).
     * 删除走 _userExcludedProps 数组 cocos 原生 - 按钮 (无 removeExcludeTrigger 下拉).
     *
     * 调用时机: __preload 末尾 + addExcludeTrigger setter 后 + reconcileUserExcluded 内. idempotent.
     */
    public refreshExcludeEnumLists(): void {
        if (!CC_EDITOR) return;
        if (!this.node) return;
        const userExcluded = new Set(this._userExcludedProps || []);
        const systemExcluded = new Set(SYSTEM_EXCLUDE);
        let trackableRefs: string[] = [];
        try {
            const list = listTrackableProps(this.node);
            trackableRefs = list.map(p => p.propRef);
        }
        catch (e) {
            StateErrorManager.warn("refreshExcludeEnumLists: listTrackableProps 失败", {
                component: "StateSelectV2",
                method: "refreshExcludeEnumLists",
                params: { error: (e as Error).message },
            });
        }
        // 当前可跟随 = trackable - SYSTEM - user (用户能从中再选一个排除)
        const addList = trackableRefs.filter(r => !systemExcluded.has(r) && !userExcluded.has(r));
        // enumList[0] 是 sentinel, 真实选项 value 从 1 起. setter 反查 _addExcludeOptions[v-1].
        this._addExcludeOptions = addList;
        const addEnum = [
            { name: "(选一个加入排除)", value: 0 },
            ...addList.map((r, i) => ({ name: r, value: i + 1 })),
        ];
        // 动态 enumList 必须注入到 excludeGroup 折叠组「类」上 (SelectExcludeGroup), 不能注入到实例.
        // 编辑器读取嵌套 facade 的枚举选项走类的 __attrs__; 注入到实例只会写到 instance.__attrs__ 的
        // own key (jest 经同一实例回读能过, 但编辑器读不到 → 下拉空 → 无法添加). 注入到类后, 实例的
        // __attrs__ 原型链 (Object.create(类attrs)) 同样能读到, 两条读路径都成立.
        // @ts-expect-error setClassAttr 在 cocos 2.x d.ts 中未声明
        cc.Class.Attr.setClassAttr(SelectExcludeGroup, "addExcludeTrigger", "enumList", addEnum);

        // 「- 恢复跟随」下拉: 列原始 _userExcludedProps 全列 (含失效项, 不经 trackable 过滤 → 失效 key 也可在此清理).
        const removeList = (this._userExcludedProps || []).slice();
        this._removeExcludeOptions = removeList;
        const removeEnum = [
            { name: "(选一个恢复跟随)", value: 0 },
            ...removeList.map((r, i) => ({ name: r, value: i + 1 })),
        ];
        // @ts-expect-error setClassAttr 在 cocos 2.x d.ts 中未声明
        cc.Class.Attr.setClassAttr(SelectExcludeGroup, "removeExcludeTrigger", "enumList", removeEnum);
    }
    // #endregion W6-4

    /** 状态数据 (反序列化存储, panel 接管, inspector 隐藏) */
    @property({ visible: false })
    private _ctrlData: TCtrl = {};

    /**
     * W6-1 用户排除清单 (inspector 隐藏, panel 接管).
     *
     * 用 propRef ("cc.Sprite.spriteFrame" / "MyComp.heat") 标记用户在 inspector
     * 手动取消的 prop. W6-4 将在 inspector 加 UI 维护此列表, W6-2 把它合并到
     * PrefabIntrospection.listTrackableProps 的过滤里.
     *
     * 当前 W6-1 仅占位, 默认空数组, 不破任何老路径.
     */
    /**
     * W6-4 (C 方案): 用户自定义排除清单. cocos 2.x 数组 inspector 原生 +/- 按钮可直接增删.
     * 删项时 excludedPropsDisplay getter 内 reconcile 自动重新接入跟随; 加项时反之自动从跟随中移除.
     * 加项通常通过 "+ 添加排除" 下拉 (sentinel 防误触, 选项带 propRef 提示);
     * 也可以直接点数组 + 自己手输, 但只有合法 propRef (在 listTrackableProps 内) 才会被 reconcile 应用.
     */
    // 序列化字段, inspector 不直显 (visible:false) — 由 excludeGroup.userExcludedProps 代理同一份数组引用展示/编辑.
    @property({ type: [cc.String], visible: false })
    public _userExcludedProps: string[] = []; // eslint-disable-line @typescript-eslint/naming-convention -- 序列化 key 固定, facade 跨类读写, 不可改名/私有

    /** reconcile 用的上次快照, 用于 diff 触发 togglePropertyControl */
    private _lastSeenExcluded: string[] = [];

    /**
     * 录制中的 snapshot (Wave 2 prefab diff 路径).
     *
     * onRecordingStart 时, 拍下当前节点上所有 controlled prop 的当前值,
     * 切 state 或 stopRecording 时与当前节点状态做 diff, 把变化的 prop commit 到 fromState。
     *
     * 字段使用 plain (不加 @property), 不参与序列化, 录制态随 ctrl._recording 销毁。
     */
    private _snapshot: TProp | null = null;

    /**
     * 录制中的全 prop snapshot (含未勾选跟随的 applicable prop).
     *
     * 用途: 手动 stopRecording 时检测"未跟随的 prop 在录制期间被改了" — 弹窗问
     * 是否要追加跟随并保存. 切 state 自动 stop 时仅记日志 (走 D1 路径).
     *
     * 拍快照范围: PropHandlerManager.getValue(prop, node) !== undefined 的所有 prop
     * (== 节点挂了对应 cc.Component 的 prop). 不影响 _snapshot 的 commit 路径.
     */
    private _fullSnapshot: TProp | null = null;

    /**
     * 录制开始时的"不可变"snapshot (TASK-002 cancelRecording 用).
     *
     * 与 _snapshot 区别: _snapshot 在 commitRecordingDiff 中会被刷新成新值 (作为下一段 diff 起点),
     * 不再代表"录制开始时的原值"; _initialSnapshot 拍完不变, 让 cancel 能精确回滚.
     *
     * 字段非 @property, 不序列化, onRecordingStart 拍, onRecordingStop/cancelRecording 清.
     */
    private _initialSnapshot: TProp | null = null;

    /**
     * #S3: 录制开始时 fromState propData 中**本就存在**的非 $$ key 集 (propRef / number)。
     * cancelRecording 时, 对"录制前依赖 default(不在此集)"的 key 删除而非硬写, 保持动态 default 兜底。
     * 非 @property, onRecordingStart 拍, applyRecordingSnapshot/onRecordingStop 清。
     */
    private _initialPropDataKeys: Set<string> | null = null;

    /**
     * 录制开始时被排除 prop 的纯节点值快照 (propRef → 录制前节点上的值).
     *
     * 用户裁定: 任何被排除的属性, 录制结束(停止 stop 或取消 cancel)后都应还原到录制前 —— 排除 =
     * 录制期间完全不影响该属性, 不管最终保存还是丢弃. 已跟随 prop 的改后值在 stop 时正常 commit, 不受影响.
     * 被排除 prop 不进 _snapshot/_initialSnapshot/_fullSnapshot (不变量#8: 排除不进状态数据), 所以
     * stop/cancel 走 ctrlData 那条路够不到它们; 这里单独拍一份, 由 restoreExcludedSnapshotToNode 写回节点.
     * 非 @property, 不序列化, onRecordingStart 拍, onRecordingStop/applyRecordingSnapshot 收尾时还原+清.
     */
    private _excludedSnapshot: { [propRef: string]: any } | null = null;

    /** 用于检测父节点变化 */
    private lastParent: cc.Node = null;
    private parentCheckInterval: ReturnType<typeof setInterval> = null;

    // #region 控制器当前状态 (StateSelectV2 上的切 state 快捷入口, 镜像 ctrl.selectedIndex)
    @property({ type: EnumStateName, displayName: "state", tooltip: "切到指定 state (镜像 controller.selectedIndex, 改这里 = 改 ctrl)" })
    public get ctrlState() {
        const ctrl = this.getCurrCtrl();
        if (!ctrl) {
            StateErrorManager.warn("ctrlState getter: 控制器为空", {
                component: "StateSelectV2",
                method: "ctrlState.getter",
            });
            return 0;
        }
        return ctrl.selectedIndex;
    }

    private set ctrlState(value: number) {
        const ctrl = this.getCurrCtrl();
        if (!ctrl) {
            StateErrorManager.warn("ctrlState setter: 控制器为空", {
                component: "StateSelectV2",
                method: "ctrlState.setter",
            });
            return;
        }
        ctrl.selectedIndex = value;
    }
    // #endregion

    // #region 控制器名称
    @property({ type: EnumCtrlName, visible: false, displayName: "Ctrl Name", tooltip: "选择的控制器 (panel 接管, inspector 隐藏)" })
    public get currCtrlId() {
        return this._currCtrlId;
    }

    private set currCtrlId(value: number) {
        if (!CC_EDITOR) {
            return;
        }
        if (!value) {
            StateErrorManager.warn("currCtrlId setter: value is null", {
                component: "StateSelectV2",
                method: "currCtrlId.setter",
            });
            this._currCtrlId = null;
            return;
        }
        this._currCtrlId = value;
        this.updateCtrlPage(this.getCurrCtrl());
    }
    // #endregion

    /** 🔧 简化：当前选中的属性（内部使用，不显示在编辑器中） */
    public get propKey() {
        return this._propKey;
    }

    private set propKey(value: EnumPropName) {
        if (!CC_EDITOR) {
            return;
        }

        StateErrorManager.debug("开始设置属性键", {
            component: "StateSelectV2",
            method: "propKey.setter",
            params: { oldPropKey: EnumPropName[this._propKey], newPropKey: EnumPropName[value] },
        });

        // 🔧 第一步：验证控制器有效性
        const ctrl = this.getCurrCtrl();
        if (!ctrl) {
            StateErrorManager.warn("propKey setter: 控制器为空", {
                component: "StateSelectV2",
                method: "propKey.setter",
            });
            return;
        }

        // 🔧 第二步：处理属性设置逻辑
        if (value === EnumPropName.Non) {
            this._propKey = EnumPropName.Non;
            this.setPropValue(EnumPropName.Non);
            StateErrorManager.debug("设置属性为Non", {
                component: "StateSelectV2",
                method: "propKey.setter",
            });
        }
        else {
            this.handleValidPropSelection(value);
        }

        // 🔧 第三步：更新UI显示
        this.updateChangedProp();

        StateErrorManager.info("属性键设置完成", {
            component: "StateSelectV2",
            method: "propKey.setter",
            params: { finalPropKey: EnumPropName[this._propKey] },
        });
    }

    /** 🔧 新增：处理有效属性选择 */
    private handleValidPropSelection(value: EnumPropName) {
        const propValue = this.handleValue(value);
        if (propValue === undefined) {
            StateErrorManager.warn("无法获取属性值", {
                component: "StateSelectV2",
                method: "handleValidPropSelection",
                params: { propType: EnumPropName[value] },
            });
            // 🔧 如果无法获取属性值，保持当前状态不变
            return;
        }

        // 🔧 第二步：设置属性状态（确保属性值有效后再设置）
        this._propKey = value;
        this.setPropValue(value); // 显示属性值字段

        // Track1 序列化瘦身: 切 state 触发的 propKey 复位仅为"保持显示选择", 不应把切 state 后
        // 节点(可能刚被上一 state apply 改写)的当前值回写进 ctrlData / 物化到所有 state —— 否则:
        //   (1) 每次切 state 即把各 state 物化 (re-bloat, 抵消瘦身);
        //   (2) angle/eulerAngles 别名冲突时把被 apply 改坏的节点值污染进 state 存值。
        // 真正的用户改值走录制/setDefaultProp 路径, 不经此 setter。
        if (this._suppressPropCapture) {
            return;
        }

        // 🔧 第三步：更新数据结构
        this.updatePropData(value, propValue);

        // 🔧 第四步：处理自动同步（固定启用）
        if (this.autoSyncEnabled) {
            this.syncPropToAllStatesInternal(value);
        }
    }

    /** 🔧 新增：更新属性数据 */
    private updatePropData(propKey: EnumPropName, propValue: TPropValue) {
        const propData = this.getPropData();

        // W6-2c2: 写 string propRef key (内置 36 + AMBIGUOUS 3 项), fallback number key.
        this.writePropByEnum(propData, propKey, propValue);

        // 🔧 记录上次选择的属性
        propData.$$lastProp$$ = propKey;

        // 🔧 更新已更改属性记录
        propData.$$changedProp$$ = propData.$$changedProp$$ || {};
        propData.$$changedProp$$[EnumPropName[propKey]] = propKey;
    }

    /** 🔧 简化：内部使用的已改变属性列表（不显示在编辑器中） */
    public changedProp: string[] = [];

    /** 刷新上次选中属性 */
    private refProp() {
        const propData = this.getPropData();
        const lastProp = propData.$$lastProp$$;

        // 🔧 修复：确保lastProp不为0（EnumPropName.Non），因为0代表"不选择"状态
        if (lastProp && lastProp > EnumPropName.Non) {
            this.propKey = lastProp;
        }
        else {
            this.propKey = EnumPropName.Non;
        }
    }

    // #endregion 1.

    // #region 2. 生命周期
    // __preload / onLoad / onDestroy + 节点变化通知

    private _isPreloaded = false;

    // eslint-disable-next-line @typescript-eslint/naming-convention
    protected __preload() {
        if (!CC_EDITOR) {
            return;
        }
        if (this._isPreloaded) {
            StateErrorManager.debug("跳过重复预加载", {
                component: "StateSelectV2",
                method: "__preload",
            });
            return;
        }
        this._isPreloaded = true;

        // W6-2c1: 极简 migration framework, 当前只丢 GrayScale (LEGACY_DROPPED_ENUMS),
        // c2 扩 ENUM_TO_PROPREF 36 项 number→string key 迁移. 在所有 __preload 主逻辑之前
        // 跑一次, 确保后续 updateCtrlName / autoOptIn / dispatch 看到的 _ctrlData 已清理.
        this.migrateLegacyCtrlData();

        // Track1 序列化瘦身: 读旧 fat prefab 后就地规范化为 compact (受控集只留 default, 各 state 只留
        // 与 default 不同的 override), 之后内存即 compact, 下次存盘输出紧凑结构. 幂等, compact 数据再跑是 no-op.
        this.compactCtrlData();

        // inspector 折叠组 facade 的 owner 回引
        this.excludeGroup.owner = this;
        this.recording.owner = this;
        this.valueOps.owner = this;

        // IMPL-001.6: 通知控制器缓存失效
        this.notifyControllerCacheDirty();

        StateErrorManager.debug("开始StateSelectV2预加载", {
            component: "StateSelectV2",
            method: "__preload",
            params: { hasCurrentCtrl: !!this.currCtrlId },
        });

        // 🔧 第一步：初始化控制器映射
        this.updateCtrlName(this.node.parent);

        // 🔧 第二步：如果没有当前控制器，尝试自动选择第一个
        if (!this.currCtrlId) {
            const ctrlIdKeys = Object.keys(this._ctrlsMap);
            if (ctrlIdKeys.length > 0) {
                // 找到控制器，设置为当前控制器并初始化
                this.currCtrlId = Number(ctrlIdKeys[0]);
                StateErrorManager.info("自动选择控制器", {
                    component: "StateSelectV2",
                    method: "__preload",
                    params: { selectedCtrlId: this.currCtrlId, availableControllers: ctrlIdKeys.length },
                });
                this.migrateStateIndexKeysForCtrl(this.getCurrCtrl());
                this.updateCtrlPage(this.getCurrCtrl());
                this.refProp();
            }
            else {
                // 没有找到控制器，清理状态
                StateErrorManager.warn("未找到可用的控制器", {
                    component: "StateSelectV2",
                    method: "__preload",
                });
                // @ts-expect-error _onPreDestroy is not typed
                this._onPreDestroy();
            }
        }
        else {
            // 已有当前控制器，更新页面并恢复属性选择
            StateErrorManager.debug("使用现有控制器", {
                component: "StateSelectV2",
                method: "__preload",
                params: { currentCtrlId: this.currCtrlId },
            });
            this.migrateStateIndexKeysForCtrl(this.getCurrCtrl());
            this.updateCtrlPage(this.getCurrCtrl());
            this.refProp();
        }

        // W6-axis-decomp X 方案: 自动接入完全走 propRef 字符串路径 (autoOptInCustomComponentProps).
        // 老路径 autoOptInApplicableProps (EnumPropName 数字 key) 已废 — 双轨设计在 AMBIGUOUS
        // (Position/Anchor/Size) 上的冲突 (排子项 cc.Node.x 但整体 'Position' 仍跟踪) 由此彻底切根:
        //   - cc.Node.x/y/z/scaleX/scaleY/anchorX/anchorY/width/height 等子项独立接入
        //   - EnumPropName.Position/Anchor/Size 整体路径自动接入零次
        // EnumPropName / PropHandlerManager 类 facade 保留, 老调用方 togglePropertyControl(EnumPropName.X)
        // 仍可主动调 (会写名字 key 'Position' 进 $$controlledProps$$, 与 propRef 路径共存; bridge
        // 由 isPropertyControlled / togglePropertyControl(_, false) 处理跨 key 一致性).
        if (this.currCtrlId) {
            this.autoOptInCustomComponentProps();
        }

        // W6-4: inspector 排除清单下拉 enumList 初始化 (idempotent, 重新 __preload 也可调).
        // 必须在所有 controlled 状态稳定后调 (autoOptIn 完, _userExcludedProps 已应用).
        this.refreshExcludeEnumLists();

        StateErrorManager.info("StateSelectV2预加载完成", {
            component: "StateSelectV2",
            method: "__preload",
            params: { finalCtrlId: this.currCtrlId, propKey: EnumPropName[this._propKey] },
        });
    }

    /**
     * W6-axis-decomp X 方案: autoOptInApplicableProps 已废 — 自动接入完全走 propRef 字符串路径.
     *
     * 历史: W6-2a 以前用 EnumPropName 数字路径自动接入 8 个 cc.Node 基础 prop (Active/Opacity/Color/
     * Position/Anchor/Size/Scale/Euler), 与 autoOptInCustomComponentProps 双轨并行. AMBIGUOUS 项
     * (Position=Vec3 整体 + cc.Node.x/y/z 子项) 双轨同时跟踪 → 用户排子项 cc.Node.x 不生效.
     *
     * X 方案后 (W6 终态全 cocos 内省): 全部走 propRef 单一路径 — autoOptInCustomComponentProps
     * 取消 isEnumMappedPropRef filter, 改为接入所有 listTrackableProps 返回的 propRef (除 AMBIGUOUS
     * 整体 + state machine 自身组件). EnumPropName / PropHandlerManager facade 保留, 老调用方
     * (panel / capability) 仍可主动调 togglePropertyControl(EnumPropName.X) — bridge 见
     * isPropertyControlled / togglePropertyControl(_, false) 跨 key 一致性处理.
     */

    /**
     * W6-2a: state controller 自身组件名单. 这些 component 是 state machine 基础设施,
     * 不该被自己控制. (W6-2c 会从 spec 抽出更完整的 controller-system blacklist.)
     */
    private static readonly CONTROLLER_SYSTEM_COMPS: ReadonlyArray<string> = [
        "StateSelectV2", "StateControllerV2", "StateValue",
        // 防御: werewolf 内同存旧版 state-controller, V2 内省一并跳过旧 cid
        "StateSelect", "StateController", "stateValue",
    ];

    /**
     * W6-axis-decomp X 方案: 节点上所有 trackable prop 自动接入 (走 propRef 字符串路径单一通道).
     *
     * 过滤策略 (相比 W6-2a 取消了 cc.Node + isEnumMappedPropRef 过滤, 改为单一 AMBIGUOUS 整体跳过):
     *   1) compName in CONTROLLER_SYSTEM_COMPS — state machine 自身组件不接入
     *   2) isAmbiguousAggregatePropRef(propRef) — AMBIGUOUS 整体 propRef ('cc.Node.position'/
     *      '.anchorPoint'/'.contentSize') 不接入, 让其子项 cc.Node.x/y/z/anchorX/anchorY/width/height
     *      独立接入 (X 方案核心 — 切根 AMBIGUOUS 双轨冲突)
     *   3) tp.readonly — 只读 (getter only) 字段写不进去, 不接入
     *   4) _userExcludedProps 用户黑名单 (W6-1 + W6-4 panel UI 维护)
     *   5) 已在 controlledProps 中跳过 (idempotent)
     *
     * SYSTEM_EXCLUDE 在 listTrackableProps 内部已过滤, 这里不重复.
     */
    private autoOptInCustomComponentProps(): void {
        if (!CC_EDITOR) return;
        if (!this.node) return;
        const userExcluded = new Set(this._userExcludedProps || []);
        const systemComps = new Set(StateSelectV2.CONTROLLER_SYSTEM_COMPS);
        let trackable: TrackableProp[] = [];
        try {
            trackable = listTrackableProps(this.node);
        }
        catch (e) {
            StateErrorManager.warn("autoOptInCustomComponentProps: listTrackableProps 失败", {
                component: "StateSelectV2",
                method: "autoOptInCustomComponentProps",
                params: { error: (e as Error).message },
            });
            return;
        }
        let enabled = 0;
        for (const tp of trackable) {
            // state controller 自身组件不接入
            if (systemComps.has(tp.compName)) continue;
            // W6-axis-decomp X 方案: AMBIGUOUS 整体 propRef 不接入, 让子项独立 (SPEC line52 auto-opt 跳过聚合)。
            // (#V1 驳回: euler 子项全 SYSTEM_EXCLUDE → 默认不自动接入, 此为 spec 设计; euler 仍可手动
            //  togglePropertyControl(Euler) 接入, 走整体聚合回退保 z。auto-opt 接入 euler 会破坏 roundTrip 且违 spec。)
            if (isAmbiguousAggregatePropRef(tp.propRef)) continue;
            // readonly 字段 (getter only) 写不进去, 不接入
            if (tp.readonly) continue;
            // 用户黑名单
            if (userExcluded.has(tp.propRef)) continue;
            // 已接入 (e.g. 二次 __preload) 跳过
            if (this.isPropertyControlledByPropRef(tp.propRef)) continue;
            try {
                this.togglePropertyControlByPropRefAllStates(tp.propRef, true);
                enabled++;
            }
            catch (e) {
                StateErrorManager.warn("autoOptInCustomComponentProps: togglePropertyControlByPropRef 失败", {
                    component: "StateSelectV2",
                    method: "autoOptInCustomComponentProps",
                    params: { propRef: tp.propRef, error: (e as Error).message },
                });
            }
        }
        StateErrorManager.info("StateSelectV2 prop 自动接入完成 (X 方案 propRef 单一路径)", {
            component: "StateSelectV2",
            method: "autoOptInCustomComponentProps",
            params: { enabledCount: enabled, trackableCount: trackable.length },
        });
    }

    /**
     * W6-2a: 把 propRef 接入到当前 ctrl 的**所有 state + default** (与老路径
     * syncPropToAllStatesInternal 同效, 但走 propRef string key). 仅在 __preload
     * 自动接入路径用一次, 后续用户在 panel/inspector 手动 opt-in/out 走单 state 路径.
     */
    private togglePropertyControlByPropRefAllStates(propRef: string, on: boolean): void {
        if (!CC_EDITOR) return;
        if (!this.node) return;
        const ctrl = this.getCurrCtrl();
        if (!ctrl) return;
        const pageData = this.getPageData();
        if (!on) {
            // 全局移除 (含旧 fat 数据各 state 的残留 flag), 复用 #C6 全删路径.
            this.removeControlledFlagAllStates(propRef);
            return;
        }
        // Track1 序列化瘦身: opt-in 只种 $$default$$ (schema flag + baseline 值).
        // 控制是全局 all-or-nothing (#C6), default 即受控真值源 (getControlledPropsMap 据此读),
        // 各 state 不再内联 controlledProps/baseline → 切 state 的值由 apply 路径 state→default 兜底,
        // state 仅在用户真正改值时(commitRecordingDiff/setDefaultProp) 写 override → compact 序列化.
        const tp = this.resolveTrackableProp(propRef);
        const cocosType = tp ? tp.cocosType : undefined;
        const current = this.readNodeValueByPropRef(propRef);
        if (pageData.$$default$$ == null) pageData.$$default$$ = {} as TProp;
        const dd = pageData.$$default$$ as any;
        dd.$$controlledProps$$ = dd.$$controlledProps$$ || {};
        dd.$$controlledProps$$[propRef] = propRef;
        if (dd[propRef] === undefined && current !== undefined) {
            dd[propRef] = cloneValueByType(current, cocosType);
        }
    }

    /**
     * W6-2a: propRef 字符串版本的 isPropertyControlled. 查 ctrlData 内层 $$controlledProps$$
     * 是否含该 propRef 作 key.
     *
     * T2 双轨统一 (X方案) 后: 内置与自定义 prop 在 $$controlledProps$$ 中**都**用 propRef 字符串
     * 作 key (内置 'cc.Node.active' / 自定义 'MyComp.heat', addPropertyControl 写 propRef 自指 key),
     * 不再有 EnumPropName 反查名字 key ("Active") 的第二条轨. 本方法直接查 propRef key.
     */
    public isPropertyControlledByPropRef(propRef: string): boolean {
        return this.getControlledPropsMap()[propRef] !== undefined;
    }

    /**
     * Track1 序列化瘦身: 受控集真值源 (ctrl 级). 控制是全局 all-or-nothing (#C6),
     * $$default$$.$$controlledProps$$ 是权威集 —— opt-in 路径恒同时写 default
     * (auto-opt 736/762, 单 state 819-820), opt-out 走 removeControlledFlagAllStates 全删,
     * 故 default 恒为各 state 受控集的超集.
     *
     * 旧 fat 数据各 state 也内联同份 controlledProps; 新 compact 数据仅 default 持有.
     * 取 default ∪ 当前 state 的并集: default 是权威超集(绝大多数 opt-in 都种 default), 但
     * 单 state opt-in 且当时节点值 undefined 时只写了 state flag(819-820 在 current!==undefined 内),
     * 故并上当前 state 以保 compact 前后行为一致. value 保留 number(内置 EnumPropName)/
     * string(自定义 propRef 自指) 双形态, 调用方按 typeof 分发.
     */
    private getControlledPropsMap(ctrlId?: number): { [propRef: string]: EnumPropName | string } {
        const pageData = this.getPageData(ctrlId);
        const dd = pageData.$$default$$ as any;
        const ddMap = (dd && dd.$$controlledProps$$) || {};
        const sd = this.getPropData(undefined, ctrlId) as any;
        const sdMap = (sd && sd.$$controlledProps$$) || {};
        if (Object.keys(sdMap).length === 0) return ddMap;
        if (Object.keys(ddMap).length === 0) return sdMap;
        return { ...ddMap, ...sdMap };
    }

    /**
     * W6-2a: propRef 字符串版本的 togglePropertyControl. 仅服务于自定义组件 prop (string key 路径).
     * 内置 prop 不该走此方法, 仍用 togglePropertyControl(EnumPropName) (老路径写 number key).
     *
     * 写入策略:
     *   - on=true: 在 $$controlledProps$$ 记 propRef → propRef (string key 自指, 标记接入);
     *              propData[propRef] 写入节点当前值 (用 cloneValueByType 深拷, 走 cocos type 分发)
     *   - on=false: 仅删 $$controlledProps$$[propRef] (保留 propData[propRef] 数据, 与老 removePropertyControl 行为一致)
     */
    private togglePropertyControlByPropRef(propRef: string, on: boolean): void {
        if (!CC_EDITOR) return;
        if (!this.node) return;
        const propData = this.getPropData();
        if (!propData) return;
        propData.$$controlledProps$$ = propData.$$controlledProps$$ || {};
        if (on) {
            propData.$$controlledProps$$[propRef] = propRef as any;
            // 拍当前值作为 baseline
            const tp = this.resolveTrackableProp(propRef);
            const current = this.readNodeValueByPropRef(propRef);
            if (current !== undefined) {
                (propData as any)[propRef] = cloneValueByType(current, tp ? tp.cocosType : undefined);
                // M3-2 修 #1 (apply 漏更新): 单 state 接入也补种 default baseline (若缺).
                // 否则切到"无该 key"的 state 时 applyPropRefKeysToNode 无兜底 → 节点残留上个 state 的值.
                // (auto-opt 走 togglePropertyControlByPropRefAllStates 写 default+全 state, 本单 state 路径
                //  服务 promptUntracked / 晚于 __preload 挂的组件 / 手动单 state 接入, 需对齐补 default.)
                const defaultData = this.getDefaultData();
                if (defaultData && (defaultData as any)[propRef] === undefined) {
                    (defaultData as any)[propRef] = cloneValueByType(current, tp ? tp.cocosType : undefined);
                }
                // #C6: 补种 default 时也补 default 的受控 flag —— 否则 apply 门控会把"有值无 flag"的
                // default baseline 当成已取消而 skip(applyMissingDefault 兜底失效)。与 auto-opt 写 default flag 对齐。
                if (defaultData) {
                    (defaultData as any).$$controlledProps$$ = (defaultData as any).$$controlledProps$$ || {};
                    (defaultData as any).$$controlledProps$$[propRef] = propRef;
                }
                // #T3: 录制中途接入 → 把 baseline 注入 _snapshot, 否则 commitRecordingDiff 只遍历
                // _snapshot(录制开始时拍的)→ 新接入 prop 的后续改动 stop 时丢失。
                const recCtrl = this.getCurrCtrl();
                if (recCtrl && recCtrl.isRecording && this._snapshot
                  && (this._snapshot as any)[propRef] === undefined) {
                    (this._snapshot as any)[propRef] = cloneValueByType(current, tp ? tp.cocosType : undefined);
                }
            }
        }
        else {
            // #C6: 取消是全局 (用户裁定: 控制 all-or-nothing) —— 移除所有 state + default 的 flag,
            // 配合 applyPropRefKeysToNode 门控, 取消后该 prop 冻结(不随 state 变)。数据保留(可再接入)。
            this.removeControlledFlagAllStates(propRef);
        }
    }

    /**
     * #C6: 全局移除某 propRef (及其 EnumPropName 名字 key) 的受控 flag —— 所有 state + default。
     * 取消 = 该属性整体退出管理(双端一致), 之后 applyPropRefKeysToNode 门控不再 apply 它 → 冻结。
     */
    private removeControlledFlagAllStates(propRef: string, propType?: EnumPropName): void {
        const ctrl = this.getCurrCtrl();
        const pageData = this.getPageData();
        const nameKey = propType !== undefined ? EnumPropName[propType] : undefined;
        const removeFrom = (data: TProp | undefined) => {
            const cp = data && (data as any).$$controlledProps$$;
            if (!cp) return;
            delete cp[propRef];
            if (nameKey) delete cp[nameKey];
        };
        removeFrom(pageData.$$default$$);
        if (ctrl) {
            for (let i = 0; i < ctrl.states.length; i++) {
                const stateId = this.getStateIdByIndex(ctrl, i);
                if (stateId >= 0) removeFrom(pageData[stateId]);
            }
        }
    }

    /**
     * W6-2a: 解析 propRef → { compName, propKey, cocosType } (跑一次 listTrackableProps 查表).
     * 慢路径, 仅 (write/apply 入口 + togglePropertyControlByPropRef 落值时) 用一次.
     */
    private resolveTrackableProp(propRef: string): TrackableProp | undefined {
        try {
            const list = listTrackableProps(this.node);
            return list.find(p => p.propRef === propRef);
        }
        catch (_) {
            return undefined;
        }
    }

    /**
     * W6-2a: 按 propRef 从节点上读当前值. cc.Node.* 走 node[propKey], 其它走 component[propKey].
     * 返回 undefined 表示组件不存在或 prop 不存在.
     *
     * W6-axis-decomp X 方案 修正: 改用 lastIndexOf('.') 分隔, 正确处理含多个 '.' 的内置
     * propRef (e.g. 'cc.Node.x' / 'cc.Label.string'). X 方案自动接入路径同时覆盖内置 + 自定义,
     * 原先的 indexOf 假设 ("仅服务自定义组件, compName 不含 '.'") 已破, 必须按 lastIndexOf 走.
     * 与 readPropFromNodeByPropRef 等价 — 保留独立方法以减小改动面.
     */
    private readNodeValueByPropRef(propRef: string): any {
        if (typeof propRef !== "string") return undefined;
        const lastDot = propRef.lastIndexOf(".");
        if (lastDot <= 0 || lastDot >= propRef.length - 1) return undefined;
        const compName = propRef.substring(0, lastDot);
        const propKey = propRef.substring(lastDot + 1);
        if (compName === "cc.Node") {
            return (this.node as any)[propKey];
        }
        const comp = this.node.getComponent(compName as any);
        if (!comp) return undefined;
        return (comp as any)[propKey];
    }

    /**
     * W6-2a-fixup: 按 propRef 从节点上读当前值 (Recording 路径专用, 支持所有 propRef).
     *
     * 与 readNodeValueByPropRef 区别: 用 lastIndexOf('.') 分隔, 正确处理含多个 '.' 的内置
     * propRef (e.g. 'cc.Node.active' / 'cc.Label.string' / 'cc.Widget.alignMode'). 不依赖
     * compName !== 'cc.Node' 的过滤前提.
     *
     * 调用方:
     *   - readAllApplicablePropsFromNode (扫所有 trackable 写 _fullSnapshot)
     *   - collectDirtyControlled (string propRef 分支读当前值)
     *   - detectUntrackedDirty (string key 分支读当前值)
     *
     * 返回 undefined 表示组件不存在或 prop 不存在.
     */
    private readPropFromNodeByPropRef(propRef: string): any {
        if (typeof propRef !== "string") return undefined;
        const lastDot = propRef.lastIndexOf(".");
        if (lastDot <= 0 || lastDot >= propRef.length - 1) return undefined;
        const compName = propRef.substring(0, lastDot);
        const propKey = propRef.substring(lastDot + 1);
        if (compName === "cc.Node") {
            return (this.node as any)[propKey];
        }
        const comp = this.node.getComponent(compName as any);
        if (!comp) return undefined;
        return (comp as any)[propKey];
    }

    /**
     * W6-2a: 按 propRef 把值写回节点. compName === "cc.Node" 走 node[propKey] = value,
     * 其它走 component[propKey] = value. cocosType-aware clone 由调用方负责.
     *
     * W6-axis-decomp X 方案 修正: 用 lastIndexOf('.') 分隔, 正确处理 'cc.Node.x' / 'cc.Label.string'
     * 等内置 propRef (含多个 '.'). 与 readNodeValueByPropRef 对称.
     */
    private writeNodeValueByPropRef(propRef: string, value: any): void {
        if (typeof propRef !== "string") return;
        const lastDot = propRef.lastIndexOf(".");
        if (lastDot <= 0 || lastDot >= propRef.length - 1) return;
        const compName = propRef.substring(0, lastDot);
        const propKey = propRef.substring(lastDot + 1);
        if (compName === "cc.Node") {
            (this.node as any)[propKey] = value;
            return;
        }
        const comp = this.node.getComponent(compName as any);
        if (!comp) return;
        (comp as any)[propKey] = value;
    }

    /**
     * W6-2a: 枚举 propData 中所有 string key (排除 $$ meta key + EnumPropName 数字 key).
     * 仅自定义 propRef key, 用于 commit/apply 路径单独遍历.
     */
    private extractPropRefKeys(data: TProp): string[] {
        const out: string[] = [];
        if (!data) return out;
        for (const k of Object.keys(data)) {
            if (k.startsWith("$$")) continue;
            // EnumPropName 数字 key (老路径) — extractNumericPropKeys 处理
            if (!Number.isNaN(Number(k))) continue;
            out.push(k);
        }
        return out;
    }

    protected onLoad() {
        if (!CC_EDITOR) {
            return;
        }

        //  记录初始父节点
        this.lastParent = this.node.parent;
        // 2.x没有父节点变化监听，需要定时检测
        this.parentCheckInterval = setInterval(() => {
            this.checkParentChanged();
        }, 1000);

        // Wave 2 T10: 删除 8 个 cc 事件 hook (position/color/scale/size/anchor/active/rotation/spriteframe).
        // 录制现在走 prefab diff 路径 (StateControllerV2.startRecording → snapshot → 切 state/stop 时 diff commit),
        // 不再依赖运行时 cc 事件; 顺手修复"无 cc 事件的 prop (button.interactable/label.string/widget.top) 无法录制"长期 bug。
    }

    protected onDestroy() {
        // 清理父节点检测定时器
        if (this.parentCheckInterval) {
            clearInterval(this.parentCheckInterval);
            this.parentCheckInterval = null;
        }

        // IMPL-001.6: 销毁时通知控制器缓存失效
        this.notifyControllerCacheDirty();

        // Wave 2 T10: 8 个 cc 事件 hook 已删, 这里不再需要 off。
    }

    /**
     * W6-2c2: ctrlData number key → string propRef key 迁移 (扩 c1 framework).
     *
     * 规则 (按 key 处理顺序):
     *   1) $$xxx$$ 元数据 key ($$controlledProps$$ / $$propertyData$$ / $$lastProp$$ / $$changedProp$$ / $$default$$):
     *      完全不动 (其内层值仍可能含 EnumPropName 数字, 是合法语义)
     *   2) 自定义 string propRef key (e.g. "MyComp.heat", 含 "." 的字符串): 完全不动
     *   3) 数字 key (propType):
     *      a) LEGACY_DROPPED_ENUMS 命中 (e.g. GrayScale=15) → delete (W6-2c1 行为)
     *      b) enumToPropRef() 命中 (ENUM_TO_PROPREF 36 项 + AMBIGUOUS 3 项 = 39 项) → 迁 string propRef key
     *      c) 未命中 (无对应映射, 保守保留): 不动 + warn (理论上不应发生, 39+1 已覆盖所有 EnumPropName 实例)
     *
     * 内层 $$propertyData$$ 是 {[propType:number]: TPropValue} 形状, 按同规则扫 (c2 一并迁 string key).
     * $$default$$ state 是外层 propData 的 sibling, 按同规则递归 (Object.keys(ctrlPage) 已含 $$default$$).
     *
     * idempotent — 第二次扫已无数字 key, no-op. 老 .fire 加载后 __preload 跑一次, 之后 ctrlData
     * 内层 key 全是 string, c3 删 EnumPropName 后整体一致.
     */
    /**
     * Track1 序列化瘦身: 把 fat _ctrlData (每个 state 内联 $$controlledProps$$ + 全量值, auto-opt
     * 历史遗留) 规范化为 compact —— 受控集真值源上提到 $$default$$, 各 state 只保留与 default 不同的
     * override. apply 路径 state→default 兜底 (applyDataToNode:2777 / readPropByEnum:1163) 保证等价。
     *
     * 幂等: compact 数据再跑是 no-op. 在 __preload 读盘后跑一次, 内存即 compact, 下次存盘紧凑.
     * 不动 $$default$$ (它是 schema + baseline 的唯一权威副本)。
     */
    private compactCtrlData(): void {
        const ctrlData = this._ctrlData;
        if (!ctrlData) return;
        for (const ctrlId of Object.keys(ctrlData)) {
            const page = (ctrlData as any)[ctrlId];
            if (!page || typeof page !== "object") continue;
            const def = page.$$default$$;
            for (const stateKey of Object.keys(page)) {
                if (stateKey === "$$default$$") continue;
                const state = page[stateKey];
                if (!state || typeof state !== "object") continue;
                // 受控集真值源在 default → 删 per-state 内联副本 (62KB 级冗余主因)。
                if (state.$$controlledProps$$ !== undefined) delete state.$$controlledProps$$;
                // 删与 default 相等的值 (apply 兜底), 只留真正 override。
                if (def) {
                    for (const pk of Object.keys(state)) {
                        if (pk.startsWith("$$")) continue;
                        if ((def as any)[pk] === undefined) continue; // default 无此键 → state 是唯一来源, 保留
                        const tp = this.resolveTrackableProp(pk);
                        const cocosType = tp ? tp.cocosType : undefined;
                        if (eqValueByType(state[pk], (def as any)[pk], cocosType)) {
                            delete state[pk];
                        }
                    }
                }
            }
        }
    }

    private migrateLegacyCtrlData(): void {
        const ctrlData = this._ctrlData;
        if (!ctrlData) {
            return;
        }
        const dropSet = LEGACY_DROPPED_ENUMS || [];
        // 处理单一 propType 数字 key: drop | migrate | keep-with-warn
        // 返回 'dropped' / 'migrated' / 'kept', 调用方对外层 propData 用此结果更新形状
        const handleNumericKey = (dict: any, propKey: string): "dropped" | "migrated" | "kept" => {
            const numKey = Number(propKey);
            if (dropSet.indexOf(numKey) !== -1) {
                delete dict[propKey];
                return "dropped";
            }
            const propRef = enumToPropRef(numKey);
            if (propRef !== undefined) {
                // 迁移: 若 string propRef key 已存在, 优先保留已有 (W6-2a 写路径已迁的情况)
                if (dict[propRef] === undefined) {
                    dict[propRef] = dict[propKey];
                }
                delete dict[propKey];
                return "migrated";
            }
            // 保守保留: 理论上 39+1 已覆盖所有 EnumPropName 实例
            return "kept";
        };
        const sweepPropDictionary = (dict: any): void => {
            if (!dict || typeof dict !== "object") {
                return;
            }
            for (const propKey of Object.keys(dict)) {
                // 跳过 $$xxx$$ 元数据 key
                if (propKey.startsWith("$$")) {
                    continue;
                }
                // 仅 /^\d+$/ 才是 propType 数字 key; string propRef key 不动
                if (!/^\d+$/.test(propKey)) {
                    continue;
                }
                handleNumericKey(dict, propKey);
            }
        };
        // W6-axis-decomp X 方案: 第二趟扫 — AMBIGUOUS 整体 propRef 值 (Vec3/Vec2/Size) → 拆子项 key.
        // 在 number→string 迁移之后跑, 这样 'cc.Node.position'=Vec3 (无论是直接老数据还是迁移产物) 都被覆盖.
        // 守卫: AMBIGUOUS_DECOMPOSE[propRef] 的拆解函数对非 Vec/Size 形状值 (e.g. stub 字符串) 返回 null,
        // 保留原值不动 (W6-2c2 老测试 stub-pos 字符串场景保持兼容).
        const sweepDecomposeAmbiguous = (dict: any): void => {
            if (!dict || typeof dict !== "object") return;
            for (const propRef of Object.keys(AMBIGUOUS_DECOMPOSE)) {
                if (!(propRef in dict)) continue;
                const decomposer = AMBIGUOUS_DECOMPOSE[propRef];
                const subPairs = decomposer(dict[propRef]);
                if (!subPairs) continue; // 形状不符 (e.g. stub 字符串) — 不动
                for (const [subRef, subVal] of subPairs) {
                    // 整体 Vec3/Vec2/Size 是老 .fire 真实数据, 拆解为子项是数据迁移的权威值,
                    // 强制覆盖 — 即使子项 key 已存在 (autoOptIn 在 __preload 时写过 baseline=0,
                    // migration 必须用老 .fire 整体值替换). 已是子项形态的老用户场景见
                    // sweepPropDictionary 之前的 number→string 迁移, 与本步骤不冲突.
                    dict[subRef] = subVal;
                }
                delete dict[propRef];
            }
        };
        // #S4: 取某聚合 propRef 的子项 ref 列表 (用零探针调拆解函数, 仅取 key).
        const ambiguousSubRefs = (aggRef: string): string[] => {
            const probe = {
                x: 0, y: 0, z: 0, width: 0, height: 0,
            };
            const decomposer = AMBIGUOUS_DECOMPOSE[aggRef];
            const pairs = decomposer ? decomposer(probe) : null;
            return pairs ? pairs.map(p => p[0]) : [];
        };
        // #S4: 迁 $$controlledProps$$ 的 key — 数字 key → propRef string key; 聚合(数字或 string)→ 子项 ref.
        const sweepControlledPropsKeys = (cprops: any): void => {
            if (!cprops || typeof cprops !== "object") return;
            for (const key of Object.keys(cprops)) {
                if (key.startsWith("$$")) continue;
                if (!/^\d+$/.test(key)) continue; // 已是 string propRef key, 下面统一处理聚合
                const num = Number(key);
                if (dropSet.indexOf(num) !== -1) {
                    delete cprops[key];
                    continue;
                }
                const ref = enumToPropRef(num);
                if (ref === undefined) continue;
                if (isAmbiguousAggregatePropRef(ref)) {
                    for (const sub of ambiguousSubRefs(ref)) cprops[sub] = sub;
                }
                else {
                    cprops[ref] = ref;
                }
                delete cprops[key];
            }
            // 聚合 string ref 残留 (老数据或迁移产物) → 展开为子项 ref, 与 propData 拆子项对齐.
            for (const aggRef of Object.keys(AMBIGUOUS_DECOMPOSE)) {
                if (cprops[aggRef] !== undefined) {
                    for (const sub of ambiguousSubRefs(aggRef)) cprops[sub] = sub;
                    delete cprops[aggRef];
                }
            }
        };
        for (const ctrlIdKey of Object.keys(ctrlData)) {
            const ctrlPage = ctrlData[ctrlIdKey];
            if (!ctrlPage || typeof ctrlPage !== "object") {
                continue;
            }
            for (const stateKey of Object.keys(ctrlPage)) {
                const propData = (ctrlPage as any)[stateKey];
                if (!propData || typeof propData !== "object") {
                    continue;
                }
                // 外层 propData: 扫数字 key (跳过 $$xxx$$ 元数据)
                sweepPropDictionary(propData);
                // W6-axis-decomp X 方案: 接着拆 AMBIGUOUS 整体 propRef (Vec3/Vec2/Size) → 子项 key.
                // 必须在 sweepPropDictionary 之后跑 — 老数字 key 先迁 string propRef, 再统一拆解.
                sweepDecomposeAmbiguous(propData);
                // #S4 (NA-8): $$controlledProps$$ 元桶也迁 — 数字 key → propRef string key, 聚合 → 子项 ref.
                // 否则 C6 apply 门控对老 .fire 迁移数据 (propData 已迁 string, 但 controlledProps 仍数字) 全 skip.
                sweepControlledPropsKeys(propData.$$controlledProps$$);
                // 内层 $$propertyData$$: 同规则扫 (number key 也迁 string key, AMBIGUOUS 也拆)
                if (propData.$$propertyData$$) {
                    sweepPropDictionary(propData.$$propertyData$$);
                    sweepDecomposeAmbiguous(propData.$$propertyData$$);
                    // #U5: 迁移后把 $$propertyData$$ 的 string propRef 值合并到**顶层** propData ——
                    // X 方案 apply (applyPropRefKeysToNode) 只读顶层 key, 老 .fire 的 $$propertyData$$
                    // 子 bucket 值若不上提则永不 apply。已存在的顶层 key 优先(不覆盖)。
                    const pdBucket = propData.$$propertyData$$ as any;
                    for (const k of Object.keys(pdBucket)) {
                        if (k.startsWith("$$")) continue;
                        if ((propData as any)[k] === undefined) {
                            (propData as any)[k] = pdBucket[k];
                        }
                    }
                }
            }
        }
    }

    /**
     * W6-2c2: 按 EnumPropName 读 propData, 优先 string propRef key, fallback number key.
     *
     * 双 key 兼容期 helper — 解决 production 写路径 (W6-2a) 仍可能在 ctrlData 内层写过 number key 的历史数据.
     * c2 完成后, 编辑器加载老 .fire __preload 会跑 migrateLegacyCtrlData 把 number key 迁 string,
     * 但 in-memory 路径 (如 commit/snapshot 前后) 可能短暂双 key 共存, 用本 helper 保证读到正确值.
     *
     * 公开 internal: StateControllerV2.promptDirtyAndStart 在外部 commit 时也走此 helper, 否则
     * 老 number key 写入会绕过 c2 数据规范, 导致 ctrlData 出现 number + string 双 key 不一致.
     */
    public readPropByEnum(propData: any, propType: EnumPropName): TPropValue {
        if (!propData) return undefined;
        const propRef = enumToPropRef(propType);
        if (propRef !== undefined && propData[propRef] !== undefined) {
            return propData[propRef];
        }
        return (propData as TPropDictionary)[propType];
    }

    /**
     * W6-2c2: 按 EnumPropName 写 propData, 优先写 string propRef key + 清掉同义 number key.
     *
     * - propRef 命中 (内置 36 + AMBIGUOUS 3 = 39 项) → propData[propRef] = value; delete propData[number]
     * - propRef 未命中 (理论不发生) → 回退老路径 propData[number] = value
     *
     * 双写清理保证: 老 number key 数据立即清, 不会出现"已迁 string + 残留 number" 的双 key 状态.
     *
     * 公开 internal: StateControllerV2.promptDirtyAndStart "保存到当前 state" 路径也走此 helper.
     */
    public writePropByEnum(propData: any, propType: EnumPropName, value: TPropValue): void {
        if (!propData) return;
        const propRef = enumToPropRef(propType);
        if (propRef !== undefined) {
            propData[propRef] = value;
            delete (propData as TPropDictionary)[propType];
            // W6-axis-decomp: 若 propRef 是 AMBIGUOUS aggregate (Position/Anchor/Size/Scale/Euler), 同步拆子项写入.
            // 让老 facade API (togglePropertyControl(EnumPropName.Anchor) + setDefaultProp) 能跟 X 方案 apply 路径
            // (走 listTrackableProps 子项 readPropFromNodeByPropRef) 协同 — 子项 apply 时能读到 propData['cc.Node.anchorX'] 等.
            const decompose = AMBIGUOUS_DECOMPOSE[propRef];
            if (decompose) {
                const subs = decompose(value);
                if (subs) {
                    for (const [subRef, subVal] of subs) {
                        propData[subRef] = subVal;
                    }
                }
            }
        }
        else {
            (propData as TPropDictionary)[propType] = value;
        }
    }

    // #endregion 2.

    // #region 3. 事件观察与控制器迁移
    // 节点属性变化 hooks + parent check interval + 跨 controller 移动适配

    /**
     * 🔧 通知当前控制器缓存失效
     * 当StateSelectV2组件创建/销毁/移动时调用
     */
    private notifyControllerCacheDirty(): void {
        // 直接向上找父链上最近的 StateControllerV2, 不依赖 this.currCtrlId.
        // 因为 __preload 内调用此方法时 currCtrlId 还没被设置, getCurrCtrl() 会
        // 返回 undefined, markCacheDirty 不被调用 → 导致"ctrl 比 select 早创建,
        // 第 2+ 个 select 永远不在 cache, 切 state 时跳过它"的 bug.
        let parent = this.node ? this.node.parent : null;
        while (parent && parent.isValid) {
            const ctrl = parent.getComponent(StateControllerV2);
            if (ctrl) {
                ctrl.markCacheDirty();
                StateErrorManager.debug("已通知控制器缓存失效", {
                    component: "StateSelectV2",
                    method: "notifyControllerCacheDirty",
                    params: { ctrlName: ctrl.ctrlName },
                });
                return;
            }
            parent = parent.parent;
        }
    }

    /**
     * #F-4 (TASK-004): 某位置轴是否"当前受控且未排除" —— reparent 坐标转换的唯一判据.
     * 受控 = isPropertyControlled(propRef) (当前 state $$controlledProps$$ 命中);
     * 未排除 = 不在 _userExcludedProps + SYSTEM_EXCLUDE. 仅这两者皆满足才转换该轴,
     * propData 残留 baseline (取消跟随/排除后留下) 不再触发转换.
     */
    private isAxisConvertible(axisRef: string): boolean {
        // #S2: 受控判定按**全局**(default 或任一 state 的 controlledProps), 不依赖当前激活 state ——
        // 否则激活一个新加的空 state 时, 当前 state 无 flag → 误判全轴不受控 → reparent 整体跳过,
        // 其他 state 存的位置不被换算。
        if (!this.isAxisControlledGlobally(axisRef)) return false;
        if ((this._userExcludedProps || []).indexOf(axisRef) >= 0) return false;
        if (SYSTEM_EXCLUDE.indexOf(axisRef) >= 0) return false;
        return true;
    }

    /** #S2: 某 propRef 是否在全局(default 或任一 state)受控 —— reparent 换算判据, 与激活 state 无关. */
    private isAxisControlledGlobally(propRef: string): boolean {
        const pageData = this.getPageData();
        const dd = pageData.$$default$$;
        if (dd && (dd as any).$$controlledProps$$ && (dd as any).$$controlledProps$$[propRef] !== undefined) {
            return true;
        }
        const ctrl = this.getCurrCtrl();
        if (ctrl) {
            for (let i = 0; i < ctrl.states.length; i++) {
                const stateId = this.getStateIdByIndex(ctrl, i);
                if (stateId < 0) continue;
                const pdi = pageData[stateId];
                if (pdi && (pdi as any).$$controlledProps$$ && (pdi as any).$$controlledProps$$[propRef] !== undefined) {
                    return true;
                }
            }
        }
        return false;
    }

    /** 父节点改变 */
    private parentChanged(oldParent: cc.Node) {
        this.transPosition(oldParent);
    }

    /** 检查父节点是否变化 */
    private checkParentChanged() {
        // 安全检查：确保节点仍然有效
        if (!this.node || !this.node.isValid) {
            return;
        }

        const currentParent = this.node.parent;

        if (this.lastParent !== currentParent) {
            const oldParent = this.lastParent;
            this.lastParent = currentParent;

            // 新增：检查控制器承接
            this.handleControllerTransition(oldParent, currentParent);

            // 只有当有"当前受控且未排除"的位置轴时才需要转换坐标.
            // M3-2 修 #2: Position 以子项 cc.Node.x/y/z 存, 改判子项 key.
            // #F-4 修 (TASK-004): gate 不再按"pageData 有值 key"(残留数据)判定, 改按"受控未排除"判定 —
            // 取消跟随/排除但 propData 残留 baseline 的轴不应触发坐标转换 (附录A 断言#3).
            const hasPositionControl
                = this.isAxisConvertible("cc.Node.x")
                  || this.isAxisConvertible("cc.Node.y")
                  || this.isAxisConvertible("cc.Node.z");

            if (hasPositionControl) {
                this.parentChanged(oldParent);
            }
        }
    }

    /** 处理控制器承接 */
    private handleControllerTransition(oldParent: cc.Node, newParent: cc.Node) {
        StateErrorManager.debug("开始控制器承接处理", {
            component: "StateSelectV2",
            method: "handleControllerTransition",
            params: {
                hasOldParent: !!oldParent,
                hasNewParent: !!newParent,
                currentCtrlId: this.currCtrlId,
            },
        });

        // 获取旧控制器
        const oldCtrls = oldParent ? this.getCtrls(oldParent) : [];
        const oldCtrl = oldCtrls.find(ctrl => ctrl.ctrlId === this.currCtrlId);

        // 获取新控制器
        const newCtrls = newParent ? this.getCtrls(newParent) : [];
        const newCtrl = this.selectBestController(newCtrls, oldCtrl);

        StateErrorManager.debug("控制器分析结果", {
            component: "StateSelectV2",
            method: "handleControllerTransition",
            params: {
                oldCtrlsCount: oldCtrls.length,
                newCtrlsCount: newCtrls.length,
                hasOldCtrl: !!oldCtrl,
                hasNewCtrl: !!newCtrl,
                oldCtrlName: oldCtrl?.ctrlName,
                newCtrlName: newCtrl?.ctrlName,
            },
        });

        // 如果新旧都有控制器且不同，执行数据承接
        if (oldCtrl && newCtrl && oldCtrl.ctrlId !== newCtrl.ctrlId) {
            // Wave 2 T16: 跨 ctrl 移动前的兜底 commit
            // 若 oldCtrl 正在录制, 先把当前 diff commit 到 oldCtrl 的当前 state, 再清 snapshot,
            // 避免数据随 ctrl 切换丢失。
            if (oldCtrl.isRecording && this._snapshot != null) {
                StateErrorManager.info("跨 ctrl 移动前自动 commit 录制 diff", {
                    component: "StateSelectV2",
                    method: "handleControllerTransition",
                    params: { fromCtrl: oldCtrl.ctrlName, state: oldCtrl.selectedIndex },
                });
                this.commitRecordingDiff(oldCtrl, oldCtrl.selectedIndex);
                this._snapshot = null;
            }

            // 1. 备份当前状态数据
            const oldCtrlData = this._ctrlData[oldCtrl.ctrlId];

            if (oldCtrlData) {
                // 2. 将数据迁移到新控制器
                // 需要根据新控制器的状态数量调整数据结构
                const transferredData = this.adaptDataToNewController(oldCtrlData, newCtrl);
                this._ctrlData[newCtrl.ctrlId] = transferredData;

                // 3. 清理旧控制器数据
                delete this._ctrlData[oldCtrl.ctrlId];

                // 4. 更新控制器映射和当前控制器ID
                this.updateCtrlName(newParent);
                this._currCtrlId = newCtrl.ctrlId;

                // #T2: 跨 ctrl 移动后两边缓存都失效 —— 否则旧 ctrl 的 _stateSelectCache 仍含本 select(继续
                // 误更新已移走的节点), 新 ctrl 缓存不含本 select(切 state 不接管本节点)。
                oldCtrl.markCacheDirty();
                newCtrl.markCacheDirty();

                // 5. 更新界面
                this.updateCtrlPage(newCtrl);
                this.refProp();

                StateErrorManager.info("控制器承接完成", {
                    component: "StateSelectV2",
                    method: "handleControllerTransition",
                    params: { fromController: oldCtrl.ctrlName, toController: newCtrl.ctrlName },
                });
            }
        }
        else if (newCtrl && !oldCtrl) {
            // 从无控制器环境移动到有控制器环境
            StateErrorManager.info("绑定到新控制器", {
                component: "StateSelectV2",
                method: "handleControllerTransition",
                params: { newController: newCtrl.ctrlName },
            });
            this.updateCtrlName(newParent);
            if (!this.currCtrlId) {
                this._currCtrlId = newCtrl.ctrlId;
                this.updateCtrlPage(newCtrl);
                this.refProp();
            }
        }
        else if (oldCtrl && !newCtrl) {
            // 从有控制器环境移动到无控制器环境
            // 保留数据但清除当前绑定
            this._currCtrlId = null;
            this._propKey = EnumPropName.Non;
        }
    }

    /** 适配数据到新控制器 */
    private adaptDataToNewController(oldData: TPage, newCtrl: StateControllerV2): TPage {
        const newData: TPage = {};

        // 复制默认数据
        if (oldData.$$default$$) {
            newData.$$default$$ = this.deepCloneStateData(oldData.$$default$$);
        }

        // 根据新控制器的状态数量适配状态数据
        for (let stateIndex = 0; stateIndex < newCtrl.states.length; stateIndex++) {
            if (oldData[stateIndex]) {
                // 如果旧数据有对应状态，直接复制
                newData[stateIndex] = this.deepCloneStateData(oldData[stateIndex]);
            }
            else if (newData.$$default$$) {
                // 如果旧数据没有对应状态，使用默认数据创建新状态
                newData[stateIndex] = this.deepCloneStateData(newData.$$default$$);
                // 清除新状态的lastProp，让用户重新选择
                delete newData[stateIndex].$$lastProp$$;
            }
        }

        return newData;
    }

    /** 深度克隆状态数据方法 */
    private deepCloneStateData(data?: TProp): TProp {
        if (!data) {
            return {} as TProp;
        }

        const cloned: Record<string, unknown> = {};
        const keys = Object.keys(data);

        for (let i = 0, len = keys.length; i < len; i++) {
            const key = keys[i];
            const value = (data as Record<string, unknown>)[key];

            if (key === "$$changedProp$$" || key === "$$controlledProps$$" || key === "$$propertyData$$") {
                cloned[key] = value ? { ...(value as object) } : value;
                continue;
            }

            if (key === "$$lastProp$$") {
                cloned[key] = value;
                continue;
            }

            // 🔧 快速处理：基本类型直接复制
            if (!value || typeof value !== "object") {
                cloned[key] = value;
                continue;
            }
            const constructor = value.constructor;
            if (constructor === cc.Vec3) {
                // 🔧 Vec3: 直接使用现有值创建新对象
                const vec3Value = value as cc.Vec3;
                cloned[key] = cc.v3(vec3Value.x, vec3Value.y, vec3Value.z);
            }
            else if (constructor === cc.Vec2) {
                // 🔧 Vec2: 直接使用现有值创建新对象
                const vec2Value = value as cc.Vec2;
                cloned[key] = cc.v2(vec2Value.x, vec2Value.y);
            }
            else if (constructor === cc.Color) {
                // 🔧 Color: 直接使用RGBA值创建新对象
                const color = value as cc.Color;
                cloned[key] = cc.color(color.r, color.g, color.b, color.a);
            }
            else if (constructor === cc.Size) {
                // 🔧 Size: 直接使用宽高值创建新对象
                const size = value as cc.Size;
                cloned[key] = cc.size(size.width, size.height);
            }
            else if (value instanceof cc.Asset) {
                // 🔧 Asset对象：直接保留引用（SpriteFrame、Font等）
                cloned[key] = value;
            }
            else {
                // 🔧 其他对象：浅拷贝（如$$changedProp$$等元数据对象）
                cloned[key] = { ...(value as object) };
            }
        }

        return cloned as TProp;
    }

    /** 选择最佳控制器用于承接 */
    private selectBestController(newCtrls: StateControllerV2[], oldCtrl: StateControllerV2): StateControllerV2 {
        if (!newCtrls || newCtrls.length === 0) {
            return null;
        }

        // 如果只有一个控制器，直接返回
        if (newCtrls.length === 1) {
            return newCtrls[0];
        }

        // 如果有多个控制器，优先选择状态数量相同的控制器
        if (oldCtrl) {
            const oldStatesCount = oldCtrl.states.length;
            const matchingCtrl = newCtrls.find(ctrl => ctrl.states.length === oldStatesCount);
            if (matchingCtrl) {
                return matchingCtrl;
            }
        }

        // 如果没有状态数量匹配的，选择第一个控制器
        return newCtrls[0];
    }

    /** 更新控制器 */
    public updateCtrlName(node: cc.Node) {
        if (!CC_EDITOR) {
            return;
        }
        if (!node || !node.isValid) {
            StateErrorManager.debug("updateCtrlName: 节点无效", {
                component: "StateSelectV2",
                method: "updateCtrlName",
                params: { hasNode: !!node, isValid: node?.isValid },
            });
            return;
        }

        StateErrorManager.debug("开始更新控制器名称", {
            component: "StateSelectV2",
            method: "updateCtrlName",
            params: { nodeName: node.name },
        });

        const ctrls = this.getCtrls(node);
        const arr = ctrls.map((val) => {
            if (this._ctrlsMap[val.ctrlId] == void 0) {
                this._ctrlsMap[val.ctrlId] = val;
            }
            return { name: val.ctrlName, value: val.ctrlId };
        });
        // @ts-expect-error setClassAttr is unavailable in Cocos Creator d.ts
        cc.Class.Attr.setClassAttr(this, "currCtrlId", "enumList", arr);

        StateErrorManager.info("控制器名称更新完成", {
            component: "StateSelectV2",
            method: "updateCtrlName",
            params: { controllersFound: ctrls.length, mappedControllers: Object.keys(this._ctrlsMap).length },
        });
    }

    /**
     * 重新绑定控制器 (拷贝到新 prefab 后用). 清掉悬空缓存 → 按当前祖先链重扫 → 重解析绑定指针.
     *
     * 典型场景: 把带 StateSelectV2 的节点拷贝粘贴到另一个 prefab 后, _currCtrlId/_ctrlsMap 仍指向
     * 老 prefab 的控制器 (新 prefab 里不存在); 自动承接 (checkParentChanged 轮询 lastParent) 又盖不住
     * "重开 prefab" 路径 (打开即 lastParent === node.parent, 永不触发). 故需手动按当前祖先链重绑,
     * 无需删组件再加.
     *
     * 数据策略: 只在「真切换到一个不同控制器」时才全删旧状态数据 (_ctrlData = {}), 因为老 prefab 的
     * 数据在新链里绑不上、视为重来. 两个兜底防止无谓破坏:
     *  - 目标与当前是同一控制器 → 不操作 (防误点). 不靠 ctrlId 判 "是否语义一致的 StateController"
     *    (无法可靠判定), 同一即不动.
     *  - 没扫到任何控制器 → 不操作 (无东西可绑, 不删唯一的数据).
     */
    public rebindController(): void {
        if (!CC_EDITOR) {
            return;
        }

        // 1. 清掉来自老 prefab 的悬空缓存. updateCtrlName 对 _ctrlsMap 只增不删, 不先清则下拉残留死控制器.
        const prevCtrlId = this._currCtrlId;
        this._ctrlsMap = {};
        this._root = null;

        // 2. 按当前祖先链重扫, 重建 _ctrlsMap 与 currCtrlId 下拉枚举.
        this.updateCtrlName(this.node.parent);

        // 3. 解析目标控制器: 旧绑定在新链里仍有效则保留, 否则单控制器自动绑、多控制器绑第一个 (下拉已刷新可手改).
        const ids = Object.keys(this._ctrlsMap);
        let nextId: number = null;
        if (prevCtrlId != null && this._ctrlsMap[prevCtrlId]) {
            nextId = prevCtrlId;
        }
        else if (ids.length) {
            nextId = Number(ids[0]);
        }

        // 4. 兜底: 没扫到控制器, 或目标与当前一致 → 不操作, 不动数据.
        if (nextId == null || nextId === prevCtrlId) {
            StateErrorManager.debug("rebindController: 无新控制器可绑或与当前一致, 跳过", {
                component: "StateSelectV2",
                method: "rebindController",
                params: { prevCtrlId, nextId, controllersFound: ids.length },
            });
            return;
        }

        // 5. 真切到不同控制器: 全删旧状态数据 (老 prefab 数据在新链绑不上, 重来), 再切指针.
        //    直接赋值 _currCtrlId (不走 setter): 避开 setter 告警, 并保证 updateCtrlPage 比对前指针已就位.
        this._ctrlData = {};
        this._currCtrlId = nextId;

        // 6. 刷新页面. updateCtrlPage 内部用 currCtrlId 比对, 须在 _currCtrlId 赋值后调用.
        const ctrl = this.getCurrCtrl();
        if (ctrl) {
            ctrl.markCacheDirty();
            this.updateCtrlPage(ctrl);
            this.refProp();
        }

        StateErrorManager.info("重新绑定控制器完成", {
            component: "StateSelectV2",
            method: "rebindController",
            params: { prevCtrlId, nextId, controllersFound: ids.length },
        });
    }

    /** 获取所有的Ctrl */
    private getCtrls(node: cc.Node): StateControllerV2[] {
        if (!node || !CC_EDITOR) {
            if (!node) {
                StateErrorManager.debug("getCtrls: 节点为空", {
                    component: "StateSelectV2",
                    method: "getCtrls",
                });
            }
            return [];
        }
        const ctrls = node.getComponents(StateControllerV2);
        if (ctrls.length) {
            this._root = node;
            StateErrorManager.debug("找到控制器", {
                component: "StateSelectV2",
                method: "getCtrls",
                params: { ctrlCount: ctrls.length, nodeName: node.name },
            });
            return ctrls;
        }
        return this.getCtrls(node.parent);
    }

    // #endregion 3.

    // #region 4. 状态数据操作 (state 增删移 + page data 迁移)

    /** 更新状态数量 */
    public updateCtrlPage(ctrl: StateControllerV2, deleteIndex?: number) {
        if (!CC_EDITOR) {
            return;
        }

        if (!ctrl || ctrl.ctrlId !== this.currCtrlId) {
            return;
        }

        if (deleteIndex != void 0 && deleteIndex != -1) {
            this.handleStateDelete(ctrl, deleteIndex);
        }

        // 🔧 更新状态枚举列表
        this.updateStateEnumList(ctrl);
    }

    /** 🔧 新增：处理状态顺序变更（上移/下移） */
    public updateStateMove(ctrl: StateControllerV2, moveInfo: { fromIndex: number, toIndex: number }) {
        if (!CC_EDITOR) {
            return;
        }

        if (!ctrl || ctrl.ctrlId !== this.currCtrlId) {
            return;
        }

        if (!moveInfo || moveInfo.fromIndex === undefined || moveInfo.toIndex === undefined) {
            StateErrorManager.warn("状态移动信息无效", {
                component: "StateSelectV2",
                method: "updateStateMove",
                params: { moveInfo },
            });
            return;
        }

        const { fromIndex, toIndex } = moveInfo;
        if (fromIndex === toIndex) {
            return;
        }

        if (fromIndex < 0 || toIndex < 0 || fromIndex >= ctrl.states.length || toIndex >= ctrl.states.length) {
            StateErrorManager.warn("状态移动索引越界，取消同步", {
                component: "StateSelectV2",
                method: "updateStateMove",
                params: { fromIndex, toIndex, stateCount: ctrl.states.length },
            });
            return;
        }

        // state data is keyed by stable stateId; reorder only changes display order.
        this.updateChangedProp();

        StateErrorManager.info("状态数据顺序已同步", {
            component: "StateSelectV2",
            method: "updateStateMove",
            params: { fromIndex, toIndex, stateCount: ctrl.states.length },
        });
    }

    /**
     * 状态复制 (EnumUpdateType.Copy 触发)
     *
     * 契约: 在 pageData 中, 把 fromIndex 槽位的 prop 数据深拷贝到 toIndex 槽位;
     * 若 toIndex 槽位以及之后已有数据 (常见 toIndex = fromIndex+1, 中间插入), 先把
     * pageData[toIndex .. statesLength-2] 整体右移一格, 再把 fromIndex 的深拷贝写入 toIndex。
     * statesLength 是 *新* states 长度 (含刚插入的 copy state)。
     *
     * #C5: 用 deepClonePropData 逐 key 走 cloneValueByType 深拷 (按 cocosType 分发), 保活
     * cc.Color/Vec3/Vec2/Size/Quat 类实例 —— propData 值在 X 方案下是**活 cc 实例**(cloneValueByType
     * 写入), 旧的 JSON.parse(JSON.stringify) 会降级成普通对象导致 apply 时类型退化。
     */
    public updateStateCopy(ctrl: StateControllerV2, copyInfo: { fromIndex: number, toIndex: number }) {
        if (!CC_EDITOR) {
            return;
        }

        if (!ctrl) {
            return;
        }

        if (!copyInfo || copyInfo.fromIndex === undefined || copyInfo.toIndex === undefined) {
            StateErrorManager.warn("状态复制信息无效", {
                component: "StateSelectV2",
                method: "updateStateCopy",
                params: { copyInfo },
            });
            return;
        }

        const { fromIndex, toIndex } = copyInfo;
        const statesLength = ctrl.states.length;

        if (fromIndex < 0 || toIndex < 0 || fromIndex >= statesLength || toIndex >= statesLength) {
            StateErrorManager.warn("状态复制索引越界, 取消同步", {
                component: "StateSelectV2",
                method: "updateStateCopy",
                params: { fromIndex, toIndex, statesLength },
            });
            return;
        }

        const pageData = this.getPageData(ctrl.ctrlId);
        if (!pageData) {
            return;
        }

        const fromStateId = this.getStateIdByIndex(ctrl, fromIndex);
        const toStateId = this.getStateIdByIndex(ctrl, toIndex);
        if (fromStateId < 0 || toStateId < 0) return;

        // 深拷贝 source stateId 槽位到 target stateId (#C5: 逐 key cloneValueByType, 保活 cc 实例)
        const source = pageData[fromStateId];
        if (source != void 0) {
            pageData[toStateId] = this.deepClonePropData(source);
        }
        else {
            delete pageData[toStateId];
        }

        this.updateChangedProp();

        StateErrorManager.info("状态数据已深拷贝", {
            component: "StateSelectV2",
            method: "updateStateCopy",
            params: { fromIndex, toIndex, statesLength },
        });
    }

    // #region 专项A-2: 单节点各 state 值 局部操作 (swap/copy/move)
    /**
     * 专项A-2: 校验两个 state 槽位 index 合法 (0..states.length-1).
     * 单节点局部值操作的公共前置: 入参越界则拒绝, 不破坏数据.
     */
    private validateStateValueOp(stateA: number, stateB: number, ctrlId?: number): TPage | null {
        if (!CC_EDITOR) return null;
        const ctrl = ctrlId != void 0 ? this._ctrlsMap[ctrlId] : this.getCurrCtrl();
        if (!ctrl || !ctrl.states) {
            StateErrorManager.warn("局部值操作: 控制器无效", { component: "StateSelectV2", method: "validateStateValueOp", params: { ctrlId } });
            return null;
        }
        const len = ctrl.states.length;
        if (stateA < 0 || stateB < 0 || stateA >= len || stateB >= len
          || !Number.isInteger(stateA) || !Number.isInteger(stateB)) {
            StateErrorManager.warn("局部值操作: state 索引越界", {
                component: "StateSelectV2",
                method: "validateStateValueOp",
                params: { stateA, stateB, stateCount: len },
            });
            return null;
        }
        return this.getPageData(ctrl.ctrlId);
    }

    /**
     * 专项A-2: 交换单节点两个 state 的值数据 (节点级局部操作).
     * 只动 _ctrlData[ctrlId][stateA] ↔ [stateB] 的 propData, 不碰 selectedIndex、
     * 不影响其他节点的 _ctrlData、不增删 state 数量结构. 如 swap A1↔B1.
     */
    public swapStateValues(stateA: number, stateB: number, ctrlId?: number): boolean {
        const pageData = this.validateStateValueOp(stateA, stateB, ctrlId);
        if (!pageData) return false;
        if (stateA === stateB) return true;
        const ctrl = ctrlId != void 0 ? this._ctrlsMap[ctrlId] : this.getCurrCtrl();
        const keyA = this.getStateIdByIndex(ctrl, stateA);
        const keyB = this.getStateIdByIndex(ctrl, stateB);
        if (keyA < 0 || keyB < 0) return false;
        const a = pageData[keyA];
        const b = pageData[keyB];
        if (b !== void 0) pageData[keyA] = b;
        else delete pageData[keyA];
        if (a !== void 0) pageData[keyB] = a;
        else delete pageData[keyB];
        this.updateChangedProp();
        this.reapplyCurrentStateIfAffected([stateA, stateB]);
        return true;
    }

    /** #S8: 局部值操作若涉及当前激活 state, 重新把该 state apply 到节点 (否则 inspector/节点显示脱节). */
    private reapplyCurrentStateIfAffected(affected: number[]): void {
        const ctrl = this.getCurrCtrl();
        if (ctrl && affected.indexOf(ctrl.selectedIndex) >= 0) {
            this.updateState(ctrl);
        }
    }

    /**
     * 专项A-2: 复制单节点某 state 的值数据到另一 state (深拷, 节点级局部操作).
     * fromState→toState 深拷覆盖, 源保持不变且与目标独立; 源为空则清空目标. 如 copy A1→B1.
     */
    public copyStateValues(fromState: number, toState: number, ctrlId?: number): boolean {
        const pageData = this.validateStateValueOp(fromState, toState, ctrlId);
        if (!pageData) return false;
        if (fromState === toState) return true;
        const ctrl = ctrlId != void 0 ? this._ctrlsMap[ctrlId] : this.getCurrCtrl();
        const fromKey = this.getStateIdByIndex(ctrl, fromState);
        const toKey = this.getStateIdByIndex(ctrl, toState);
        if (fromKey < 0 || toKey < 0) return false;
        const source = pageData[fromKey];
        if (source !== void 0) {
            // #C5: 逐 key cloneValueByType 深拷, 保活 cc 类实例 (propData 存活 cc.Color/Vec3 等, 同 updateStateCopy).
            pageData[toKey] = this.deepClonePropData(source);
        }
        else {
            delete pageData[toKey];
        }
        this.updateChangedProp();
        this.reapplyCurrentStateIfAffected([toState]);
        return true;
    }

    // #endregion

    /** 🔧 新增：处理状态删除逻辑 */
    private handleStateDelete(ctrl: StateControllerV2, deleteIndex: number) {
        StateErrorManager.debug("开始处理状态删除", {
            component: "StateSelectV2",
            method: "handleStateDelete",
            params: { deleteIndex: deleteIndex, ctrlId: ctrl.ctrlId },
        });

        // deleteIndex 是被删 state 的 *旧* index。
        // ctrl.states.length 在 setter 触发 SelPage 通知时已经 -1。
        // 所以当删除末尾 state 时, deleteIndex == ctrl.states.length 是合法的;
        // 之前用 `>= ctrl.states.length` 的判断把这种情况当成 "无效", 导致 migrateStateData
        // 错过末尾槽位的 delete pageData[deleteIndex] (B3 数据残留 bug)。
        if (deleteIndex < 0) {
            StateErrorManager.warn("删除索引为负", {
                component: "StateSelectV2",
                method: "handleStateDelete",
                params: { deleteIndex: deleteIndex, stateCount: ctrl.states.length },
            });
            return;
        }

        // state data is keyed by stable stateId. Removing a state from active list is soft-delete:
        // keep its prop data so restore/re-add by stateId brings the exact values back.
        this.updateChangedProp();

        StateErrorManager.info("状态删除处理完成", {
            component: "StateSelectV2",
            method: "handleStateDelete",
            params: { deletedIndex: deleteIndex, remainingStates: ctrl.states.length, softDelete: true },
        });
    }

    /** 🔧 新增：迁移状态数据 */
    private migrateStateData(pageData: TPage, deleteIndex: number, statesLength: number) {
        // 🔧 将删除位置后面的状态数据前移
        for (let state = deleteIndex; state < statesLength; state++) {
            const nextStateData = pageData[state + 1];
            if (nextStateData != void 0) {
                pageData[state] = nextStateData;
            }
            else {
                // 🔧 如果没有下一个状态数据，删除当前位置的数据
                delete pageData[state];
            }
        }

        // 🔧 删除最后一个状态的数据（因为状态数量减少了1）
        delete pageData[statesLength];
    }

    /** 🔧 新增：清理被删除状态的属性 */
    private cleanupDeletedStateProps(pageData: TPage, ctrl: StateControllerV2, deletedStateData: TProp | undefined) {
        if (!deletedStateData || typeof deletedStateData !== "object") {
            return;
        }
        const defaultData = pageData.$$default$$;
        if (!defaultData) {
            this.updateChangedProp();
            return;
        }

        // 🔧 遗留 number key (老 .fire 兜底): 其他 state 都没有 → 从 default GC
        const numKeys = this.extractNumericPropKeys(deletedStateData);
        for (const prop of numKeys) {
            if (!this.isOtherHans(ctrl, prop) && defaultData[prop] != void 0) {
                delete defaultData[prop];
            }
        }

        // #C4: string propRef key (X 方案主路径): 同样 GC default 孤儿
        const refKeys = this.extractPropRefKeys(deletedStateData);
        for (const propRef of refKeys) {
            if (!this.isOtherHansByPropRef(ctrl, propRef)) {
                if ((defaultData as any)[propRef] != void 0) delete (defaultData as any)[propRef];
                // #V6: 同步清 default 的 $$controlledProps$$ flag, 否则 GC 了值却留受控标记(元桶泄漏)
                const ddCp = (defaultData as any).$$controlledProps$$;
                if (ddCp && ddCp[propRef] !== undefined) delete ddCp[propRef];
            }
        }

        // 🔧 更新已更改属性的显示
        this.updateChangedProp();
    }

    /** #C4: isOtherHans 的 string propRef 版本 — 某 propRef 是否仍存在于任一剩余 state. */
    private isOtherHansByPropRef(ctrl: StateControllerV2, propRef: string): boolean {
        const pageData = this.getPageData();
        for (let i = 0, len = ctrl.states.length; i < len; i++) {
            const stateId = this.getStateIdByIndex(ctrl, i);
            if (stateId < 0) continue;
            const propData = pageData[stateId];
            if (propData && (propData as any)[propRef] != void 0) {
                return true;
            }
        }
        return false;
    }

    /** 🔧 新增：重排状态数据，保持属性与状态顺序一致 */
    private reorderStateData(pageData: TPage, fromIndex: number, toIndex: number, statesLength: number) {
        // 将状态数据视为数组进行移动，保留 $$ 开头的元数据
        const dataArray: Array<TProp | undefined> = [];
        for (let i = 0; i < statesLength; i++) {
            dataArray[i] = pageData[i];
        }

        const [moved] = dataArray.splice(fromIndex, 1);
        dataArray.splice(toIndex, 0, moved);

        // 回写数据，超出范围的清理掉
        for (let i = 0; i < statesLength; i++) {
            const stateData = dataArray[i];
            if (stateData !== undefined) {
                pageData[i] = stateData;
            }
            else {
                delete pageData[i];
            }
        }
    }

    /** 🔧 新增：更新状态枚举列表 */
    private updateStateEnumList(ctrl: StateControllerV2) {
        if (!ctrl || !ctrl.states) {
            StateErrorManager.warn("控制器或状态数据无效", {
                component: "StateSelectV2",
                method: "updateStateEnumList",
            });
            return;
        }

        // 🔧 生成状态枚举数组
        const enumList = ctrl.states.map((state, index) => {
            if (!state || typeof state.name !== "string") {
                StateErrorManager.warn("状态数据无效", {
                    component: "StateSelectV2",
                    method: "updateStateEnumList",
                    params: { stateIndex: index },
                });
                return { name: `状态${index}`, value: index };
            }
            return { name: state.name, value: index };
        });

        // 🔧 更新编辑器属性枚举列表
        try {
            // @ts-expect-error cc.Class.Attr.setClassAttr is not typed
            cc.Class.Attr.setClassAttr(this, "ctrlState", "enumList", enumList);
        }
        catch (error) {
            StateErrorManager.warn("更新状态枚举列表失败", {
                component: "StateSelectV2",
                method: "updateStateEnumList",
                params: { error: error.message },
            });
        }
    }

    /** 控制器被删除 */
    public updateDelete(ctrl: StateControllerV2) {
        if (!CC_EDITOR) {
            return;
        }
        delete this._ctrlData[ctrl.ctrlId];
        if (this.currCtrlId == ctrl.ctrlId) {
            // @ts-expect-error _onPreDestroy is not typed
            this._onPreDestroy();
        }
        else {
            setTimeout(() => {
                this.updateCtrlName(ctrl.node);
            });
        }
    }

    /**
     * 回收站硬删: 清掉指定 stateId 在本 select 上的页数据 (_ctrlData[ctrlId][stateId]).
     * 仅删该 state 页, 不碰 $$default$$ 与其它 state。由 StateControllerV2.purgeDeletedState
     * 经 EnumUpdateType.PurgeStateId 广播触发, 不可恢复。
     */
    public purgeStateData(ctrl: StateControllerV2, stateId: number): void {
        if (!CC_EDITOR) {
            return;
        }
        if (!ctrl || typeof stateId !== "number") {
            return;
        }
        const pageData = this._ctrlData && this._ctrlData[ctrl.ctrlId];
        if (!pageData) {
            return;
        }
        if ((pageData as any)[stateId] !== undefined) {
            delete (pageData as any)[stateId];
            StateErrorManager.info("已清除 state 页数据 (回收站硬删)", {
                component: "StateSelectV2",
                method: "purgeStateData",
                params: { ctrlId: ctrl.ctrlId, stateId },
            });
        }
    }

    /** 已经改变的属性 */
    public updateChangedProp() {
        const propdata = this.getPropData();
        const arr: string[] = [];
        const changedProps = propdata.$$changedProp$$;
        if (changedProps) {
            for (const name of Object.keys(changedProps)) {
                arr.push(name);
            }
        }
        this.changedProp = arr;
    }

    /** 提取数值型属性键（排除元数据） */
    private extractNumericPropKeys(data: TProp): number[] {
        return Object.keys(data)
            .filter(key => !key.startsWith("$$"))
            .map(key => Number(key))
            .filter(key => !Number.isNaN(key));
    }

    /**
     * 提取 propData 中**仅遗留 number key** 对应的 EnumPropName.
     *
     * T2 双轨统一 (X方案): 内置 prop 已收敛到 propRef 字符串单一路径 (与自定义对称),
     * 由 applyPropRefKeysToNode 统一 apply (带 userExcl/sysExcl 排除过滤). 故本方法**不再**
     * 把 string propRef key 反查桥回 ENUM/batchUpdateUI 路径 —— 那条桥曾导致:
     *   - F-6: ENUM 路径无排除过滤, 排除的内置仍被 batchUpdateUI 写回;
     *   - F-9: 内置同时被 batchUpdateUI(ENUM) + applyPropRefKeysToNode(propRef) 双写.
     * 现仅返回 number key (尚未被 migrateLegacyCtrlData 迁走的老 .fire 数据兜底),
     * 迁移后正常数据无 number key, 本方法通常返回空, 内置全部走 propRef apply 单轨.
     */
    private extractEnumPropTypes(data: TProp): EnumPropName[] {
        const seen = new Set<number>();
        const out: EnumPropName[] = [];
        if (!data) return out;
        for (const key of Object.keys(data)) {
            if (key.startsWith("$$")) continue;
            if (/^\d+$/.test(key)) {
                const num = Number(key);
                if (Number.isFinite(num) && !seen.has(num)) {
                    seen.add(num);
                    out.push(num as EnumPropName);
                }
            }
            // string propRef key 不再桥回 ENUM —— 由 applyPropRefKeysToNode 统一 apply (T2 收敛单轨)
        }
        return out;
    }

    // #endregion 4.

    // #region 5. 属性同步与应用 (state 切换 → node/component apply)

    /** 确保节点在隐藏的时候也会执行__preload（负责stateSelect的显示） */
    public updatePreLoad(ctrl: StateControllerV2) {
        if (!ctrl || ctrl.ctrlId != this.currCtrlId) {
            return;
        }
        this.__preload();
    }

    /** 更新属性 */
    public updateProp(ctrl: StateControllerV2) {
        if (!ctrl || ctrl.ctrlId != this.currCtrlId) {
            return;
        }
        this.refProp();
    }

    // ==============更具控制器更新的状态 主要代码================
    // Wave 2 T11: _isFromCtrl 标记位删除 (原本用于 setDefaultProp 期间抑制循环写;
    // setDefaultProp 已随 cc 事件 hook 一起退役, 标记位不再有意义)。
    /** 更新状态 */
    public updateState(ctrl: StateControllerV2) {
        if (!ctrl) {
            StateErrorManager.warn("updateState: 控制器为空", {
                component: "StateSelectV2",
                method: "updateState",
            });
            return;
        }
        // #U8: 节点失效(销毁/null, 如场景切换/动态清理) → 整体优雅早退, 不继续 batchUpdateUI +
        // applyPropRefKeysToNode 在死节点上写值刷大量 "写值失败" 警告。
        if (!this.node || !this.node.isValid) {
            return;
        }

        StateErrorManager.debug("开始状态更新", {
            component: "StateSelectV2",
            method: "updateState",
            params: {
                ctrlId: ctrl.ctrlId,
                selectedIndex: ctrl.selectedIndex,
                currentPropKey: EnumPropName[this.propKey],
            },
        });

        // 🔧 第一步：保存当前属性选择状态
        const currentPropKey = this.propKey;
        const isAutoSync = this.autoSyncEnabled;
        const shouldKeepPropKey = isAutoSync && currentPropKey !== EnumPropName.Non;

        // 🔧 第二步：获取状态数据
        const propData = this.getPropData(ctrl.selectedIndex, ctrl.ctrlId);
        const defaultData = this.getDefaultData(ctrl.ctrlId);

        // 🔧 第三/四步：构建属性批次 + 批量应用 (抽到 applyDataToNode, 与回收站预览共用单一 apply 路径)
        this.applyDataToNode(propData, defaultData);

        // 🔧 第五步：根据同步模式恢复属性选择
        if (shouldKeepPropKey) {
            // 自动同步模式：保持当前选中的属性 (Track1: 仅刷新显示, 抑制回写/物化)
            this._suppressPropCapture = true;
            this.propKey = currentPropKey;
            this._suppressPropCapture = false;
            StateErrorManager.debug("保持当前属性选择", {
                component: "StateSelectV2",
                method: "updateState",
                params: { keptPropKey: EnumPropName[currentPropKey] },
            });
        }
        else {
            // 其他模式：使用新状态的lastProp
            this.refProp();
            StateErrorManager.debug("使用状态lastProp", {
                component: "StateSelectV2",
                method: "updateState",
            });
        }

        StateErrorManager.info("状态更新完成", {
            component: "StateSelectV2",
            method: "updateState",
            params: {
                targetState: ctrl.selectedIndex,
                finalPropKey: EnumPropName[this._propKey],
            },
        });
    }

    /**
     * 显式提交当前节点上某 prop 的值到当前 state 的 ctrlData (Wave 2 替代 setDefaultProp).
     *
     * 用途: 测试 / 工具 / panel 手动调用 "把节点当前 prop 值持久化到 state".
     * 与录制路径关系: 录制路径走 snapshot+diff, 这里是直接 commit, 不依赖 snapshot。
     * 仅当 prop 被 $$controlledProps$$ 标记为受控时才写入, 与原 setDefaultProp 行为一致。
     */
    public commitPropFromNode(type: EnumPropName): void {
        if (!CC_EDITOR) return;
        if (type === EnumPropName.Non) return;
        const propData = this.getPropData();
        // 仅 controlled props 接受 commit。聚合根治: AMBIGUOUS 走子项独立, 受控判定按"任一子项受控"
        // (decompose 后 controlledProps 记子项 x/y/z, 聚合 key 不存在 → 不能用 readPropByEnum(聚合)判)。
        const cr = enumToPropRef(type);
        const crSubs = (cr !== undefined && isAmbiguousAggregatePropRef(cr))
            ? this.getControllableAmbiguousSubRefs(cr)
            : [];
        const controlled = crSubs.length > 0
            ? crSubs.some(s => this.isPropertyControlledByPropRef(s))
            : (this.readPropByEnum(propData, type) !== undefined); // 非聚合 / euler 走聚合 key 判
        if (!controlled) return;
        const value = PropHandlerManager.getValue(type, this.node);
        if (value === undefined) return;
        // writePropByEnum 对 AMBIGUOUS 自动拆子项写入 propData[x/y/z] (聚合 key 也写但 apply 被 #C6 门控跳过)
        this.writePropByEnum(propData, type, value);
        if (type === this.propKey) {
            this._propValue = value;
        }
    }

    /**
     * @deprecated Wave 2 重构: setDefaultProp 已迁移到 commitPropFromNode.
     * 兼容性 shim, 现有测试仍可调用; 等价于 commitPropFromNode(type)。
     */
    public setDefaultProp(type: EnumPropName): void {
        this.commitPropFromNode(type);
    }

    // ================== Wave 2: 录制 prefab diff 路径 ==================

    /**
     * 收集节点上当前所有受控 prop 的"实际"值, 作为 snapshot 基础。
     *
     * 数据来源: PropHandlerManager.getValue(node) (返回 clone, 不会被外部 mutate)。
     * 过滤器: 仅 $$controlledProps$$ 中标记为 controlled 的 prop 才进 snapshot,
     *         即只 diff 用户显式开启控制的 prop。
     */
    private readControlledPropsFromNode(ctrl: StateControllerV2): TProp {
        const snap: TProp = {} as TProp;
        if (!ctrl) {
            return snap;
        }
        // Track1: 受控集从 ctrl 级 default 读 (compact 后 state 不再内联 controlledProps).
        const controlledProps = this.getControlledPropsMap(ctrl.ctrlId);
        // W6-2a: 双 key 共存. 内置 prop key 是 EnumPropName name string (e.g. "Active"), value 是数字;
        // 自定义 prop key 和 value 都是 propRef 字符串 (togglePropertyControlByPropRef 写入).
        // 先用 typeof value 区分: 数字 → 老 PropHandlerManager.getValue; 字符串 → propRef 路径.
        for (const propName in controlledProps) {
            const ctrlVal = controlledProps[propName];
            if (typeof ctrlVal === "number") {
                // 老路径: number key snapshot
                const value = PropHandlerManager.getValue(ctrlVal as EnumPropName, this.node);
                if (value !== undefined) {
                    (snap as TPropDictionary)[ctrlVal] = value;
                }
            }
            else if (typeof ctrlVal === "string") {
                // 新路径: propRef string key snapshot. 用 cocos type 分发深拷.
                const tp = this.resolveTrackableProp(ctrlVal);
                const current = this.readNodeValueByPropRef(ctrlVal);
                if (current !== undefined) {
                    (snap as any)[ctrlVal] = cloneValueByType(current, tp ? tp.cocosType : undefined);
                }
            }
        }
        return snap;
    }

    /**
     * 撤销录制时, 把 _initialSnapshot (录制开始时拍的不可变副本) 写回 ctrlData[fromState],
     * 让 ctrlData 回到录制开始前的状态.
     *
     * 不调 applyPropDataToNode / setValue: StateControllerV2 在调用本方法后会触发 updateState(State),
     * StateSelectV2.updateState 会把回滚后的 propData 重新应用到节点.
     *
     * 设计要点: 用 _initialSnapshot 而不是 _snapshot. _snapshot 在 commitRecordingDiff 中会被刷新
     * 成节点新值 (作为下一段 diff 起点), 不再代表"录制开始时的原值"; _initialSnapshot 拍完不变.
     *
     * TASK-002 cancelRecording 路径专用. 调完清 _initialSnapshot / _snapshot / _fullSnapshot.
     */
    public applyRecordingSnapshot(ctrl: StateControllerV2, fromState: number): void {
        if (!CC_EDITOR) return;
        if (!ctrl || ctrl.ctrlId !== this.currCtrlId) return;
        // 被排除 prop 走独立节点快照还原 (ctrlData 回滚那条路够不到, 因为它们不进状态数据).
        // 放最前: 即使下面因没拍 controlled snapshot 早退, 被排除 prop 也要还原.
        this.restoreExcludedSnapshotToNode();
        if (this._initialSnapshot == null) {
            // 录制开始时没拍 snapshot (e.g. 控制器关联尚未建立), 直接清场, no-op 回滚
            this._snapshot = null;
            this._fullSnapshot = null;
            return;
        }
        const propData = this.getPropData(fromState, ctrl.ctrlId);
        if (propData) {
            const snap = this._initialSnapshot as any;
            // #F-A 修 (TASK-003) + T2 双轨统一: snapshot 双 key 共存 — number key (遗留) 与
            // string propRef key (readControlledPropsFromNode 对 typeof==string 的受控 prop 所存,
            // T2 后内置+自定义都走这条). 原实现只 Number(key) 回滚, string key 被跳过 →
            // 撤销录制对 string propRef 不回滚 (内置经 T2 后也中招, 见 Recording.cancel). 两类都回滚:
            const origKeys = this._initialPropDataKeys;
            for (const key of Object.keys(snap)) {
                const num = Number(key);
                const isNum = Number.isFinite(num) && !Number.isNaN(num);
                const propRef = isNum ? enumToPropRef(num as EnumPropName) : key;
                // #S3: 录制前 propData 本就有此 key → 回滚原值; 录制前依赖 default(不在 origKeys)→ 删除
                // 录制中可能写入的硬编码, 保持动态 default 兜底。无 origKeys 记录(老路径)→ 退回全回滚。
                const wasPresent = origKeys
                    ? (origKeys.has(key) || (propRef !== undefined && origKeys.has(propRef)))
                    : true;
                if (!wasPresent) {
                    if (propRef !== undefined) delete (propData as any)[propRef];
                    if (isNum) delete (propData as any)[num];
                    continue;
                }
                if (isNum) {
                    // number key (遗留): writePropByEnum 切回 string propRef key 写入
                    if (num === EnumPropName.Non) continue;
                    this.writePropByEnum(propData, num as EnumPropName, snap[key]);
                }
                else {
                    // string propRef key: 直写顶层 propData[propRef] (cocosType-aware clone)
                    const tp = this.resolveTrackableProp(propRef as string);
                    (propData as any)[propRef as string] = cloneValueByType(snap[propRef as string], tp ? tp.cocosType : undefined);
                }
            }
        }
        this._snapshot = null;
        this._initialSnapshot = null;
        this._initialPropDataKeys = null;
        this._fullSnapshot = null;
        StateErrorManager.debug("撤销录制: snapshot 回滚到 ctrlData", {
            component: "StateSelectV2",
            method: "applyRecordingSnapshot",
            params: { fromState, ctrlId: ctrl.ctrlId },
        });
    }

    /**
     * 把 _excludedSnapshot (录制开始时被排除 prop 的节点值) 写回节点, 然后清空.
     *
     * 停止(stop)与取消(cancel)收尾都调: 被排除 prop 不进 ctrlData, updateState(State) 又会跳过被排除
     * prop (applyPropRefKeysToNode 过滤), 所以这里直接写节点的还原不会被后续 updateState 覆盖.
     * 幂等, 无快照时安全 no-op.
     */
    private restoreExcludedSnapshotToNode(): void {
        const snap = this._excludedSnapshot;
        this._excludedSnapshot = null;
        if (!snap || !this.node) return;
        for (const propRef of Object.keys(snap)) {
            const tp = this.resolveTrackableProp(propRef);
            this.writeNodeValueByPropRef(propRef, cloneValueByType(snap[propRef], tp ? tp.cocosType : undefined));
        }
    }

    /**
     * 切 state 前 (录制中): commit diff 到 fromState.
     * 由 StateControllerV2.selectedIndex setter → updateState(StateWillChange, fromIdx) 派发。
     */
    public onStateWillChange(ctrl: StateControllerV2, fromState: number): void {
        if (!CC_EDITOR) return;
        if (!ctrl || ctrl.ctrlId !== this.currCtrlId) return;
        // 仅录制中才 diff commit
        if (!ctrl.isRecording) return;
        if (this._snapshot == null) return;
        this.commitRecordingDiff(ctrl, fromState);
    }

    /**
     * 切 state 后 (录制中): 重拍 snapshot, 作为新一段 diff 起点.
     * 由 StateControllerV2 在 updateState(State) 之后再发 (T08 wiring).
     */
    public onStateChanged(ctrl: StateControllerV2): void {
        if (!CC_EDITOR) return;
        if (!ctrl || ctrl.ctrlId !== this.currCtrlId) return;
        if (!ctrl.isRecording) return;
        this._snapshot = this.readControlledPropsFromNode(ctrl);
        StateErrorManager.debug("录制 snapshot 已重拍", {
            component: "StateSelectV2",
            method: "onStateChanged",
            params: { newState: ctrl.selectedIndex },
        });
    }

    /**
     * 录制开始: 拍双 snapshot.
     *   _snapshot: 仅 controlled prop, 供 commit 路径用
     *   _fullSnapshot: 所有 applicable prop, 供 stop 时检测未跟随 dirty 用
     * 由 StateControllerV2.startRecording -> updateState(RecordingStart) 派发。
     */
    public onRecordingStart(ctrl: StateControllerV2): void {
        if (!CC_EDITOR) return;
        if (!ctrl || ctrl.ctrlId !== this.currCtrlId) {
            return;
        }
        this._snapshot = this.readControlledPropsFromNode(ctrl);
        // TASK-002: 拍一份独立的不可变 snapshot 给 cancel 用 (_snapshot 在 commit 路径会被刷新)
        this._initialSnapshot = this.readControlledPropsFromNode(ctrl);
        this._fullSnapshot = this.readAllApplicablePropsFromNode();
        // 被排除 prop 单独拍纯节点值快照, 供 cancel 还原节点 (不进 ctrlData / _fullSnapshot).
        this._excludedSnapshot = this.readExcludedPropsFromNode();
        // #S3: 记录录制前 propData 本就存在的 key, cancel 时据此区分"回滚已有值" vs "删除依赖 default 的硬编码".
        const curPd = this.getPropData(ctrl.selectedIndex, ctrl.ctrlId);
        this._initialPropDataKeys = new Set(
            curPd ? Object.keys(curPd).filter(k => !k.startsWith("$$")) : [],
        );
        StateErrorManager.debug("录制双 snapshot 已拍", {
            component: "StateSelectV2",
            method: "onRecordingStart",
            params: {
                controlledKeys: Object.keys(this._snapshot).length,
                fullKeys: Object.keys(this._fullSnapshot).length,
            },
        });
    }

    /**
     * 录制结束: commit controlled diff + 区分 auto/manual 收尾.
     *   auto (ctrl.stopRecordingMode === "auto", 切 state 触发): 静默 commit, Editor.log 反馈
     *   manual (按钮触发): 检测未跟随 prop 是否被改, 弹窗问是否追加跟随
     * 由 StateControllerV2.stopRecording -> updateState(RecordingStop) 派发。
     */
    public onRecordingStop(ctrl: StateControllerV2): void {
        if (!CC_EDITOR) return;
        if (!ctrl || ctrl.ctrlId !== this.currCtrlId) {
            return;
        }
        const targetState = ctrl.selectedIndex;
        // final commit: diff controlled snapshot vs 当前节点, 写 ctrlData[targetState]
        const committed = this.commitRecordingDiff(ctrl, targetState);
        // 检测未跟随的 dirty (录制期间被改但没勾跟随的 applicable prop)
        const untracked = this.detectUntrackedDirty();

        const isAuto = (ctrl as any).stopRecordingMode === "auto";
        if (isAuto) {
            // 切 state 自动 stop — 静默反馈
            if (committed.length > 0) {
                const names = committed.map(p => EnumPropName[p]).join(", ");
                this.editorLog(`[StateSelectV2 "${this.node && this.node.name}"] 已保存 ${names} 到 state[${targetState}]`);
            }
            if (untracked.length > 0) {
                // W6-2a-fixup: untracked 是 union 数组 (EnumPropName | propRef string), 兼容显示
                const names = untracked.map(p => typeof p === "string" ? p : EnumPropName[p]).join(", ");
                this.editorWarn(`[StateSelectV2 "${this.node && this.node.name}"] 未跟随 prop ${names} 被改但已丢弃 (切 state 自动结束录制)`);
            }
        }
        else if (untracked.length > 0) {
            // 手动 stop 且有未跟随 dirty — 弹窗
            this.promptUntrackedAfterStop(ctrl, untracked);
        }

        // 用户裁定: 停止(保存)也把被排除 prop 还原到录制前 —— 排除 = 录制期间完全不影响该属性,
        // 不管最终是保存(stop)还是丢弃(cancel). 已跟随 prop 的改后值由上面 commitRecordingDiff 正常提交,
        // 不受影响. (restore 内含清快照.)
        this.restoreExcludedSnapshotToNode();
        this._snapshot = null;
        this._fullSnapshot = null;
        // TASK-002: 同步清初始 snapshot
        this._initialSnapshot = null;
        this._initialPropDataKeys = null;
        StateErrorManager.debug("录制 snapshot 已清", {
            component: "StateSelectV2",
            method: "onRecordingStop",
            params: { auto: isAuto, committed: committed.length, untracked: untracked.length },
        });
    }

    /**
     * 给 StateControllerV2.startRecording 用: 扫本 StateSelectV2 的 controlled prop,
     * 节点当前值 vs ctrlData[ctrl.selectedIndex] 不一致 = dirty.
     * 返回 [{ propType?, propRef?, current, stored }, ...]. 由 ctrl 端聚合后弹窗.
     *
     * W6-2a-fixup: schema 升级 - 双 key 双分支.
     *   $$controlledProps$$ value 规则 (按 typeof 区分, 与 readControlledPropsFromNode 一致):
     *     - number → 内置 prop (value 是 EnumPropName 数字), 走老 PropHandlerManager 路径.
     *       返回 {propType: EnumPropName, current, stored} (propRef undefined).
     *     - string → 自定义 prop (value 是 propRef 字符串自指), 走 readPropFromNodeByPropRef.
     *       返回 {propRef: string, current, stored} (propType undefined).
     */
    public collectDirtyControlled(ctrl: StateControllerV2): Array<{ propType?: EnumPropName, propRef?: string, current: unknown, stored: unknown }> {
        const out: Array<{ propType?: EnumPropName, propRef?: string, current: unknown, stored: unknown }> = [];
        if (!ctrl || ctrl.ctrlId !== this.currCtrlId) return out;
        if (!this.node) return out;
        const propData = this.getPropData(ctrl.selectedIndex, ctrl.ctrlId);
        const defaultData = this.getDefaultData(ctrl.ctrlId);
        // Track1: 受控集从 ctrl 级 default 读; stored 值 state→default 兜底 (compact 后等于 default 的
        // 属性不再内联 state, 旧 fat 数据每个 state 都存 baseline, 兜底后两种格式 dirty 判定一致).
        const controlledProps = this.getControlledPropsMap(ctrl.ctrlId);
        for (const propName in controlledProps) {
            const ctrlVal = controlledProps[propName];
            if (typeof ctrlVal === "number") {
                // 老路径: 内置 EnumPropName 数字
                const propType = ctrlVal as EnumPropName;
                if (propType === EnumPropName.Non) continue;
                const current = PropHandlerManager.getValue(propType, this.node);
                if (current === undefined) continue;
                // W6-2c2: 双 key 读; state 无值则回落 default baseline
                let stored = this.readPropByEnum(propData, propType);
                if (stored === undefined) stored = this.readPropByEnum(defaultData, propType);
                if (stored === undefined) continue; // 已勾跟随但 ctrlData 还没值: 不算 dirty, 不弹
                if (!PropHandlerManager.isEqual(propType, stored, current)) {
                    out.push({ propType, current, stored });
                }
            }
            else if (typeof ctrlVal === "string") {
                // W6-2a-fixup 新路径: 自定义 propRef 字符串
                const propRef = ctrlVal;
                const current = this.readPropFromNodeByPropRef(propRef);
                if (current === undefined) continue;
                let stored = (propData as any)[propRef];
                if (stored === undefined) stored = (defaultData as any)[propRef];
                if (stored === undefined) continue;
                const tp = this.resolveTrackableProp(propRef);
                const cocosType = tp ? tp.cocosType : undefined;
                if (!eqValueByType(stored, current, cocosType)) {
                    out.push({ propRef, current, stored });
                }
            }
        }
        return out;
    }

    /**
     * 扫节点上所有 applicable prop, 含未勾选跟随的, 供录制期间"未跟随 dirty"检测.
     *
     * W6-axis-decomp X 方案: 单走 listTrackableProps + readPropFromNodeByPropRef (propRef 字符串 key 单一路径).
     * 老 PropHandlerManager.listRegisteredPropTypes (数字 key) 路径已废 — 全 cocos 内省, AMBIGUOUS
     * 整体 propRef ('cc.Node.position'/'.anchorPoint'/'.contentSize') 不进 snapshot, 其子项 cc.Node.x/y/z
     * 等已在 listTrackableProps 内独立返回.
     *
     * 过滤 (与 autoOptInCustomComponentProps 对齐):
     *   - state machine 自身 component (CONTROLLER_SYSTEM_COMPS) 跳过
     *   - AMBIGUOUS 整体 propRef 跳过 (子项独立)
     *   - readonly 字段无法 setValue, 不进 dirty detect 范围
     *
     * _fullSnapshot 内层 key 类型全部 string propRef (内置 + 自定义统一).
     */
    private readAllApplicablePropsFromNode(): TProp {
        const out: TProp = {} as TProp;
        if (!this.node) return out;
        let trackable: TrackableProp[] = [];
        try {
            trackable = listTrackableProps(this.node);
        }
        catch (_) { /* listTrackableProps 失败时返回空 snapshot — 录制 dirty detect 降级 */ }
        const systemComps = new Set(StateSelectV2.CONTROLLER_SYSTEM_COMPS);
        // W6: 用户排除清单的 prop 不进 _fullSnapshot — 排除 = 彻底脱离录制范围.
        // 否则录制期间误改被排除的 prop, detectUntrackedDirty 会当"未跟随 dirty"弹窗回写, 违背排除语义.
        // (SYSTEM_EXCLUDE 已在 listTrackableProps 内部过滤, 这里只补用户黑名单.)
        const userExcluded = new Set(this._userExcludedProps || []);
        for (const tp of trackable) {
            if (systemComps.has(tp.compName)) continue;
            if (isAmbiguousAggregatePropRef(tp.propRef)) continue;
            if (tp.readonly) continue;
            if (userExcluded.has(tp.propRef)) continue;
            const cur = this.readPropFromNodeByPropRef(tp.propRef);
            if (cur === undefined) continue;
            (out as any)[tp.propRef] = cloneValueByType(cur, tp.cocosType);
        }
        return out;
    }

    /**
     * 读用户排除清单里每个 prop 的当前节点值 (propRef → value), 供 cancel 还原节点用.
     *
     * 与 _fullSnapshot 互补: _fullSnapshot 故意**不含**被排除 prop (不变量#8), 这里**只含**被排除 prop.
     * 仅取 _userExcludedProps (用户主动排除的); SYSTEM_EXCLUDE 是引擎内部 plumbing, 用户不感知也不该回写.
     * cocosType 用 resolveTrackableProp 反查 (失败则 undefined, cloneValueByType 退化为浅拷, 对 number 无碍).
     */
    private readExcludedPropsFromNode(): { [propRef: string]: any } {
        const out: { [propRef: string]: any } = {};
        if (!this.node) return out;
        for (const propRef of this._userExcludedProps || []) {
            const cur = this.readPropFromNodeByPropRef(propRef);
            if (cur === undefined) continue;
            const tp = this.resolveTrackableProp(propRef);
            out[propRef] = cloneValueByType(cur, tp ? tp.cocosType : undefined);
        }
        return out;
    }

    /**
     * 录制期间, 哪些 applicable prop 被改了**但没勾选跟随**.
     * 用 _fullSnapshot (start 时全 prop 快照) vs 当前节点 diff, 减去 controlled 部分.
     *
     * W6-axis-decomp X 方案: _fullSnapshot 内层全部 string propRef key (readAllApplicablePropsFromNode
     * 单走 propRef 路径), 不再有数字 key. 单一遍历分支.
     *
     * 返回 string[] — 都是 propRef 字符串. 历史调用方 (Recording.modelZ 等) 仍可用 EnumPropName
     * 反查名字 'cc.Node.color' 等比较.
     */
    private detectUntrackedDirty(): Array<EnumPropName | string> {
        const out: Array<EnumPropName | string> = [];
        if (!this._fullSnapshot) return out;
        // #T4: 被排除(用户+系统)的 prop 不算"未跟随 dirty" —— 排除即"故意不进录制范围"(不变量#8),
        // 否则录制中途 setPropExcluded 的 prop 会被当 untracked → promptUntrackedAfterStop 提交 → 违反排除边界。
        const userExcl = new Set(this._userExcludedProps || []);
        const sysExcl = new Set(SYSTEM_EXCLUDE);
        for (const k of Object.keys(this._fullSnapshot)) {
            const propRef = k;
            if (userExcl.has(propRef) || sysExcl.has(propRef)) continue; // #T4: 排除项跳过
            if (this.isPropertyControlled(propRef)) continue; // 已跟随 — commit 路径已处理
            const before = (this._fullSnapshot as any)[propRef];
            const current = this.readPropFromNodeByPropRef(propRef);
            if (current === undefined) continue;
            const tp = this.resolveTrackableProp(propRef);
            const cocosType = tp ? tp.cocosType : undefined;
            if (!eqValueByType(before, current, cocosType)) {
                out.push(propRef);
            }
        }
        return out;
    }

    /**
     * 手动 stopRecording + 有未跟随 dirty 时弹窗: 是否把这些 prop 自动加入跟随并保存当前值.
     * Editor.Dialog 异步, 用户点完才操作. 此时录制已停, 数据切 fromState 已 commit, 不冲突.
     *
     * W6-2a-fixup: untracked 是 union 数组 (EnumPropName 数字 | propRef 字符串). 内置走老
     * togglePropertyControl(EnumPropName) + writePropByEnum; 自定义走 togglePropertyControl(propRef)
     * (W6-2b 联合 API) + 直写 propData[propRef].
     */
    private promptUntrackedAfterStop(ctrl: StateControllerV2, untracked: Array<EnumPropName | string>): void {
        const names = untracked.map(p => typeof p === "string" ? p : EnumPropName[p]);
        const message = `录制期间这些 prop 被改了, 但未勾选跟随:\n  ${names.join("\n  ")}\n\n是否自动加入跟随并保存到 state[${ctrl.selectedIndex}]?`;
        const onConfirm = () => {
            for (const item of untracked) {
                if (typeof item === "number") {
                    const propType = item as EnumPropName;
                    this.togglePropertyControl(propType, true);
                    // togglePropertyControl(prop, true) 会写 controlled flag + 默认值;
                    // 这里再 commit 节点当前实际值, 覆盖默认.
                    const current = PropHandlerManager.getValue(propType, this.node);
                    if (current !== undefined) {
                        const propData = this.getPropData(ctrl.selectedIndex, ctrl.ctrlId);
                        // W6-2c2: 写 string propRef key
                        this.writePropByEnum(propData, propType, current);
                    }
                }
                else {
                    // W6-2a-fixup: 自定义 propRef 路径
                    const propRef = item;
                    this.togglePropertyControl(propRef, true);
                    const current = this.readPropFromNodeByPropRef(propRef);
                    if (current !== undefined) {
                        const propData = this.getPropData(ctrl.selectedIndex, ctrl.ctrlId);
                        if (propData) {
                            const tp = this.resolveTrackableProp(propRef);
                            (propData as any)[propRef] = cloneValueByType(current, tp ? tp.cocosType : undefined);
                        }
                    }
                }
            }
            this.editorLog(`[StateSelectV2 "${this.node && this.node.name}"] 追加跟随 + 保存: ${names.join(", ")} 到 state[${ctrl.selectedIndex}]`);
        };
        this.showDialog({
            type: "info",
            title: "录制结束: 未跟随的 prop 被改",
            message,
            buttons: ["保存并自动加入跟随", "丢弃"],
            defaultId: 0,
            cancelId: 1,
        }, (idx) => {
            if (idx === 0) onConfirm();
            else this.editorLog(`[StateSelectV2 "${this.node && this.node.name}"] 丢弃未跟随 prop: ${names.join(", ")}`);
        });
    }

    /**
     * 弹窗封装 — 见 StateControllerV2.showDialog 同步注释.
     * cocos 2.x Editor.Dialog 仅 main process 可达, component renderer 用 window.confirm 兜底.
     */
    private showDialog(opts: { title: string, message: string, buttons: string[], defaultId?: number, cancelId?: number, type?: string }, cb: (idx: number) => void): void {
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
        catch (_) { /* fall through */ }

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
            catch (_) { /* fall through */ }
        }

        cb(typeof opts.defaultId === "number" ? opts.defaultId : 0);
    }

    private editorLog(msg: string): void {
        try {
            const Ed = (globalThis as any).Editor;
            if (Ed && typeof Ed.log === "function") Ed.log(msg);
        }
        catch (_) { /* noop */ }
    }

    private editorWarn(msg: string): void {
        try {
            const Ed = (globalThis as any).Editor;
            if (Ed && typeof Ed.warn === "function") Ed.warn(msg);
        }
        catch (_) { /* noop */ }
    }

    /**
     * 把 (snapshot, 当前节点) 之间的差异 commit 到 ctrlData[targetState].
     *
     * 算法: 对 snapshot 中每个 prop, 读节点当前值, 用 PropHandler.isEqual 判断变化;
     *      有变化 → 写 ctrlData[targetState][prop] = current; 同时刷新 snapshot 为 current
     *      (供下一段 diff 起点)。
     */
    private commitRecordingDiff(ctrl: StateControllerV2, targetState: number): EnumPropName[] {
        const committed: EnumPropName[] = [];
        if (!this._snapshot) return committed;
        const propData = this.getPropData(targetState, ctrl.ctrlId);
        const snap = this._snapshot;
        // #T4: 录制中途被排除的 prop 不得 commit (不变量#8). 排除清单(用户+系统)在此过滤,
        // 即使 _snapshot 录制开始时含该 key, 中途 setPropExcluded 后也不写回。
        const userExcl = new Set(this._userExcludedProps || []);
        const sysExcl = new Set(SYSTEM_EXCLUDE);
        const isExcluded = (propRef: string | undefined): boolean =>
            propRef !== undefined && (userExcl.has(propRef) || sysExcl.has(propRef));
        for (const key of Object.keys(snap)) {
            // W6-2a: 双 key 分发 — 数字 key 走老 PropHandlerManager, 字符串 propRef 走新路径.
            const num = Number(key);
            if (Number.isFinite(num) && !Number.isNaN(num)) {
                // 老路径: EnumPropName 数字 key
                const propType = num;
                if (propType === EnumPropName.Non) continue;
                if (isExcluded(enumToPropRef(propType as EnumPropName))) continue; // #T4
                const currentValue = PropHandlerManager.getValue(propType as EnumPropName, this.node);
                if (currentValue === undefined) continue;
                const snapValue = (snap as TPropDictionary)[propType];
                if (!PropHandlerManager.isEqual(propType as EnumPropName, snapValue, currentValue)) {
                    // W6-2c2: 写 string propRef key (snapshot 仍按 number key 索引, 是 in-memory 临时态)
                    this.writePropByEnum(propData, propType as EnumPropName, currentValue);
                    (snap as TPropDictionary)[propType] = currentValue;
                    committed.push(propType as EnumPropName);
                    StateErrorManager.debug("录制 diff 提交 (enum)", {
                        component: "StateSelectV2",
                        method: "commitRecordingDiff",
                        params: { state: targetState, propType: EnumPropName[propType as EnumPropName] },
                    });
                }
            }
            else {
                // 新路径: propRef 字符串 key
                const propRef = key;
                if (isExcluded(propRef)) continue; // #T4: 排除的 prop 不 commit
                const tp = this.resolveTrackableProp(propRef);
                const currentValue = this.readNodeValueByPropRef(propRef);
                if (currentValue === undefined) continue;
                const snapValue = (snap as any)[propRef];
                const cocosType = tp ? tp.cocosType : undefined;
                if (!eqValueByType(snapValue, currentValue, cocosType)) {
                    const cloned = cloneValueByType(currentValue, cocosType);
                    (propData as any)[propRef] = cloned;
                    (snap as any)[propRef] = cloned;
                    // T2 双轨统一: 内置 prop 现走 propRef 分支提交. 若该 propRef 反查到 EnumPropName
                    // (内置), push 进 committed —— 保证 onRecordingStop 静默 log / commit 计数与
                    // 旧 number 分支等价 (自定义 propRef 无 EnumPropName 映射, 维持原先不计入的行为).
                    const mappedEnum = PROPREF_TO_ENUM[propRef];
                    if (mappedEnum !== undefined) {
                        committed.push(mappedEnum as EnumPropName);
                    }
                    StateErrorManager.debug("录制 diff 提交 (propRef)", {
                        component: "StateSelectV2",
                        method: "commitRecordingDiff",
                        params: { state: targetState, propRef },
                    });
                }
            }
        }
        return committed;
    }

    /**
     * W6-2a: 把 propData 内层的 string propRef key 值应用到节点 (apply 路径补充).
     *
     * 优先级: state propData[propRef] > defaultData[propRef]. 与 updateState 数字 key 路径
     * 一致 — 用 cloneValueByType 走 cocos type 分发写值, 避免共享引用被节点 mutate 后污染 ctrlData.
     *
     * 走此路径的 propRef 都是 togglePropertyControlByPropRef 接入的自定义组件 prop,
     * 因为 EnumPropName 老路径覆盖的 propRef 由 batchUpdateUI 处理.
     */
    /**
     * 把一份 propData(+default 兜底) 应用到节点 (enum 数字路径 batchUpdateUI + propRef 字符串路径).
     * 从 updateState 抽出, updateState(当前 selectedIndex) 与回收站预览(任意 stateId) 共用单一 apply 路径.
     */
    private applyDataToNode(propData: TProp, defaultData: TProp): void {
        const updateBatch: { type: EnumPropName, value: TPropValue }[] = [];
        const processedKeys = new Set<number>();

        // W6-2c2: 内置 prop 数据多在 string propRef key 下, 但 PropHandler 按 EnumPropName 数字派发,
        // 这里仍按 propType 走老路径桥接 (extractEnumPropTypes 把 propRef 反查回 EnumPropName).
        const defaultPropTypes = this.extractEnumPropTypes(defaultData);
        for (const propType of defaultPropTypes) {
            const stateValue = this.readPropByEnum(propData, propType);
            const defaultValue = this.readPropByEnum(defaultData, propType);
            const value = stateValue != void 0 ? stateValue : defaultValue;
            if (value == void 0) {
                continue;
            }
            updateBatch.push({ type: propType, value });
            processedKeys.add(propType);
        }

        const statePropTypes = this.extractEnumPropTypes(propData);
        for (const propType of statePropTypes) {
            if (processedKeys.has(propType)) {
                continue;
            }
            const value = this.readPropByEnum(propData, propType);
            if (value == void 0) {
                continue;
            }
            updateBatch.push({ type: propType, value });
        }

        // enum 数字路径
        this.batchUpdateUI(updateBatch);
        // string propRef 路径 (cocos type 分发写回, 带排除/受控门控)
        this.applyPropRefKeysToNode(propData, defaultData);
    }

    /**
     * 回收站预览快照 (非 @property, 不序列化): 进入预览前拍下"即将被 apply 覆盖的所有 key 的当前节点值",
     * 退出预览时按它精确还原 —— 不依赖"重画激活态", 故回收态与激活态的受控属性集不对称也能干净还原。
     *   enums: EnumPropName 数字路径的原值;  refs: propRef 字符串路径的原值 (按 cocosType 深拷)。
     */
    private _previewSnapshot: { enums: { [t: number]: TPropValue }, refs: { [ref: string]: any } } | null = null;

    /**
     * 进入某 stateId 的只读预览: 先快照将被覆盖的 key 的当前节点值, 再 apply 该 state 数据到节点.
     * 该 select 在此 state 无数据则 no-op (可能别的受控 select 才有)。由 StateControllerV2 经
     * EnumUpdateType.PreviewEnter 广播触发。幂等性由 controller 侧单实例预览保证。
     */
    public enterPreview(ctrl: StateControllerV2, stateId: number): void {
        if (!CC_EDITOR) return;
        if (!ctrl || ctrl.ctrlId !== this.currCtrlId) return;
        if (!this.node || !this.node.isValid) return;
        const pageData = this.getPageData(ctrl.ctrlId);
        const previewData = pageData ? (pageData as any)[stateId] : undefined;
        if (previewData == null) return;
        const defaultData = this.getDefaultData(ctrl.ctrlId);
        this._previewSnapshot = this.snapshotNodeForData(previewData, defaultData);
        this.applyDataToNode(previewData, defaultData);
    }

    /** 退出预览: 按快照把节点精确还原到预览前, 清快照. 幂等, 无快照安全 no-op. */
    public exitPreview(): void {
        if (!CC_EDITOR) return;
        const snap = this._previewSnapshot;
        this._previewSnapshot = null;
        if (!snap || !this.node || !this.node.isValid) return;
        // propRef 路径还原
        for (const ref of Object.keys(snap.refs)) {
            const tp = this.resolveTrackableProp(ref);
            try {
                this.writeNodeValueByPropRef(ref, cloneValueByType(snap.refs[ref], tp ? tp.cocosType : undefined));
            }
            catch (_) { /* noop */ }
        }
        // enum 路径还原
        for (const k of Object.keys(snap.enums)) {
            const handler = PropHandlerManager.getHandler(Number(k) as EnumPropName);
            if (handler) {
                try {
                    handler.setValue(this.node, (snap.enums as any)[k]);
                }
                catch (_) { /* noop */ }
            }
        }
    }

    /** 拍下 applyDataToNode(propData, defaultData) 将写到的所有 key 的当前节点值 (供 exitPreview 还原). */
    private snapshotNodeForData(propData: TProp, defaultData: TProp): { enums: { [t: number]: TPropValue }, refs: { [ref: string]: any } } {
        const enums: { [t: number]: TPropValue } = {};
        const refs: { [ref: string]: any } = {};
        // enum 数字路径: default + state 的 enum 类型
        const enumTypes = Array.from(new Set<number>([...this.extractEnumPropTypes(defaultData), ...this.extractEnumPropTypes(propData)]));
        for (const t of enumTypes) {
            const cur = PropHandlerManager.getValue(t as EnumPropName, this.node);
            if (cur !== undefined) enums[t] = cur;
        }
        // propRef 字符串路径: default + state 的 propRef key
        const refSet = Array.from(new Set<string>([...this.extractPropRefKeys(propData), ...this.extractPropRefKeys(defaultData)]));
        for (const ref of refSet) {
            const cur = this.readNodeValueByPropRef(ref);
            if (cur !== undefined) {
                const tp = this.resolveTrackableProp(ref);
                refs[ref] = cloneValueByType(cur, tp ? tp.cocosType : undefined);
            }
        }
        return { enums, refs };
    }

    private applyPropRefKeysToNode(propData: TProp, defaultData: TProp): void {
        const seen = new Set<string>();
        // W6-axis-decomp: 排除清单 (系统 + 用户) 的 propRef 不 apply, 即使 propData 残留 baseline 也不 push 回节点.
        // 修 BUG-10: user 排 cc.Node.x 后 propData['cc.Node.x']=0 baseline 仍存, 不 filter 就 apply 把 x 拽回 0.
        const userExcl = new Set(this._userExcludedProps || []);
        const sysExcl = new Set(SYSTEM_EXCLUDE);
        // Track1: compact 后 state 不内联 controlledProps, 受控真值源在 default. apply state 层时
        // 以 default 的 controlledProps 作门控回退集 (而非 apply all), 否则 state 残留的未受控值
        // (取消控制后留下的 baseline) 会被误 apply → 破坏 #C6 冻结。
        const ddCp = defaultData ? (defaultData as any).$$controlledProps$$ : undefined;
        const apply = (data: TProp, fallbackCprops?: any) => {
            if (!data) return;
            // #C6/#S1: 取消控制(非排除)的 prop 不再 apply → 冻结(SPEC line53)。门控:controlledProps
            // **存在**→ 严格门控, 不含此 key 则 skip(冻结); 本层缺失则回退到 fallbackCprops(default 受控集);
            // 两层皆缺失(真老 .fire 无元桶)→ apply all(向后兼容)。
            // 空 state map 但 default 仍有 schema 时按 compact state 处理, 回退 default; default 也空才表示全取消。
            let cprops = (data as any).$$controlledProps$$;
            const hasFallbackControlledInfo = fallbackCprops !== undefined
              && fallbackCprops !== null
              && Object.keys(fallbackCprops).length > 0;
            if (cprops === undefined
              || cprops === null
              || (Object.keys(cprops).length === 0 && hasFallbackControlledInfo)) {
                cprops = fallbackCprops;
            }
            const hasControlledInfo = cprops !== undefined && cprops !== null;
            const keys = this.extractPropRefKeys(data);
            for (const propRef of keys) {
                if (seen.has(propRef)) continue;
                if (userExcl.has(propRef) || sysExcl.has(propRef)) continue;
                if (hasControlledInfo && cprops[propRef] === undefined) continue;
                const value = (data as any)[propRef];
                if (value === undefined) continue;
                const tp = this.resolveTrackableProp(propRef);
                const cocosType = tp ? tp.cocosType : undefined;
                try {
                    this.writeNodeValueByPropRef(propRef, cloneValueByType(value, cocosType));
                    seen.add(propRef);
                }
                catch (e) {
                    StateErrorManager.warn("applyPropRefKeysToNode 写值失败", {
                        component: "StateSelectV2",
                        method: "applyPropRefKeysToNode",
                        params: { propRef, error: (e as Error).message },
                    });
                }
            }
        };
        // 先 state 数据 (compact 时门控回退到 default 受控集), 再 default 兜底 (seen 跳过)
        apply(propData, ddCp);
        // cc.Node.angle / eulerAngles / quat 是同一节点旋转的三种别名(不同 propRef key, seen 无法识别).
        // state 已 apply 其一时, default 兜底的其它别名不得再写 → 否则把 state 旋转拽回 default baseline
        // (尤以 default 的 quat=单位四元数最隐蔽: 它会把刚写好的 euler 归零)。
        // compact 后 state 常只控其一而 default 仍含 auto-opt 的另外两个, 不护 alias 会互相覆盖。
        // (position/scale/anchor/size 聚合走子轴 x/y/z 同 key, 由 seen 天然去重, 无需别名表; 旋转是唯一例外)
        const ROT_ALIAS = ["cc.Node.angle", "cc.Node.eulerAngles", "cc.Node.quat"];
        if (ROT_ALIAS.some(r => seen.has(r))) for (const r of ROT_ALIAS) seen.add(r);
        apply(defaultData);
    }

    /** 🔧 批量更新UI，使用属性处理器系统和错误处理机制 */
    private batchUpdateUI(updateBatch: { type: EnumPropName, value: TPropValue }[]) {
        // 🔧 验证节点有效性
        if (!StateErrorManager.validateNode(this.node, {
            component: "StateSelectV2",
            method: "batchUpdateUI",
            params: { batchSize: updateBatch.length },
        })) {
            return;
        }

        // 批量应用所有更新
        for (const update of updateBatch) {
            const { type, value } = update;

            if (type === EnumPropName.Non || value === undefined) {
                continue;
            }

            // 🔧 使用属性处理器系统，带错误处理
            StateErrorManager.gracefulFallback(
                () => {
                    const handler = PropHandlerManager.getHandler(type);
                    if (handler) {
                        handler.setValue(this.node, value);
                    }
                    else {
                        StateErrorManager.warn(
                            `属性类型 ${EnumPropName[type]} 尚未迁移到属性处理器系统`,
                            { component: "StateSelectV2", method: "batchUpdateUI", params: { propType: type } },
                        );
                    }
                },
                undefined,
                `设置属性值失败: ${EnumPropName[type]}`,
            );
        }
    }

    private getCurrCtrl() {
        return this._ctrlsMap[this.currCtrlId];
    }

    private migrateStateIndexKeysForCtrl(ctrl: StateControllerV2): void {
        if (!ctrl || !ctrl.states) return;
        const pageData = this.getPageData(ctrl.ctrlId);
        if (!pageData || pageData.$$stateKeyMode$$ === "stateId") return;
        for (let index = 0; index < ctrl.states.length; index++) {
            const stateId = this.getStateIdByIndex(ctrl, index);
            if (stateId < 0 || stateId === index) continue;
            const indexData = pageData[index];
            if (indexData !== undefined && pageData[stateId] === undefined) {
                pageData[stateId] = indexData;
            }
            delete pageData[index];
        }
        pageData.$$stateKeyMode$$ = "stateId";
    }

    /**
     * 其他状态是否有存在这个属性
     * @param ctrl
     * @param prop
     */
    private isOtherHans(ctrl: StateControllerV2, prop: number) {
        const pageData = this.getPageData();
        for (let index = 0, len = ctrl.states.length; index < len; index++) {
            const stateId = this.getStateIdByIndex(ctrl, index);
            if (stateId < 0) continue;
            const propData = pageData[stateId];
            // W6-2c2: 双 key 读
            if (propData && this.readPropByEnum(propData, prop as EnumPropName) != void 0) {
                return true;
            }
        }
        return false;
    }

    /** 获取某个控制器的状态数据 */
    /**
     * #C5: 深拷一个 state 的 propData, 逐 key 按 cocos type 分发 cloneValueByType —— 保活
     * cc.Color/Vec3/Vec2/Size/Quat 类实例 (X 方案下 propData 值是活 cc 实例, JSON 深拷会降级成
     * 普通对象导致 apply 时类型退化)。
     *   - $$ 元 bucket ($$controlledProps$$/$$changedProp$$ 等, 值为纯 string/number map): JSON 浅深拷即可
     *   - 其余 propRef/number key: cloneValueByType(value, resolveTrackableProp.cocosType)
     */
    private deepClonePropData(source: TProp): TProp {
        const out: any = {};
        for (const key of Object.keys(source)) {
            const v = (source as any)[key];
            if (key.startsWith("$$")) {
                out[key] = (v !== null && typeof v === "object") ? JSON.parse(JSON.stringify(v)) : v;
                continue;
            }
            const tp = this.resolveTrackableProp(key);
            out[key] = cloneValueByType(v, tp ? tp.cocosType : undefined);
        }
        return out as TProp;
    }

    private getPageData(ctrlId?: number): TPage {
        const targetCtrlId = ctrlId != void 0 ? ctrlId : this.currCtrlId;
        if (targetCtrlId == null) {
            return {} as TPage;
        }
        if (this._ctrlData[targetCtrlId] == void 0) {
            this._ctrlData[targetCtrlId] = {};
        }
        return this._ctrlData[targetCtrlId];
    }

    private getStateIdByIndex(ctrl: StateControllerV2, index: number): number {
        const states = ctrl && ctrl.states;
        if (!states || index < 0 || index >= states.length) return -1;
        const state = states[index];
        return state && typeof state.stateId === "number" ? state.stateId : -1;
    }

    private getStateDataKey(stateIndex?: number, ctrlId?: number): number {
        const targetCtrlId = ctrlId != void 0 ? ctrlId : this.currCtrlId;
        const ctrl = targetCtrlId != void 0 ? this._ctrlsMap[targetCtrlId] : this.getCurrCtrl();
        const targetIndex = stateIndex != void 0 ? stateIndex : this.ctrlState;
        const stateId = this.getStateIdByIndex(ctrl, targetIndex);
        return stateId >= 0 ? stateId : targetIndex;
    }

    private getPropDataByIndex(stateIndex: number, ctrlId?: number): TProp {
        return this.getPropData(stateIndex, ctrlId);
    }

    /**
     * 获取某个状态的属性数据
     */
    private getPropData(stateIndex?: number, ctrlId?: number): TProp {
        const pageData = this.getPageData(ctrlId);
        pageData.$$stateKeyMode$$ = "stateId";
        const targetStateKey = this.getStateDataKey(stateIndex, ctrlId);
        if (pageData[targetStateKey] == void 0) {
            pageData[targetStateKey] = {} as TProp;
        }
        return pageData[targetStateKey];
    }

    /** 获取默认属性 */
    private getDefaultData(ctrlId?: number): TProp {
        const pageData = this.getPageData(ctrlId);
        if (pageData.$$default$$ == void 0) {
            pageData.$$default$$ = {} as TProp;
        }
        return pageData.$$default$$;
    }

    private setPropValue(type: EnumPropName) {
        const value = this.handleValue(type);
        if (value == void 0) {
            return void 0;
        }
        this._propValue = value;
        return value;
    }

    /** 🔧 解析并返回属性值，使用属性处理器系统和错误处理机制 */
    private handleValue(type: EnumPropName): TPropValue {
        if (type === EnumPropName.Non) {
            return undefined;
        }

        // 🔧 验证节点有效性
        if (!StateErrorManager.validateNode(this.node, {
            component: "StateSelectV2",
            method: "handleValue",
            params: { propType: EnumPropName[type] },
        })) {
            return undefined;
        }

        // 🔧 使用属性处理器系统，带错误处理
        return StateErrorManager.gracefulFallback(
            () => {
                const handler = PropHandlerManager.getHandler(type);
                if (handler) {
                    return handler.getValue(this.node);
                }

                StateErrorManager.warn(
                    `属性类型 ${EnumPropName[type]} 尚未迁移到属性处理器系统`,
                    { component: "StateSelectV2", method: "handleValue", params: { propType: type } },
                );
                return undefined;
            },
            undefined,
            `获取属性值失败: ${EnumPropName[type]}`,
        );
    }

    /** 父节点改变，转换已经缓存的位置 */
    private transPosition(oldParent: cc.Node) {
        if (!CC_EDITOR) {
            return;
        }

        const parent = this.node.parent;
        if (!parent || !oldParent) {
            return;
        }

        // 检查oldParent是否是有效的cc.Node对象且具有必要的方法
        if (!oldParent.isValid || typeof oldParent.convertToWorldSpaceAR !== "function") {
            StateErrorManager.warn("oldParent 节点无效或已销毁", {
                component: "StateSelectV2",
                method: "transPosition",
            });
            return;
        }
        // 检查parent是否具有必要的方法
        if (typeof parent.convertToNodeSpaceAR !== "function") {
            StateErrorManager.warn("parent 节点缺少 convertToNodeSpaceAR 方法", {
                component: "StateSelectV2",
                method: "transPosition",
            });
            return;
        }

        const pageData = this.getPageData();

        // #F-4 (TASK-004): 仅"当前受控且未排除"的轴参与坐标转换的写回. 取消跟随/排除但
        // propData 残留 baseline 的轴不被转换 (附录A 断言#3). 受控态与 state 无关, 循环外算一次.
        const convX = this.isAxisConvertible("cc.Node.x");
        const convY = this.isAxisConvertible("cc.Node.y");
        const convZ = this.isAxisConvertible("cc.Node.z");
        if (!convX && !convY && !convZ) return;

        // #V3: 缺轴兜底优先用 default 基线, 而非激活 state 的 live 节点坐标 —— 否则换算某 state 时
        // 误用当前激活 state 的实时坐标污染该 state 的映射 (各 state 应按"自身值 > default > live"还原)。
        const defData = (pageData as any).$$default$$ || {};
        for (const state in pageData) {
            // 跳过非 default 元桶 ($$controlledProps$$/$$changedProp$$/$$lastProp$$/$$propertyData$$) —
            // 它们的 "cc.Node.x" 值是 flag 字符串非坐标; 但 $$default$$ 是真基线, 必须参与换算
            // (#V3: 缺轴 state 依赖 default, default 不转则那些 state 位置错)。
            if (state.startsWith("$$") && state !== "$$default$$") continue;
            const propData = pageData[state] as any;
            if (!propData) continue;
            // M3-2 修 #3: Position 以子项 cc.Node.x/y/z 存. 读子项重组 Vec3 转换后写回**受控未排除**的轴
            // (缺轴/排除轴用 default 基线兜底参与点换算, 缺 default 才退 live 节点值; 不回写其数据).
            const sx = propData["cc.Node.x"];
            const sy = propData["cc.Node.y"];
            const sz = propData["cc.Node.z"];
            if (sx === undefined && sy === undefined && sz === undefined) continue;
            const fb = (sub: string, live: number) =>
                defData[sub] !== undefined ? defData[sub] : live;
            const px = sx !== undefined ? sx : fb("cc.Node.x", this.node.x);
            const py = sy !== undefined ? sy : fb("cc.Node.y", this.node.y);
            const pz = sz !== undefined ? sz : fb("cc.Node.z", (this.node as any).z || 0);
            try {
                // 在 2.x 中，需要手动计算坐标转换
                const worldPos = oldParent.convertToWorldSpaceAR(cc.v3(px, py, pz));
                const localPos = parent.convertToNodeSpaceAR(worldPos);
                if (convX && sx !== undefined) propData["cc.Node.x"] = localPos.x;
                if (convY && sy !== undefined) propData["cc.Node.y"] = localPos.y;
                if (convZ && sz !== undefined) propData["cc.Node.z"] = localPos.z;
            }
            catch (error) {
                StateErrorManager.error("坐标转换过程中发生错误", {
                    component: "StateSelectV2",
                    method: "transPosition",
                    params: { error: error.message },
                });
            }
        }
    }

    /** 同步属性到所有状态 */
    private syncPropToAllStatesInternal(propKey: EnumPropName) {
        const ctrl = this.getCurrCtrl();
        if (!ctrl) {
            StateErrorManager.error("同步属性失败：控制器为空", {
                component: "StateSelectV2",
                method: "syncPropToAllStatesInternal",
            });
            return;
        }

        StateErrorManager.debug("开始同步属性到所有状态", {
            component: "StateSelectV2",
            method: "syncPropToAllStatesInternal",
            params: { propType: EnumPropName[propKey], stateCount: ctrl.states.length },
        });

        // 🔧 修复：不同步Non属性
        if (propKey === EnumPropName.Non) {
            StateErrorManager.warn("不能同步Non属性", {
                component: "StateSelectV2",
                method: "syncPropToAllStatesInternal",
            });
            return;
        }

        const pageData = this.getPageData();
        const currentStateValue = this.handleValue(propKey); // 获取当前节点的属性值作为默认值

        if (currentStateValue === undefined) {
            StateErrorManager.error("同步失败：无法获取当前属性值", {
                component: "StateSelectV2",
                method: "syncPropToAllStatesInternal",
                params: { propType: EnumPropName[propKey] },
            });
            return;
        }

        // 遍历所有状态
        let syncedStates = 0;
        for (let stateIndex = 0; stateIndex < ctrl.states.length; stateIndex++) {
            const stateId = this.getStateIdByIndex(ctrl, stateIndex);
            if (stateId < 0) continue;
            if (pageData[stateId] == void 0) {
                pageData[stateId] = {};
            }
            const statePropData = pageData[stateId];

            // W6-2c2: 双 key 读 (优先 string propRef, fallback number)
            if (this.readPropByEnum(statePropData, propKey) === undefined) {
                this.writePropByEnum(statePropData, propKey, currentStateValue);
                syncedStates++;

                // 🔧 修复：同步属性时，只在该状态没有lastProp时才设置，避免覆盖用户的选择
                if (!statePropData.$$lastProp$$) {
                    statePropData.$$lastProp$$ = propKey;
                }

                // 更新该状态的changedProp记录
                statePropData.$$changedProp$$ = statePropData.$$changedProp$$ || {};
                statePropData.$$changedProp$$[EnumPropName[propKey]] = propKey;
            }
        }

        // 同时更新默认状态
        const defaultData = this.getDefaultData();
        if (this.readPropByEnum(defaultData, propKey) === undefined) {
            this.writePropByEnum(defaultData, propKey, currentStateValue);
        }

        StateErrorManager.info("属性同步完成", {
            component: "StateSelectV2",
            method: "syncPropToAllStatesInternal",
            params: {
                propType: EnumPropName[propKey],
                syncedStates: syncedStates,
                totalStates: ctrl.states.length,
            },
        });
        this.updateChangedProp();
    }

    /** 🔧 同步删除所有状态的指定属性 */
    private syncDeletePropFromAllStates(propKey: EnumPropName) {
        const ctrl = this.getCurrCtrl();
        if (!ctrl) {
            StateErrorManager.error("删除属性失败：控制器为空", {
                component: "StateSelectV2",
                method: "syncDeletePropFromAllStates",
            });
            return;
        }

        StateErrorManager.debug("开始同步删除属性", {
            component: "StateSelectV2",
            method: "syncDeletePropFromAllStates",
            params: { propType: EnumPropName[propKey], stateCount: ctrl.states.length },
        });

        // 🔧 修复：不删除Non属性
        if (propKey === EnumPropName.Non) {
            StateErrorManager.warn("不能删除Non属性", {
                component: "StateSelectV2",
                method: "syncDeletePropFromAllStates",
            });
            return;
        }

        const pageData = this.getPageData();
        const name = EnumPropName[propKey];
        let deletedFromStates = 0;

        // W6-2c2: 删时双 key 一起删 (string propRef + number, 兼容老数据)
        const propRef = enumToPropRef(propKey);
        // 遍历所有状态，删除指定属性
        for (let stateIndex = 0; stateIndex < ctrl.states.length; stateIndex++) {
            const stateId = this.getStateIdByIndex(ctrl, stateIndex);
            if (stateId < 0) continue;
            const statePropData = pageData[stateId];
            if (statePropData) {
                // 删除属性值 (string + number 双删)
                const hadValue = this.readPropByEnum(statePropData, propKey) !== undefined;
                if (propRef !== undefined) delete (statePropData as any)[propRef];
                delete (statePropData as TPropDictionary)[propKey];
                if (hadValue) deletedFromStates++;

                // W6-axis-decomp: 跨所有 state 删 $$controlledProps$$ 中 name key + propRef key
                // (performPropertyDeletion 只删了当前 state, 这里补全 — 修 bridge isPropertyControlled fallback 残留)
                if (statePropData.$$controlledProps$$) {
                    delete statePropData.$$controlledProps$$[name];
                    if (propRef !== undefined) delete (statePropData.$$controlledProps$$ as any)[propRef];
                }

                // 删除changedProp记录
                const $$changedProp$$ = statePropData.$$changedProp$$ || {};
                delete $$changedProp$$[name];

                // 如果删除的是当前状态的lastProp，重置为Non
                if (statePropData.$$lastProp$$ === propKey) {
                    statePropData.$$lastProp$$ = EnumPropName.Non;
                }
            }
        }

        // 删除默认状态的属性 (双删)
        const defaultData = this.getDefaultData();
        if (propRef !== undefined) delete (defaultData as any)[propRef];
        delete (defaultData as TPropDictionary)[propKey];
        // W6-axis-decomp: 默认状态 $$controlledProps$$ 也双删
        if (defaultData.$$controlledProps$$) {
            delete defaultData.$$controlledProps$$[name];
            if (propRef !== undefined) delete (defaultData.$$controlledProps$$ as any)[propRef];
        }

        StateErrorManager.info("属性删除完成", {
            component: "StateSelectV2",
            method: "syncDeletePropFromAllStates",
            params: {
                propType: name,
                deletedFromStates: deletedFromStates,
                totalStates: ctrl.states.length,
            },
        });
        this.updateChangedProp();
    }

    /** 🔧 简化：固定使用自动同步模式，不再提供选择 */
    private readonly autoSyncEnabled: boolean = true;

    // #endregion 5.

    // #region 6. 属性控制 API (Public) — Phase 5.2 抽出 PropertyControlService 目标

    /** 🔧 检查属性是否可用（节点是否支持该属性类型） */
    public isPropertyAvailable(propType: EnumPropName): boolean {
        return PropertyControlService.isPropertyAvailable(this.node, propType);
    }

    /**
     * TASK-003: 检查属性是否"适合自动接入"(applicable for opt-in).
     * 语义等价于 isPropertyAvailable: 节点上能取到这个 prop (节点自带 / 组件存在),
     * 就 applicable. 提供独立名字让 __preload 自动接入路径 + 外部调用方语义更清晰.
     */
    public isApplicableProp(propType: EnumPropName): boolean {
        return PropertyControlService.isPropertyAvailable(this.node, propType);
    }

    /**
     * 🔧 检查属性是否已被控制（使用新的controlledProps结构）
     *
     * W6-2b: 公开 API 接受 EnumPropName | string 联合类型.
     *   - number (EnumPropName): 走老路径 PropertyControlService.isPropertyControlled (内置 prop, name key 'Active')
     *   - string (propRef): 走新路径 isPropertyControlledByPropRef (string key 'cc.Node.active')
     *
     * W6-axis-decomp X 方案 bridge: EnumPropName 路径 fallback 看 propRef 键 — 老调用方
     * isPropertyControlled(EnumPropName.Active) 仍能在自动接入走 propRef 路径后正确返回 true.
     * 命中规则:
     *   - 主路径: propData.$$controlledProps$$ 含名字 key 'Active' (老 API addPropertyControl 写入)
     *   - bridge: propData.$$controlledProps$$ 含 propRef key 'cc.Node.active' (X 方案 autoOptIn 写入)
     */
    public isPropertyControlled(propTypeOrRef: EnumPropName | string): boolean {
        if (typeof propTypeOrRef === "string") {
            return this.isPropertyControlledByPropRef(propTypeOrRef);
        }
        // 主路径: name key
        if (PropertyControlService.isPropertyControlled(this.getPropData(), propTypeOrRef)) {
            return true;
        }
        // W6-axis-decomp bridge: 看 propRef 等价 key (autoOptInCustomComponentProps 写的)
        const propRef = enumToPropRef(propTypeOrRef);
        if (propRef !== undefined) {
            // 聚合根治 (C1/U3): AMBIGUOUS 聚合走子项独立 —— 全部子项受控才算"聚合受控"(用户本意:
            // x/y/z 单独控制, 都算影响 position; 部分受控的 ◐ 视觉属专项B, 这里只给布尔基线)。
            if (isAmbiguousAggregatePropRef(propRef)) {
                // ANY 语义 (用户裁定): 任一子项受控即算"聚合受控"(isPropertyControlled 答"管不管"非"管全不全";
                // 部分受控的精确表达=◐, 属专项B)。Euler 子项(rotationX/Y)全 SYSTEM_EXCLUDE → 无可控子项 →
                // 回退查聚合 key 自身(euler 走整体聚合, 保 z, 见 getControllableAmbiguousSubRefs)。
                const subs = this.getControllableAmbiguousSubRefs(propRef);
                if (subs.length > 0) return subs.some(s => this.isPropertyControlledByPropRef(s));
            }
            return this.isPropertyControlledByPropRef(propRef);
        }
        return false;
    }

    /** 聚合根治: 取某 AMBIGUOUS 聚合 propRef 的子项 ref 列表 (用零探针调拆解函数取 key). */
    private getAmbiguousSubRefs(aggRef: string): string[] {
        const decomposer = AMBIGUOUS_DECOMPOSE[aggRef];
        if (!decomposer) return [];
        const pairs = decomposer({
            x: 0, y: 0, z: 0, width: 0, height: 0,
        });
        return pairs ? pairs.map(p => p[0]) : [];
    }

    /**
     * 聚合根治: 取**可控**子项 (排除 SYSTEM_EXCLUDE)。Euler 的 rotationX/rotationY 是 2.1 起废弃属性,
     * 全在 SYSTEM_EXCLUDE → 返空 → 调用方回退"整体聚合"路径(euler 存全 eulerAngles vec3, 保 z 旋转);
     * Position/Scale/Size/Anchor 的子项可控 → 返非空 → 走 decompose 子项独立。
     */
    private getControllableAmbiguousSubRefs(aggRef: string): string[] {
        return this.getAmbiguousSubRefs(aggRef).filter(s => SYSTEM_EXCLUDE.indexOf(s) < 0);
    }

    /**
     * 当前 state 已勾选 prop 的"美化值"列表 (readonly, inspector 极简显示用)。
     *
     * 每项形如 `"Color: rgba(192,192,255,255)"`, `"Position: (100, 0, 0)"`,
     * 匹配 /^[A-Z][a-zA-Z]+: .+\$/。值来源是 pageData[currentStateIndex][propType]
     * (canonical 存储, 与 panel 同一份数据)。
     *
     * Wave 1 panel 未实装期间, 这是用户在 inspector 中唯一能看到的 state 内容摘要。
     */
    @property({
        displayName: "已跟随属性",
        tooltip: "当前 state 已勾选 prop 的人类可读列表 (readonly, panel 接管后会更丰富)",
        readonly: true,
    })
    public get currentStateProps(): string[] {
        const result: string[] = [];
        const ctrl = this.getCurrCtrl();
        if (!ctrl) {
            return result;
        }
        const propData = this.getPropData();
        if (!propData) {
            return result;
        }
        // 遍历 EnumPropName, 跳过 Non=0, 收集已勾选的 prop
        for (const key of Object.keys(EnumPropName)) {
            const propType = (EnumPropName as any)[key];
            if (typeof propType !== "number" || propType === EnumPropName.Non) {
                continue;
            }
            if (!this.isPropertyControlled(propType)) {
                continue;
            }
            // W6-2c2: 双 key 读
            const value = this.readPropByEnum(propData, propType);
            if (value === undefined) {
                continue;
            }
            const label = EnumPropName[propType]; // 用 enum 反向查表得到大写英文 name
            result.push(`${label}: ${this.formatPropValue(value)}`);
        }
        return result;
    }

    // #region inspector 折叠组 (排除管理 / 录制 / 值搬运) — facade 代理到本类访问器, owner 在 __preload 注入

    /** 排除管理折叠组 (排除跟随 / + 添加排除 / 用户排除清单). */
    @property({ type: SelectExcludeGroup, displayName: "排除管理", tooltip: "管理本节点的属性跟随排除清单 (系统 + 用户)" })
    public excludeGroup = new SelectExcludeGroup();

    /** 录制折叠组 (与 StateControllerV2 共享同一录制态). */
    @property({ type: SelectRecordGroup, displayName: "录制", tooltip: "录制工作流: 进入/退出录制 (回退整次录制用编辑器 Ctrl+Z)" })
    public recording = new SelectRecordGroup();

    /** 值搬运折叠组 (当前 state ↔ 下一 state 的节点级值操作). */
    @property({ type: SelectValueOpsGroup, displayName: "值搬运", tooltip: "在相邻 state 间交换/复制/移动本节点的值数据" })
    public valueOps = new SelectValueOpsGroup();

    // #endregion inspector 折叠组

    /**
     * 录制按钮 (Wave 2 实装): 镜像 currCtrl.isRecording, 点击 toggle ctrl.startRecording / stopRecording.
     * 让用户在 StateSelectV2 inspector 上也能起停录制, 与 StateControllerV2 inspector 共享同一录制态。
     */
    /** 普通访问器, inspector 可见性由 recording 折叠组代理. */
    public get recordTrigger() {
        const ctrl = this.getCurrCtrl();
        return !!(ctrl && ctrl.isRecording);
    }

    public set recordTrigger(_value: boolean) {
        if (!CC_EDITOR) return;
        const ctrl = this.getCurrCtrl();
        if (!ctrl) {
            StateErrorManager.warn("recordTrigger: 未找到当前控制器", {
                component: "StateSelectV2",
                method: "recordTrigger.setter",
            });
            return;
        }
        if (ctrl.isRecording) {
            ctrl.stopRecording();
        }
        else {
            ctrl.startRecording();
        }
    }

    /**
     * 撤销本次录制 (TASK-002): 镜像 StateControllerV2.cancelRecordTrigger, 调 ctrl.cancelRecording。
     * 2026-06-03: 已从 inspector 移除按钮 — 回退整次录制改用编辑器原生 Ctrl+Z (避免自建撤销与原生 undo 双重撤销)。
     * 访问器 + cancelRecording 底层保留 (panel/测试仍可用), 仅不在折叠组直显。
     */
    public get cancelRecordTrigger() {
        return false;
    }

    public set cancelRecordTrigger(_value: boolean) {
        if (!CC_EDITOR) return;
        const ctrl = this.getCurrCtrl();
        if (!ctrl) return;
        if (ctrl.isRecording) {
            ctrl.cancelRecording();
        }
    }

    // #region 专项A-2: 局部值操作 inspector 触发器 (当前 state ↔ 下一 state)
    /** 专项A-2: 当前 state 与下一 state 的下标对 (无下一 state 返回 null). */
    private getCurrNextStatePair(): { cur: number, next: number } | null {
        const ctrl = this.getCurrCtrl();
        if (!ctrl || !ctrl.states) return null;
        const cur = ctrl.selectedIndex;
        const next = cur + 1;
        if (next >= ctrl.states.length) return null;
        return { cur, next };
    }

    /** 专项A-2: 交换当前 state 与下一 state 的值数据 (节点级局部操作). */
    /** 普通访问器, inspector 可见性由 valueOps 折叠组代理. */
    public get swapValueWithNext(): boolean {
        return false;
    }

    public set swapValueWithNext(_v: boolean) {
        if (!CC_EDITOR) return;
        const p = this.getCurrNextStatePair();
        if (p) this.swapStateValues(p.cur, p.next);
    }

    /** 专项A-2: 复制当前 state 的值数据到下一 state (节点级局部操作). */
    /** 普通访问器, inspector 可见性由 valueOps 折叠组代理. */
    public get copyValueToNext(): boolean {
        return false;
    }

    public set copyValueToNext(_v: boolean) {
        if (!CC_EDITOR) return;
        const p = this.getCurrNextStatePair();
        if (p) this.copyStateValues(p.cur, p.next);
    }
    // #endregion

    /**
     * W6-4 hotfix2 #1: 一键刷新 inspector. 用户在 panel/外部改了状态后,
     * inspector 偶尔不自动 refresh 时手动一键. 同时 reconcile + refresh enumList 兜底.
     */
    @property({
        displayName: "🔄 刷新 inspector",
        tooltip: "手动刷新 inspector: reconcile 排除清单 + 刷下拉选项 + 强制 cocos refreshSelectedInspector",
    })
    public get refreshInspectorTrigger(): boolean {
        return false;
    }

    public set refreshInspectorTrigger(_value: boolean) {
        if (!CC_EDITOR) return;
        try {
            this.reconcileUserExcluded();
        }
        catch { /* swallow, 兜底 */ }
        try {
            this.refreshExcludeEnumLists();
        }
        catch { /* swallow */ }
        try {
            if (this.node && (Editor as any)?.Utils?.refreshSelectedInspector) {
                (Editor as any).Utils.refreshSelectedInspector("node", this.node.uuid);
            }
        }
        catch (e) {
            StateErrorManager.warn("refreshInspectorTrigger: Editor.Utils.refreshSelectedInspector 失败", {
                component: "StateSelectV2",
                method: "refreshInspectorTrigger.setter",
                params: { error: (e as Error).message },
            });
        }
    }

    /**
     * 一键重新绑定控制器: 把本节点拷贝粘贴到另一个 prefab 后, 勾一下即按当前祖先链重扫重绑,
     * 无需删组件再加. 切到不同控制器时会清空旧状态数据 (重来); 同一控制器或没扫到控制器则不操作
     * (详见 rebindController).
     */
    @property({
        displayName: "⟳ 重新绑定控制器",
        tooltip: "按当前所在祖先链重新解析并绑定 StateControllerV2 (拷贝到新 prefab 后用). 切到不同控制器会清空旧状态数据; 同一控制器不操作",
    })
    public get rebindControllerTrigger(): boolean {
        return false;
    }

    public set rebindControllerTrigger(_value: boolean) {
        if (!CC_EDITOR) return;
        this.rebindController();
    }

    /** 把 TPropValue 序列化为人类可读字符串 (currentStateProps 内部用) */
    private formatPropValue(value: unknown): string {
        if (value === null || value === undefined) {
            return "-";
        }
        if (typeof value === "number") {
            // 整数直显, 浮点保留 2 位
            return Number.isInteger(value) ? String(value) : value.toFixed(2);
        }
        if (typeof value === "boolean" || typeof value === "string") {
            return String(value);
        }
        if (typeof value === "object") {
            const v = value as any;
            // Color: { r,g,b,a }
            if ("r" in v && "g" in v && "b" in v) {
                return `rgba(${v.r},${v.g},${v.b},${v.a !== undefined ? v.a : 255})`;
            }
            // Vec3 / Position: { x, y, z }
            if ("x" in v && "y" in v) {
                if ("z" in v) {
                    return `(${this.formatPropValue(v.x)}, ${this.formatPropValue(v.y)}, ${this.formatPropValue(v.z)})`;
                }
                return `(${this.formatPropValue(v.x)}, ${this.formatPropValue(v.y)})`;
            }
            // Size: { width, height }
            if ("width" in v && "height" in v) {
                return `${v.width}x${v.height}`;
            }
            // SpriteFrame / Font 等资源对象, 通常有 _uuid 或 name
            if (v._uuid) {
                return `<asset:${v._uuid.slice(0, 8)}>`;
            }
            if (v.name) {
                return String(v.name);
            }
        }
        // 兜底: JSON 单行
        try {
            return JSON.stringify(value);
        }
        catch {
            return String(value);
        }
    }

    /**
     * 🔧 切换属性控制状态
     *
     * W6-2b: 公开 API 接受 EnumPropName | string 联合类型.
     *   - number (EnumPropName): 走老路径 (add/removePropertyControl, 写 number key)
     *   - string (propRef): 走新路径 (togglePropertyControlByPropRef, 写 string key)
     *
     * Dispatch: 无论哪条路径, 完成后派发 onPropertyControlled / onPropertyReleased,
     *   payload 含 propType (number, AMBIGUOUS / 自定义 prop 可能为 undefined) + propRef (string).
     *   内置 prop 的 propRef 通过 ENUM_TO_PROPREF 派生 (AMBIGUOUS 项无映射 → undefined).
     *   自定义 prop 的 propType 通过 PROPREF_TO_ENUM 反查 (无映射 → undefined).
     */
    public togglePropertyControl(propTypeOrRef: EnumPropName | string, enable: boolean) {
        if (!CC_EDITOR) {
            return;
        }

        // W6-2b: string 路径 — 走 propRef 新路径 (写 string key)
        if (typeof propTypeOrRef === "string") {
            this.togglePropertyControlStringPath(propTypeOrRef, enable);
            return;
        }

        const propType: EnumPropName = propTypeOrRef;
        const propRef: string | undefined = ENUM_TO_PROPREF[propType];

        StateErrorManager.debug("切换属性控制状态", {
            component: "StateSelectV2",
            method: "togglePropertyControl",
            params: { propType: EnumPropName[propType], propRef, enable },
        });

        if (enable) {
            // 🔧 第一步：启用属性控制
            this.addPropertyControl(propType);

            // 🔧 第二步：立即更新界面标识变量
            this._currentDisplayProp = propType;

            StateErrorManager.debug("属性控制已启用，界面标识已更新", {
                component: "StateSelectV2",
                method: "togglePropertyControl",
                params: {
                    propType: EnumPropName[propType],
                    propRef,
                    currentDisplayProp: EnumPropName[this._currentDisplayProp],
                },
            });

            // W6-2b: 派发 propRef-aware 事件 (双字段并存 propType + propRef)
            CapabilityRegistry.dispatch("onPropertyControlled", {
                ctrl: this.getCurrCtrl(),
                select: this,
                propType,
                propRef,
            });
        }
        else {
            // 🔧 第一步：禁用属性控制
            this.removePropertyControl(propType);

            // #C6 + #C7 + 聚合根治: 全局删 propRef 等价 key (所有 state + default)。
            // AMBIGUOUS 聚合 → 释放各子项 (与接入对称, 子项独立); 其余 → 删该 propRef。
            const offRef = enumToPropRef(propType);
            const offSubs = (offRef !== undefined && isAmbiguousAggregatePropRef(offRef))
                ? this.getControllableAmbiguousSubRefs(offRef)
                : [];
            if (offSubs.length > 0) {
                for (const subRef of offSubs) this.removeControlledFlagAllStates(subRef);
            }
            else if (offRef !== undefined) {
                // 非聚合, 或 euler(无可控子项, 走整体聚合 key 移除)
                this.removeControlledFlagAllStates(offRef, propType);
            }

            // 🔧 第二步：如果是当前显示的属性，清空界面标识
            if (this._currentDisplayProp === propType) {
                this._currentDisplayProp = EnumPropName.Non;
            }

            StateErrorManager.debug("属性控制已禁用，界面标识已清空", {
                component: "StateSelectV2",
                method: "togglePropertyControl",
                params: {
                    propType: EnumPropName[propType],
                    propRef,
                    currentDisplayProp: EnumPropName[this._currentDisplayProp],
                },
            });

            // W6-2b: 派发 propRef-aware 事件 (双字段并存 propType + propRef)
            CapabilityRegistry.dispatch("onPropertyReleased", {
                ctrl: this.getCurrCtrl(),
                select: this,
                propType,
                propRef,
            });
        }

        // 嵌套 CCClass 的 setter 触发后，inspector 只刷新子对象区域
        // 需要强制刷新整个 inspector 以使可见性变更生效
        // this.forceRefreshInspector();
    }

    /**
     * W6-2b: string propRef 路径分发. 调用方传入 "compName.propKey" 形式的 propRef.
     *   - 自定义 prop (无 EnumPropName 映射): 走 togglePropertyControlByPropRef (写 string key)
     *   - 内置 prop (能反查到 EnumPropName, e.g. "cc.Node.active"): 兼容性自动重定向到老路径,
     *     避免内置 prop 同时出现 number key + string key 的双写混淆.
     *
     * 派发: 无论哪条路径, 完成后派发 onPropertyControlled / onPropertyReleased 含 propType + propRef.
     */
    private togglePropertyControlStringPath(propRef: string, enable: boolean): void {
        const mappedEnum = PROPREF_TO_ENUM[propRef];
        // 内置 propRef → 重定向到 number 路径 (避免双写)
        if (mappedEnum !== undefined) {
            this.togglePropertyControl(mappedEnum as EnumPropName, enable);
            return;
        }

        // 自定义 propRef → 走 string key 路径
        StateErrorManager.debug("切换属性控制状态 (propRef 路径)", {
            component: "StateSelectV2",
            method: "togglePropertyControlStringPath",
            params: { propRef, enable },
        });

        this.togglePropertyControlByPropRef(propRef, enable);

        // W6-2b: 派发 propRef-aware 事件 (自定义 prop, propType=undefined)
        CapabilityRegistry.dispatch(enable ? "onPropertyControlled" : "onPropertyReleased", {
            ctrl: this.getCurrCtrl(),
            select: this,
            propType: undefined,
            propRef,
        });
    }

    /** 🔧 智能属性推断：扫描节点所有可用的属性 */
    public scanAvailableProperties(): EnumPropName[] {
        const availableProps = PropertyControlService.scanAvailableProperties(this.node);
        StateErrorManager.info("扫描可用属性完成", {
            component: "StateSelectV2",
            method: "scanAvailableProperties",
            params: { count: availableProps.length, props: availableProps.map(p => EnumPropName[p]) },
        });
        return availableProps;
    }

    /** 🔧 架构重构：添加属性控制（分离控制状态和数据状态） */
    private addPropertyControl(propType: EnumPropName) {
        const propData = this.getPropData();
        if (!propData) {
            StateErrorManager.warn("无法获取属性数据", {
                component: "StateSelectV2",
                method: "addPropertyControl",
                params: { propType: EnumPropName[propType] },
            });
            return;
        }

        const propName = EnumPropName[propType];
        const propRef = enumToPropRef(propType);

        // 聚合根治 (C1/C2/C7 + U1/U2/U3/U6): AMBIGUOUS 聚合 (Position/Scale/Size/Euler/Anchor) 不注册
        // 聚合 key, 改逐子项接入 (与 auto-opt 一致, 用户本意: x/y/z 单独控制)。子项走 togglePropertyControlByPropRef
        // (含值/default/录制 snapshot 处理), 避免聚合 key 引发的录制残留/apply 跳过/判定失败等。
        if (propRef !== undefined && isAmbiguousAggregatePropRef(propRef)) {
            const subs = this.getControllableAmbiguousSubRefs(propRef);
            if (subs.length > 0) {
                for (const subRef of subs) this.togglePropertyControlByPropRef(subRef, true);
                return;
            }
            // euler: 无可控子项 → 落到下方整体聚合注册 (保 z)
        }

        // 🔧 第一步：确保受控标记结构存在
        propData.$$controlledProps$$ = propData.$$controlledProps$$ || {};

        // 🔧 第二步：标记受控 + 落值
        // T2 双轨统一 (X方案): 有 propRef 映射的内置 prop 收敛到 propRef 字符串单一路径 (与自定义 prop 对称) —
        // $$controlledProps$$ 写 propRef 自指 string key (非名字 key), 值落**顶层** propData[propRef],
        // 不再建 $$propertyData$$ 子 bucket. 旧双轨的第二条数据轨 (名字 key + $$propertyData$$) 已废,
        // 消除 F-7/F-8 残留, 并让 applyPropRefKeysToNode 成为内置唯一 apply 轨 (配合 extractEnumPropTypes 去桥).
        if (propRef !== undefined) {
            propData.$$controlledProps$$[propRef] = propRef as any;
            if ((propData as any)[propRef] === undefined) {
                const currentValue = this.handleValue(propType);
                if (currentValue === undefined) {
                    StateErrorManager.warn("无法获取属性值，跳过数据创建", {
                        component: "StateSelectV2",
                        method: "addPropertyControl",
                        params: { propType: propName },
                    });
                    return;
                }
                (propData as any)[propRef] = currentValue;
                // 补种 default baseline (与 togglePropertyControlByPropRef 一致), 切到无该 key 的 state 时兜底
                const defaultData = this.getDefaultData();
                if (defaultData && (defaultData as any)[propRef] === undefined) {
                    (defaultData as any)[propRef] = currentValue;
                }
                // #C6: default baseline 也补受控 flag, 否则 apply 门控会 skip "有值无 flag" 的 default 兜底
                if (defaultData) {
                    (defaultData as any).$$controlledProps$$ = (defaultData as any).$$controlledProps$$ || {};
                    (defaultData as any).$$controlledProps$$[propRef] = propRef;
                }
            }
            this._propValue = (propData as any)[propRef];
        }
        else {
            // 无 propRef 映射的遗留 prop (正常不走到): 保留老 number key + $$propertyData$$ 兜底
            propData.$$propertyData$$ = propData.$$propertyData$$ || {};
            propData.$$controlledProps$$[propName] = propType;
            if ((propData.$$propertyData$$ as any)[propType] === undefined) {
                const currentValue = this.handleValue(propType);
                if (currentValue === undefined) {
                    StateErrorManager.warn("无法获取属性值，跳过数据创建", {
                        component: "StateSelectV2",
                        method: "addPropertyControl",
                        params: { propType: propName },
                    });
                    return;
                }
                (propData.$$propertyData$$ as any)[propType] = currentValue;
            }
            this._propValue = (propData.$$propertyData$$ as any)[propType];
        }

        // 🔧 第三步：兼容性处理 - 同步到旧的 changedProp 显示结构 (UI 用, 非数据轨)
        propData.$$changedProp$$ = propData.$$changedProp$$ || {};
        propData.$$changedProp$$[propName] = propType;

        // 🔧 第四步：自动同步到其他状态
        if (this.autoSyncEnabled) {
            this.syncPropToAllStatesInternal(propType);
        }

        // 🔧 第五步：设置为当前选中的属性 + 更新显示
        this._propKey = propType;
        this.setPropValue(propType);
        this.updateChangedProp();

        // 🔧 注意：界面标识变量(_currentDisplayProp)由togglePropertyControl统一管理

        StateErrorManager.info("属性控制已添加", {
            component: "StateSelectV2",
            method: "addPropertyControl",
            params: { propType: propName, propRef, isControlled: true },
        });
    }

    /** 🔧 架构重构：移除属性控制（只影响控制状态，保留数据） */
    private removePropertyControl(propType: EnumPropName) {
        const propData = this.getPropData();
        if (!propData) {
            StateErrorManager.warn("无法获取属性数据", {
                component: "StateSelectV2",
                method: "removePropertyControl",
                params: { propType: EnumPropName[propType] },
            });
            return;
        }

        const propName = EnumPropName[propType];

        // 🔧 第一步：从受控属性列表中移除
        if (propData.$$controlledProps$$) {
            delete propData.$$controlledProps$$[propName];
        }

        // 🔧 第二步：兼容性处理 - 从旧的changedProp中移除
        if (propData.$$changedProp$$) {
            delete propData.$$changedProp$$[propName];
        }

        // 🔧 第三步：保留属性数据不变
        // 重要：$$propertyData$$中的数据保持不变
        // 重要：直接存储的属性数据也保持不变

        // 🔧 第四步：如果是当前选中的属性，清除选择
        if (this._propKey === propType) {
            this._propKey = EnumPropName.Non;
            this._propValue = null;

            // 🔧 修复：隐藏属性值字段
            this.setPropValue(EnumPropName.Non);
        }

        // 🔧 第五步：不进行自动同步删除，保持数据完整性
        // 注释：不调用syncDeletePropFromAllStates，避免删除其他状态的数据

        // 🔧 第六步：更新显示
        this.updateChangedProp();

        // 🔧 注意：界面标识变量(_currentDisplayProp)由togglePropertyControl统一管理

        StateErrorManager.info("属性已从控制列表移除（数据完整保留）", {
            component: "StateSelectV2",
            method: "removePropertyControl",
            params: {
                propType: propName,
                dataStillExists: propData.$$propertyData$$ && propData.$$propertyData$$[propType] !== undefined,
                controlRemoved: !propData.$$controlledProps$$ || !propData.$$controlledProps$$[propName],
            },
        });
    }

    // #endregion 6.

    // #region 7. Inspector 按钮 API (Public)
    // 编辑器面板上手动触发的工具按钮

    /** 🔧 更新可用属性列表（刷新按钮调用） */
    public updateAvailableProps() {
        if (!CC_EDITOR) {
            return;
        }

        StateErrorManager.info("刷新属性列表", {
            component: "StateSelectV2",
            method: "updateAvailableProps",
        });

        // 强制刷新编辑器界面（简化实现）
        // 在Cocos Creator 2.x中，属性面板会自动刷新
    }

    /** 🔧 恢复：强制刷新属性检查器 */
    public forceRefreshInspector() {
        if (!CC_EDITOR) {
            return;
        }
        try {
            Editor.Utils.refreshSelectedInspector("node", this.node.uuid);
            StateErrorManager.info("属性检查器已刷新", {
                component: "StateSelectV2",
                method: "forceRefreshInspector",
            });
        }
        catch (error) {
            StateErrorManager.warn("刷新属性检查器失败", {
                component: "StateSelectV2",
                method: "forceRefreshInspector",
                params: { error: error.message },
            });
        }
    }


    /** 🔧 修复：从内存同步数据（包含复选框状态更新） */
    /**
     * inspector "📥 从内存同步数据" 按钮处理函数
     *
     * 用于在数据 / inspector 显示走样时手动恢复:
     *   - $$controlledProps$$ 从 $$changedProp$$ 兼容性重建
     *   - $$lastProp$$ 恢复 _propKey / _currentDisplayProp / _propValue 内存
     *   - 刷新一次 inspector
     */
    public syncDataFromMemory() {
        if (!CC_EDITOR) return;

        try {
            const propData = this.getPropData();
            if (!propData) {
                StateErrorManager.warn("无法获取属性数据", {
                    component: "StateSelectV2",
                    method: "syncDataFromMemory",
                });
                return;
            }

            // 确保元数据结构存在
            propData.$$controlledProps$$ = propData.$$controlledProps$$ || {};
            propData.$$changedProp$$ = propData.$$changedProp$$ || {};

            // 从 $$changedProp$$ 兼容性重建 $$controlledProps$$
            // (历史数据 / 早期版本可能只有 changedProp 没有 controlledProps)
            for (const propName in propData.$$changedProp$$) {
                if (propData.$$controlledProps$$[propName] === undefined) {
                    propData.$$controlledProps$$[propName] = propData.$$changedProp$$[propName];
                }
            }

            // 恢复 lastProp 选中状态 + _propValue 内存
            const lastProp = propData.$$lastProp$$;
            if (lastProp !== undefined && lastProp !== EnumPropName.Non) {
                this._propKey = lastProp;
                // W6-2c2: 双 key 读
                this._propValue = this.readPropByEnum(propData, lastProp);
                this._currentDisplayProp = lastProp;
                this.setPropValue(lastProp);
            }
            else {
                this._currentDisplayProp = EnumPropName.Non;
                this.setPropValue(EnumPropName.Non);
            }

            this.updateChangedProp();
            this.forceRefreshInspector();
        }
        catch (error) {
            StateErrorManager.error("数据同步失败", {
                component: "StateSelectV2",
                method: "syncDataFromMemory",
                params: { error: (error as Error).message },
            });
        }
    }

    /** 🔧 修复：删除属性（带确认对话框，修复序列化问题） */
    public deletePropertyWithConfirmation() {
        if (!CC_EDITOR) {
            return;
        }

        // 检查是否有选中的属性
        if (this._propKey === EnumPropName.Non || !this._propKey) {
            StateErrorManager.userFriendlyError(
                "没有选中的属性",
                "请先选择要删除的属性",
                { component: "StateSelectV2", method: "deletePropertyWithConfirmation" },
            );
            return;
        }

        // 🔧 修复：保存当前属性值，避免在回调中使用this引用
        const currentPropKey = this._propKey;
        const propName = EnumPropName[currentPropKey];

        // 🔧 优化：简化Editor.Dialog调用，静默降级处理
        const useEditorDialog = () => {
            try {
                if (typeof Editor !== "undefined" && Editor.Dialog && Editor.Dialog.messageBox) {
                    // 🔧 修复：使用简化的参数，避免传递复杂对象
                    const dialogOptions = {
                        type: "warning",
                        title: "确认删除属性",
                        message: `确定要删除属性 "${propName}" 吗？\n\n此操作将：\n• 从所有状态中删除该属性数据\n• 删除默认属性值\n• 无法撤销`,
                        buttons: ["取消", "确认删除"],
                        defaultId: 0,
                        cancelId: 0,
                    };

                    // 🔧 修复：使用箭头函数并捕获局部变量，避免this引用
                    const handleResponse = (response: number) => {
                        if (response === 1) { // 确认删除
                            this.performPropertyDeletion(currentPropKey);
                        }
                    };

                    Editor.Dialog.messageBox(dialogOptions, handleResponse);
                    return true;
                }
                return false;
            }
            catch (error) {
                // 🔧 优化：静默处理Editor.Dialog失败，不显示错误日志
                // 只在开发模式下记录调试信息
                if (CC_DEV) {
                    StateErrorManager.debug("Editor.Dialog不可用，降级到confirm对话框", {
                        component: "StateSelectV2",
                        method: "deletePropertyWithConfirmation",
                        params: {
                            reason: error.message,
                            propName: propName,
                        },
                    });
                }
                return false;
            }
        };

        // 🔧 优化：优雅降级机制，静默处理错误
        const useConfirmDialog = () => {
            try {
                const confirmed = confirm(`确定要删除属性 "${propName}" 吗？\n\n此操作将从所有状态中删除该属性数据，无法撤销！`);
                if (confirmed) {
                    this.performPropertyDeletion(currentPropKey);
                }
                return true;
            }
            catch (error) {
                // 🔧 优化：confirm对话框失败是极少见的情况，静默处理
                if (CC_DEV) {
                    StateErrorManager.debug("确认对话框调用失败", {
                        component: "StateSelectV2",
                        method: "deletePropertyWithConfirmation",
                        params: {
                            reason: error.message,
                            propName: propName,
                        },
                    });
                }
                return false;
            }
        };

        // 🔧 优化：按优先级尝试不同的确认方式，静默降级
        if (!useEditorDialog()) {
            if (!useConfirmDialog()) {
                // 🔧 优化：只有在所有对话框都失败时才显示错误
                // 这种情况极其罕见，通常是浏览器环境问题
                StateErrorManager.warn("无法显示任何确认对话框，删除操作已取消", {
                    component: "StateSelectV2",
                    method: "deletePropertyWithConfirmation",
                    params: { propName: propName },
                });
            }
        }
    }

    /** 🔧 架构重构：执行属性删除操作（彻底清除所有数据） */
    private performPropertyDeletion(propType: EnumPropName) {
        if (!CC_EDITOR || propType === EnumPropName.Non) {
            return;
        }

        const propName = EnumPropName[propType];

        try {
            // W6-2c2: 双 key 删 (string propRef + number, 兼容老数据)
            const propRef = enumToPropRef(propType);

            // 🔧 第一步：从当前状态删除所有相关数据
            const propData = this.getPropData();
            if (propData) {
                // 删除受控属性列表中的条目
                if (propData.$$controlledProps$$) {
                    delete propData.$$controlledProps$$[propName];
                }

                // W6-2c2: 删属性数据 (string + number 双删)
                if (propData.$$propertyData$$) {
                    if (propRef !== undefined) delete (propData.$$propertyData$$ as any)[propRef];
                    delete propData.$$propertyData$$[propType];
                }

                // 兼容性：删除旧结构中的数据
                if (propData.$$changedProp$$) {
                    delete propData.$$changedProp$$[propName];
                }
                // W6-2c2: 直接存储的属性 (string + number 双删)
                if (propRef !== undefined) delete (propData as any)[propRef];
                delete (propData as TPropDictionary)[propType];
            }

            // 🔧 第二步：从所有状态删除
            this.syncDeletePropFromAllStates(propType);

            // 🔧 第三步：删除默认属性
            const pageData = this.getPageData();
            if (pageData.$$default$$) {
                // 删除新结构中的数据
                if (pageData.$$default$$.$$controlledProps$$) {
                    delete pageData.$$default$$.$$controlledProps$$[propName];
                }
                if (pageData.$$default$$.$$propertyData$$) {
                    if (propRef !== undefined) delete (pageData.$$default$$.$$propertyData$$ as any)[propRef];
                    delete pageData.$$default$$.$$propertyData$$[propType];
                }
                // 兼容性：删除旧结构中的数据
                if (pageData.$$default$$.$$changedProp$$) {
                    delete pageData.$$default$$.$$changedProp$$[propName];
                }
                if (propRef !== undefined) delete (pageData.$$default$$ as any)[propRef];
                delete (pageData.$$default$$ as TPropDictionary)[propType];
            }

            // 🔧 第四步：清除当前选择
            if (this._propKey === propType) {
                this._propKey = EnumPropName.Non;
                this._propValue = null;
            }

            // 🔧 第五步：清除当前选中属性
            this._currentDisplayProp = EnumPropName.Non;

            // 🔧 第六步：更新显示
            this.updateChangedProp();

            StateErrorManager.info("属性彻底删除成功", {
                component: "StateSelectV2",
                method: "performPropertyDeletion",
                params: {
                    propName,
                    message: "属性及其所有数据已从所有状态中彻底删除",
                    deletedFromControlledProps: true,
                    deletedFromPropertyData: true,
                    deletedFromAllStates: true,
                },
            });
        }
        catch (error) {
            StateErrorManager.userFriendlyError(
                "属性删除失败",
                `删除属性 "${propName}" 时发生错误：${error.message}`,
                { component: "StateSelectV2", method: "performPropertyDeletion" },
            );
        }
    }

    // #endregion 7.
}

// back-compat 导出别名: 仅 JS 导出名, 不触发 @ccclass (引擎/panel 按 cid "StateSelectV2" 识别).
export { StateSelectV2 as StateSelect };
