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
import { StateComponentProps } from "./props/StateComponentProps";
import { StateNodeProps } from "./props/StateNodeProps";
import { StateWidgetProps } from "./props/StateWidgetProps";
import { StateController } from "./StateController";
import { EnumCtrlName, EnumExcludeSlot, EnumPropName, EnumStateName } from "./StateEnum";
import { StateErrorManager } from "./StateErrorManager";
import { PropHandlerManager } from "./StatePropHandler";
import { PropertyControlService } from "./StatePropertyControlService";
// W6-2a: 自定义组件 propRef 路径基础设施 (W6-1 引入, 本 task 接入)
// W6-4: SYSTEM_EXCLUDE 用于 inspector 排除清单 union (excludedPropsDisplay getter)
import { listTrackableProps, TrackableProp, SYSTEM_EXCLUDE } from "./PrefabIntrospection";
import { cloneValueByType, eqValueByType } from "./NestedCtrlData";
import { isEnumMappedPropRef, ENUM_TO_PROPREF, PROPREF_TO_ENUM, LEGACY_DROPPED_ENUMS, enumToPropRef } from "./EnumPropRefMap";
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
    /** 上次选择的状态 */
    // $$lastState$$?: number,
    /** 默认状态属性 */
    $$default$$?: TProp
    [state: number]: TProp
};

type TCtrl = {
    [stateId: string]: TPage
};

@ccclass("StateSelect")
@menu("State/StateSelect")
@executeInEditMode()
@disallowMultiple()
export class StateSelect extends cc.Component {
    // #region 1. 序列化字段与字段访问器
    // cocos @property 层 + 主要 getter/setter, 必须留在 StateSelect 类上
    // (服务于反射 / 编辑器 inspector / 场景序列化)

    /** root节点所有的ctrl */
    @property({ visible: false })
    private _ctrlsMap: { [ctrlId: string]: StateController } = {};

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

    // #endregion

    /**
     * 节点基础属性分组 (Active/Position/Scale/Color/Size/Euler/Anchor/Opacity).
     *
     * W6-4: inspector 视觉隐藏 (visible:false). ts 字段保留作 c3 facade —
     * 老路径 (PropertyControlService / PropHandlerManager 等) 仍依赖 owner 引用,
     * 在 __preload 中赋 owner = this. c3 才真删 props/* 文件.
     */
    @property({
        type: StateNodeProps,
        displayName: "节点属性",
        tooltip: "节点基础属性（Active, Position, Scale, Color, Size, Euler, Anchor, Opacity）",
        editorOnly: true,
        serializable: false,
        visible: false,
    })
    public nodeProps = new StateNodeProps();

    /** 组件属性分组 (Label, Sprite, Button, Toggle 等). W6-4 visible:false. */
    @property({
        type: StateComponentProps,
        displayName: "组件属性",
        tooltip: "组件相关属性（Label, Sprite, Button, Toggle 等）",
        editorOnly: true,
        serializable: false,
        visible: false,
    })
    public componentProps = new StateComponentProps();

    /** Widget 布局属性分组. W6-4 visible:false. */
    @property({
        type: StateWidgetProps,
        displayName: "Widget属性",
        tooltip: "Widget 布局相关属性",
        editorOnly: true,
        serializable: false,
        visible: false,
    })
    public widgetProps = new StateWidgetProps();

    // #region W6-4 inspector 排除清单 UI
    // 三件套 inspector @property: 排除清单 readonly + 添加排除下拉 + 恢复跟随下拉
    // 走 cocos 2.x 原生 @property + cc.Class.Attr.setClassAttr 动态注入 enumList (套 TASK-001 homePageState 模板).
    // 不在 __preload 之前实例化, 因为 SYSTEM_EXCLUDE 需要 require IntrospectionMod.

    /**
     * W6-4: inspector 显示当前所有被排除的 prop (SYSTEM_EXCLUDE + _userExcludedProps).
     * Readonly 列表, 用户在下方 + 添加排除 / - 恢复跟随 下拉操作.
     */
    @property({ displayName: "排除跟随", tooltip: "当前被排除的 prop 列表 (系统 + 用户). 系统部分不可恢复.", readonly: true })
    public get excludedPropsDisplay(): string[] {
        // W6-4 C 方案: inspector 渲染时机做 reconcile (idempotent, O(N) 小数组). 用户在 _userExcludedProps
        // 数组 inspector +/- 后, 这里 diff 上次快照 → 触发 togglePropertyControl 同步跟随状态.
        this.reconcileUserExcluded();
        return [...SYSTEM_EXCLUDE, ...(this._userExcludedProps || [])];
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
                try { this.togglePropertyControl(propRef, false); }
                catch (e) { StateErrorManager.warn("reconcileUserExcluded: 排除失败", { component: "StateSelect", method: "reconcileUserExcluded", params: { propRef, error: (e as Error).message } }); }
            }
        }
        // 删除项: 在 last 不在 current → 重新跟随
        for (const propRef of last) {
            if (!currentSet.has(propRef)) {
                try { this.togglePropertyControl(propRef, true); }
                catch (e) { StateErrorManager.warn("reconcileUserExcluded: 恢复跟随失败", { component: "StateSelect", method: "reconcileUserExcluded", params: { propRef, error: (e as Error).message } }); }
            }
        }
        this._lastSeenExcluded = current.slice();
        // 顺便刷下拉选项 (排除清单变, 下拉可选项要跟着变)
        this.refreshExcludeEnumLists();
    }

    /**
     * W6-4 C 方案: "+ 添加排除" 下拉选项缓存 (instance scope, 非序列化).
     * enumList value=v 对应 _addExcludeOptions[v-1] (value=0 是 sentinel "(选一个...)").
     * refreshExcludeEnumLists 注入 enumList 时同步刷新.
     */
    private _addExcludeOptions: string[] = [];

    /** W6-4 hotfix2 #3: 排除下拉搜索关键字 (instance, 不序列化), 大小写不敏感 substring 匹配 */
    private _excludeFilter: string = "";

    /**
     * W6-4 hotfix2 #3: 搜索关键字过滤 "+ 添加排除" 下拉选项. cocos 2.x 长下拉无原生搜索,
     * 这里加 string 输入字段, 输入后失焦/Enter 触发 setter → refresh enumList 只保留匹配项.
     */
    @property({ displayName: "🔍 搜索 (排除)", tooltip: "输入关键字过滤添加排除下拉. 大小写不敏感 substring. 空 = 不过滤." })
    public get excludeFilter(): string {
        return this._excludeFilter;
    }

    public set excludeFilter(v: string) {
        if (!CC_EDITOR) return;
        this._excludeFilter = (v == null) ? "" : String(v);
        this.refreshExcludeEnumLists();
    }

    /**
     * W6-4 C 方案: "+ 添加排除" 快捷下拉. enumList index=0 是 sentinel "(选一个...)", 真实选项 value 从 1 起.
     * getter 永远返回 0 → 用户操作完显示回到 sentinel (符合"未选"语义). setter 收 0 noop, 收 >0 处理.
     * 处理逻辑: 反查 _addExcludeOptions[value-1] 得 propRef → push 到 _userExcludedProps (cocos 数组同步).
     * 移除跟随由 reconcileUserExcluded 在下一次 inspector 渲染时统一做. 删除走 cocos 数组原生 - 按钮 (不再有 removeExcludeTrigger).
     */
    @property({ type: EnumExcludeSlot, displayName: "+ 添加排除", tooltip: "从当前跟随中选一个 prop 加入排除清单 (用 cocos 数组 - 按钮恢复跟随)" })
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
        } catch (e) {
            StateErrorManager.warn("refreshExcludeEnumLists: listTrackableProps 失败", {
                component: "StateSelect",
                method: "refreshExcludeEnumLists",
                params: { error: (e as Error).message },
            });
        }
        // 当前可跟随 = trackable - SYSTEM - user (用户能从中再选一个排除)
        let addList = trackableRefs.filter(r => !systemExcluded.has(r) && !userExcluded.has(r));
        // W6-4 hotfix2 #3: 搜索关键字过滤 (substring, 大小写不敏感, 空关键字不过滤)
        const kw = (this._excludeFilter || "").trim().toLowerCase();
        if (kw) addList = addList.filter(r => r.toLowerCase().includes(kw));
        // enumList[0] 是 sentinel, 真实选项 value 从 1 起. setter 反查 _addExcludeOptions[v-1].
        this._addExcludeOptions = addList;
        const sentinelName = kw ? `(选一个加入排除, 过滤: ${kw})` : "(选一个加入排除)";
        const addEnum = [
            { name: sentinelName, value: 0 },
            ...addList.map((r, i) => ({ name: r, value: i + 1 })),
        ];
        // @ts-expect-error setClassAttr 在 cocos 2.x d.ts 中未声明
        cc.Class.Attr.setClassAttr(this, "addExcludeTrigger", "enumList", addEnum);
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
    @property({
        type: [cc.String],
        displayName: "用户排除清单",
        tooltip: "用户手动排除的 prop 列表 (除 SYSTEM_EXCLUDE 外). 数组 +/- 按钮可直接增删. 删项 = 重新跟随, 加项 = 排除跟随.",
        visible: true,
    })
    public _userExcludedProps: string[] = [];

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

    /** 用于检测父节点变化 */
    private lastParent: cc.Node = null;
    private parentCheckInterval: ReturnType<typeof setInterval> = null;

    // #region 控制器当前状态 (StateSelect 上的切 state 快捷入口, 镜像 ctrl.selectedIndex)
    @property({ type: EnumStateName, displayName: "state", tooltip: "切到指定 state (镜像 controller.selectedIndex, 改这里 = 改 ctrl)" })
    public get ctrlState() {
        const ctrl = this.getCurrCtrl();
        if (!ctrl) {
            StateErrorManager.warn("ctrlState getter: 控制器为空", {
                component: "StateSelect",
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
                component: "StateSelect",
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
                component: "StateSelect",
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
            component: "StateSelect",
            method: "propKey.setter",
            params: { oldPropKey: EnumPropName[this._propKey], newPropKey: EnumPropName[value] },
        });

        // 🔧 第一步：验证控制器有效性
        const ctrl = this.getCurrCtrl();
        if (!ctrl) {
            StateErrorManager.warn("propKey setter: 控制器为空", {
                component: "StateSelect",
                method: "propKey.setter",
            });
            return;
        }

        // 🔧 第二步：处理属性设置逻辑
        if (value === EnumPropName.Non) {
            this._propKey = EnumPropName.Non;
            this.setPropValue(EnumPropName.Non);
            StateErrorManager.debug("设置属性为Non", {
                component: "StateSelect",
                method: "propKey.setter",
            });
        }
        else {
            this.handleValidPropSelection(value);
        }

        // 🔧 第三步：更新UI显示
        this.updateChangedProp();

        StateErrorManager.info("属性键设置完成", {
            component: "StateSelect",
            method: "propKey.setter",
            params: { finalPropKey: EnumPropName[this._propKey] },
        });
    }

    /** 🔧 新增：处理有效属性选择 */
    private handleValidPropSelection(value: EnumPropName) {
        const propValue = this.handleValue(value);
        if (propValue === undefined) {
            StateErrorManager.warn("无法获取属性值", {
                component: "StateSelect",
                method: "handleValidPropSelection",
                params: { propType: EnumPropName[value] },
            });
            // 🔧 如果无法获取属性值，保持当前状态不变
            return;
        }

        // 🔧 第二步：设置属性状态（确保属性值有效后再设置）
        this._propKey = value;
        this.setPropValue(value); // 显示属性值字段

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
                component: "StateSelect",
                method: "__preload",
            });
            return;
        }
        this._isPreloaded = true;

        // W6-2c1: 极简 migration framework, 当前只丢 GrayScale (LEGACY_DROPPED_ENUMS),
        // c2 扩 ENUM_TO_PROPREF 36 项 number→string key 迁移. 在所有 __preload 主逻辑之前
        // 跑一次, 确保后续 updateCtrlName / autoOptIn / dispatch 看到的 _ctrlData 已清理.
        this.migrateLegacyCtrlData();

        // 初始化嵌套 CCClass 的 owner 引用
        this.nodeProps.owner = this;
        this.componentProps.owner = this;
        this.widgetProps.owner = this;

        // IMPL-001.6: 通知控制器缓存失效
        this.notifyControllerCacheDirty();

        StateErrorManager.debug("开始StateSelect预加载", {
            component: "StateSelect",
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
                    component: "StateSelect",
                    method: "__preload",
                    params: { selectedCtrlId: this.currCtrlId, availableControllers: ctrlIdKeys.length },
                });
                this.updateCtrlPage(this.getCurrCtrl());
                this.refProp();
            }
            else {
                // 没有找到控制器，清理状态
                StateErrorManager.warn("未找到可用的控制器", {
                    component: "StateSelect",
                    method: "__preload",
                });
                // @ts-expect-error _onPreDestroy is not typed
                this._onPreDestroy();
            }
        }
        else {
            // 已有当前控制器，更新页面并恢复属性选择
            StateErrorManager.debug("使用现有控制器", {
                component: "StateSelect",
                method: "__preload",
                params: { currentCtrlId: this.currCtrlId },
            });
            this.updateCtrlPage(this.getCurrCtrl());
            this.refProp();
        }

        // TASK-003: 挂载自动接入 — 新挂 StateSelect / 当前 ctrl 下从未有过任何 controlled prop 时,
        // 遍历所有 applicable prop (节点自带 + 组件存在的) 一次性 togglePropertyControl(true).
        // 用户不想要的在 inspector 手动 ☐ 取消即可.
        //
        // 守卫: 用 hasAnyControlledProps() 判断, 不能简单看 _ctrlData 是否为空 — getPropData 在
        // __preload 内部路径中会自动创建 _ctrlData[ctrlId][state]={} 占位条目, 即使没任何 controlled
        // 也会非空. hasAnyControlledProps 扫所有 state 的 $$controlledProps$$, 严格判定用户/迁移
        // 是否真的接入过任何 prop. 存量用户主动 opt-out 后某个 prop $$controlledProps$$ 没有该 key,
        // 但其它 controlled prop 还在 → hasAnyControlledProps=true → 跳过自动接入, 行为零变更.
        if (this.currCtrlId && !this.hasAnyControlledProps()) {
            this.autoOptInApplicableProps();
        }

        // W6-2a: 老路径只覆盖 EnumPropName 内置 prop, 自定义 @ccclass 组件的 @property 字段
        // (e.g. UserComp.heatLevel) 不在 EnumPropName 表里, 走新的 propRef 字符串路径接入.
        // 这里在老路径接入之后 (hasAnyControlledProps 守卫已被老路径破除), 再扫一次"剩余"
        // trackable propRef 自动接入. idempotent — 已接入的 propRef 直接跳过.
        if (this.currCtrlId) {
            this.autoOptInCustomComponentProps();
        }

        // W6-4: inspector 排除清单下拉 enumList 初始化 (idempotent, 重新 __preload 也可调).
        // 必须在所有 controlled 状态稳定后调 (autoOptIn 完, _userExcludedProps 已应用).
        this.refreshExcludeEnumLists();

        StateErrorManager.info("StateSelect预加载完成", {
            component: "StateSelect",
            method: "__preload",
            params: { finalCtrlId: this.currCtrlId, propKey: EnumPropName[this._propKey] },
        });
    }

    /**
     * TASK-003: 当前 ctrl 下是否有任何 state 已接入过 controlled prop.
     * 用来区分"新挂 / 迁移后 / 全部取消跟随后的零态" vs "存量用户已有接入".
     * 仅看 $$controlledProps$$ 是否有非 Non 的 key, 不依赖 _ctrlData 是否为空 (getPropData
     * 会创建空 propData 占位).
     */
    private hasAnyControlledProps(): boolean {
        if (!this.currCtrlId) return false;
        const ctrlPage = this._ctrlData[this.currCtrlId];
        if (!ctrlPage) return false;
        for (const stateKey of Object.keys(ctrlPage)) {
            // 跳过 meta key ($$default$$ 等), 仅看数字 state index 的 propData
            if (stateKey.startsWith("$$")) continue;
            const propData = ctrlPage[stateKey as any];
            if (!propData) continue;
            const cp = propData.$$controlledProps$$ || propData.$$changedProp$$;
            if (cp && Object.keys(cp).length > 0) return true;
        }
        return false;
    }

    /**
     * TASK-003: 把节点上所有 applicable prop 一次性 togglePropertyControl(true).
     * 仅 __preload 在零态 (hasAnyControlledProps()=false) 时调用, idempotent no-op 重复调.
     * 不刷新 inspector (在 __preload 上下文调用, 调用方负责后续 refresh).
     */
    private autoOptInApplicableProps(): void {
        if (!CC_EDITOR) return;
        if (!this.node) return;
        const applicable = PropertyControlService.scanAvailableProperties(this.node);
        let enabled = 0;
        for (const propType of applicable) {
            if (propType === EnumPropName.Non) continue;
            if (this.isPropertyControlled(propType)) continue;
            try {
                this.togglePropertyControl(propType, true);
                enabled++;
            }
            catch (e) {
                StateErrorManager.warn("autoOptIn: togglePropertyControl 失败", {
                    component: "StateSelect",
                    method: "autoOptInApplicableProps",
                    params: { propType: EnumPropName[propType], error: (e as Error).message },
                });
            }
        }
        StateErrorManager.info("StateSelect 挂载自动接入完成", {
            component: "StateSelect",
            method: "autoOptInApplicableProps",
            params: { enabledCount: enabled, applicableCount: applicable.length },
        });
    }

    /**
     * W6-2a: state controller 自身组件名单. 这些 component 是 state machine 基础设施,
     * 不该被自己控制. (W6-2c 会从 spec 抽出更完整的 controller-system blacklist.)
     */
    private static readonly CONTROLLER_SYSTEM_COMPS: ReadonlyArray<string> = [
        "StateSelect", "StateController", "StateValue",
    ];

    /**
     * W6-2a: 自定义组件 @ccclass 的 @property 字段自动接入 (走 propRef 字符串路径).
     *
     * 过滤策略:
     *   1) compName === "cc.Node" — 内置节点字段, 全归老路径 (EnumPropName.Active/Position/Color
     *      等), 不接入 string key. 即使部分 EnumPropName 是 AMBIGUOUS 复合 (Position=x/y/z,
     *      Anchor=anchorX/anchorY 等), 它们已被 EnumPropName 整体管理, 不重复接入 sub-prop.
     *   2) compName in CONTROLLER_SYSTEM_COMPS — state machine 自身的 component, 不该被自己控制
     *   3) isEnumMappedPropRef(propRef) — 已被 ENUM_TO_PROPREF 覆盖, 走老路径
     *   4) tp.readonly — 只读 (getter only), 写不进去
     *   5) _userExcludedProps 用户黑名单 (W6-1 占位, panel 后续维护)
     *
     * 剩下的是真正用户自定义业务组件 prop, 接入到**所有 state** (与老路径 syncPropToAllStates 等价).
     * idempotent — 已在 controlledProps 里的 propRef 跳过.
     *
     * SYSTEM_EXCLUDE 在 listTrackableProps 内部已过滤, 这里不重复.
     */
    private autoOptInCustomComponentProps(): void {
        if (!CC_EDITOR) return;
        if (!this.node) return;
        const userExcluded = new Set(this._userExcludedProps || []);
        const systemComps = new Set(StateSelect.CONTROLLER_SYSTEM_COMPS);
        let trackable: TrackableProp[] = [];
        try {
            trackable = listTrackableProps(this.node);
        } catch (e) {
            StateErrorManager.warn("autoOptInCustomComponentProps: listTrackableProps 失败", {
                component: "StateSelect",
                method: "autoOptInCustomComponentProps",
                params: { error: (e as Error).message },
            });
            return;
        }
        let enabled = 0;
        for (const tp of trackable) {
            // cc.Node 内置字段全归老路径
            if (tp.compName === "cc.Node") continue;
            // state controller 自身组件不接入
            if (systemComps.has(tp.compName)) continue;
            // 已被 EnumPropName 老路径覆盖
            if (isEnumMappedPropRef(tp.propRef)) continue;
            // readonly 字段 (getter only) 写不进去, 不接入
            if (tp.readonly) continue;
            // 用户黑名单
            if (userExcluded.has(tp.propRef)) continue;
            // 已接入 (e.g. 二次 __preload) 跳过
            if (this.isPropertyControlledByPropRef(tp.propRef)) continue;
            try {
                this.togglePropertyControlByPropRefAllStates(tp.propRef, true);
                enabled++;
            } catch (e) {
                StateErrorManager.warn("autoOptInCustomComponentProps: togglePropertyControlByPropRef 失败", {
                    component: "StateSelect",
                    method: "autoOptInCustomComponentProps",
                    params: { propRef: tp.propRef, error: (e as Error).message },
                });
            }
        }
        StateErrorManager.info("StateSelect 自定义组件 prop 自动接入完成", {
            component: "StateSelect",
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
        const tp = this.resolveTrackableProp(propRef);
        const cocosType = tp ? tp.cocosType : undefined;
        const current = this.readNodeValueByPropRef(propRef);
        const cloneOf = () => current === undefined ? undefined : cloneValueByType(current, cocosType);
        const writeOne = (data: TProp) => {
            if (!data) return;
            data.$$controlledProps$$ = data.$$controlledProps$$ || {};
            if (on) {
                data.$$controlledProps$$[propRef] = propRef as any;
                if ((data as any)[propRef] === undefined) {
                    const v = cloneOf();
                    if (v !== undefined) (data as any)[propRef] = v;
                }
            } else {
                delete data.$$controlledProps$$[propRef];
            }
        };
        // default 槽
        if (pageData.$$default$$ == null) pageData.$$default$$ = {} as TProp;
        writeOne(pageData.$$default$$);
        // 所有 state
        for (let i = 0; i < ctrl.states.length; i++) {
            if (pageData[i] == null) pageData[i] = {} as TProp;
            writeOne(pageData[i]);
        }
    }

    /**
     * W6-2a: propRef 字符串版本的 isPropertyControlled. 查 ctrlData 内层 $$controlledProps$$
     * 是否含该 propRef 作 key.
     *
     * 双 key 共存: 内置 prop 在 controlledProps 中 key 是 EnumPropName 反查 name (e.g. "Active"),
     * 自定义 prop 在 controlledProps 中 key 是 propRef 字符串 (e.g. "MyComp.heat"). 本方法仅查后者.
     */
    public isPropertyControlledByPropRef(propRef: string): boolean {
        const propData = this.getPropData();
        if (!propData || !propData.$$controlledProps$$) return false;
        return propData.$$controlledProps$$[propRef] !== undefined;
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
            }
        } else {
            delete propData.$$controlledProps$$[propRef];
            // 数据保留, 与 EnumPropName 版 removePropertyControl 一致
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
        } catch (_) {
            return undefined;
        }
    }

    /**
     * W6-2a: 按 propRef 从节点上读当前值. cc.Node.* 走 node[propKey], 其它走 component[propKey].
     * 返回 undefined 表示组件不存在或 prop 不存在.
     *
     * 注意: 用 indexOf('.') (第一个点) 分隔. 这里仅服务于 W6-2a 自动接入路径 (filter
     * out compName==='cc.Node' 之外的自定义组件), 自定义组件 compName 不含 '.', 所以正确.
     * 如果要覆盖 'cc.Node.active' / 'cc.Label.string' 等内置 propRef, 必须用
     * readPropFromNodeByPropRef (W6-2a-fixup 新增, lastIndexOf 分隔).
     */
    private readNodeValueByPropRef(propRef: string): any {
        const dotIdx = propRef.indexOf(".");
        if (dotIdx <= 0) return undefined;
        const compName = propRef.substring(0, dotIdx);
        const propKey = propRef.substring(dotIdx + 1);
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
     */
    private writeNodeValueByPropRef(propRef: string, value: any): void {
        const dotIdx = propRef.indexOf(".");
        if (dotIdx <= 0) return;
        const compName = propRef.substring(0, dotIdx);
        const propKey = propRef.substring(dotIdx + 1);
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
        // 录制现在走 prefab diff 路径 (StateController.startRecording → snapshot → 切 state/stop 时 diff commit),
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
                // 内层 $$propertyData$$: 同规则扫 (number key 也迁 string key)
                if (propData.$$propertyData$$) {
                    sweepPropDictionary(propData.$$propertyData$$);
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
     * 公开 internal: StateController.promptDirtyAndStart 在外部 commit 时也走此 helper, 否则
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
     * 公开 internal: StateController.promptDirtyAndStart "保存到当前 state" 路径也走此 helper.
     */
    public writePropByEnum(propData: any, propType: EnumPropName, value: TPropValue): void {
        if (!propData) return;
        const propRef = enumToPropRef(propType);
        if (propRef !== undefined) {
            propData[propRef] = value;
            delete (propData as TPropDictionary)[propType];
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
     * 当StateSelect组件创建/销毁/移动时调用
     */
    private notifyControllerCacheDirty(): void {
        // 直接向上找父链上最近的 StateController, 不依赖 this.currCtrlId.
        // 因为 __preload 内调用此方法时 currCtrlId 还没被设置, getCurrCtrl() 会
        // 返回 undefined, markCacheDirty 不被调用 → 导致"ctrl 比 select 早创建,
        // 第 2+ 个 select 永远不在 cache, 切 state 时跳过它"的 bug.
        let parent = this.node ? this.node.parent : null;
        while (parent && parent.isValid) {
            const ctrl = parent.getComponent(StateController);
            if (ctrl) {
                ctrl.markCacheDirty();
                StateErrorManager.debug("已通知控制器缓存失效", {
                    component: "StateSelect",
                    method: "notifyControllerCacheDirty",
                    params: { ctrlName: ctrl.ctrlName },
                });
                return;
            }
            parent = parent.parent;
        }
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

            // 只有当有Position属性被控制时才需要转换坐标
            const pageData = this.getPageData();
            let hasPositionControl = false;
            for (const state in pageData) {
                if (pageData[state] && pageData[state][EnumPropName.Position] !== undefined) {
                    hasPositionControl = true;
                    break;
                }
            }

            if (hasPositionControl) {
                this.parentChanged(oldParent);
            }
        }
    }

    /** 处理控制器承接 */
    private handleControllerTransition(oldParent: cc.Node, newParent: cc.Node) {
        StateErrorManager.debug("开始控制器承接处理", {
            component: "StateSelect",
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
            component: "StateSelect",
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
                    component: "StateSelect",
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

                // 5. 更新界面
                this.updateCtrlPage(newCtrl);
                this.refProp();

                StateErrorManager.info("控制器承接完成", {
                    component: "StateSelect",
                    method: "handleControllerTransition",
                    params: { fromController: oldCtrl.ctrlName, toController: newCtrl.ctrlName },
                });
            }
        }
        else if (newCtrl && !oldCtrl) {
            // 从无控制器环境移动到有控制器环境
            StateErrorManager.info("绑定到新控制器", {
                component: "StateSelect",
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
    private adaptDataToNewController(oldData: TPage, newCtrl: StateController): TPage {
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
    private selectBestController(newCtrls: StateController[], oldCtrl: StateController): StateController {
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
                component: "StateSelect",
                method: "updateCtrlName",
                params: { hasNode: !!node, isValid: node?.isValid },
            });
            return;
        }

        StateErrorManager.debug("开始更新控制器名称", {
            component: "StateSelect",
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
            component: "StateSelect",
            method: "updateCtrlName",
            params: { controllersFound: ctrls.length, mappedControllers: Object.keys(this._ctrlsMap).length },
        });
    }

    /** 获取所有的Ctrl */
    private getCtrls(node: cc.Node): StateController[] {
        if (!node || !CC_EDITOR) {
            if (!node) {
                StateErrorManager.debug("getCtrls: 节点为空", {
                    component: "StateSelect",
                    method: "getCtrls",
                });
            }
            return [];
        }
        const ctrls = node.getComponents(StateController);
        if (ctrls.length) {
            this._root = node;
            StateErrorManager.debug("找到控制器", {
                component: "StateSelect",
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
    public updateCtrlPage(ctrl: StateController, deleteIndex?: number) {
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
    public updateStateMove(ctrl: StateController, moveInfo: { fromIndex: number, toIndex: number }) {
        if (!CC_EDITOR) {
            return;
        }

        if (!ctrl || ctrl.ctrlId !== this.currCtrlId) {
            return;
        }

        if (!moveInfo || moveInfo.fromIndex === undefined || moveInfo.toIndex === undefined) {
            StateErrorManager.warn("状态移动信息无效", {
                component: "StateSelect",
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
                component: "StateSelect",
                method: "updateStateMove",
                params: { fromIndex, toIndex, stateCount: ctrl.states.length },
            });
            return;
        }

        const pageData = this.getPageData();
        this.reorderStateData(pageData, fromIndex, toIndex, ctrl.states.length);
        this.updateChangedProp();

        StateErrorManager.info("状态数据顺序已同步", {
            component: "StateSelect",
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
     * 用 JSON.parse(JSON.stringify(x)) 一刀切深拷贝, 避免手抄字段漏掉嵌套结构 (Color/Size/Vec3 等
     * 这里都已被 StatePropHandler 序列化为普通 object/number)。
     */
    public updateStateCopy(ctrl: StateController, copyInfo: { fromIndex: number, toIndex: number }) {
        if (!CC_EDITOR) {
            return;
        }

        if (!ctrl) {
            return;
        }

        if (!copyInfo || copyInfo.fromIndex === undefined || copyInfo.toIndex === undefined) {
            StateErrorManager.warn("状态复制信息无效", {
                component: "StateSelect",
                method: "updateStateCopy",
                params: { copyInfo },
            });
            return;
        }

        const { fromIndex, toIndex } = copyInfo;
        const statesLength = ctrl.states.length;

        if (fromIndex < 0 || toIndex < 0 || fromIndex >= statesLength || toIndex >= statesLength) {
            StateErrorManager.warn("状态复制索引越界, 取消同步", {
                component: "StateSelect",
                method: "updateStateCopy",
                params: { fromIndex, toIndex, statesLength },
            });
            return;
        }

        const pageData = this.getPageData(ctrl.ctrlId);
        if (!pageData) {
            return;
        }

        // 1) 右移 [toIndex .. statesLength-2] 给新槽位腾位置 (从右往左以避免覆盖)
        for (let i = statesLength - 1; i > toIndex; i--) {
            const prev = pageData[i - 1];
            if (prev != void 0) {
                pageData[i] = prev;
            }
            else {
                delete pageData[i];
            }
        }

        // 2) 深拷贝 fromIndex 槽位到 toIndex
        const source = pageData[fromIndex];
        if (source != void 0) {
            pageData[toIndex] = JSON.parse(JSON.stringify(source));
        }
        else {
            delete pageData[toIndex];
        }

        this.updateChangedProp();

        StateErrorManager.info("状态数据已深拷贝", {
            component: "StateSelect",
            method: "updateStateCopy",
            params: { fromIndex, toIndex, statesLength },
        });
    }

    /** 🔧 新增：处理状态删除逻辑 */
    private handleStateDelete(ctrl: StateController, deleteIndex: number) {
        StateErrorManager.debug("开始处理状态删除", {
            component: "StateSelect",
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
                component: "StateSelect",
                method: "handleStateDelete",
                params: { deleteIndex: deleteIndex, stateCount: ctrl.states.length },
            });
            return;
        }

        const pageData = this.getPageData();
        if (!pageData) {
            StateErrorManager.warn("页面数据为空", {
                component: "StateSelect",
                method: "handleStateDelete",
            });
            return;
        }

        // 🔧 执行数据迁移：将后面的状态数据前移
        this.migrateStateData(pageData, deleteIndex, ctrl.states.length);

        // 🔧 同步处理属性清理
        this.cleanupDeletedStateProps(pageData, ctrl, ctrl.states.length);

        StateErrorManager.info("状态删除处理完成", {
            component: "StateSelect",
            method: "handleStateDelete",
            params: { deletedIndex: deleteIndex, remainingStates: ctrl.states.length },
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
    private cleanupDeletedStateProps(pageData: TPage, ctrl: StateController, deletedStateIndex: number) {
        // 🔧 获取被删除状态的属性数据
        const deletedStateData = pageData[deletedStateIndex];
        if (!deletedStateData || typeof deletedStateData !== "object") {
            return;
        }

        // 🔧 检查每个属性是否在其他状态中还存在
        const propKeys = this.extractNumericPropKeys(deletedStateData);
        const defaultData = pageData.$$default$$;
        for (const prop of propKeys) {
            // 🔧 检查其他状态是否还有这个属性
            const isUsedInOtherStates = this.isOtherHans(ctrl, prop);
            if (!isUsedInOtherStates && defaultData && defaultData[prop] != void 0) {
                // 🔧 如果其他状态都没有这个属性，从默认状态中删除
                delete defaultData[prop];
            }
        }

        // 🔧 更新已更改属性的显示
        this.updateChangedProp();
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
    private updateStateEnumList(ctrl: StateController) {
        if (!ctrl || !ctrl.states) {
            StateErrorManager.warn("控制器或状态数据无效", {
                component: "StateSelect",
                method: "updateStateEnumList",
            });
            return;
        }

        // 🔧 生成状态枚举数组
        const enumList = ctrl.states.map((state, index) => {
            if (!state || typeof state.name !== "string") {
                StateErrorManager.warn("状态数据无效", {
                    component: "StateSelect",
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
                component: "StateSelect",
                method: "updateStateEnumList",
                params: { error: error.message },
            });
        }
    }

    /** 控制器被删除 */
    public updateDelete(ctrl: StateController) {
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
     * W6-2c2: 提取 propData 中所有 EnumPropName 数字 propType.
     *   - string propRef key 反查 PROPREF_TO_ENUM 命中 → 返回对应 EnumPropName
     *   - number key (老数据未迁) → 直接返回
     *   - 自定义 propRef (不在反查表) / $$xxx$$ 元数据 → 跳过
     *
     * 去重后返回. updateState 用这个把内置 prop 数据桥回 EnumPropName 老路径派发.
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
                continue;
            }
            // string propRef → 反查 EnumPropName
            const enumNum = PROPREF_TO_ENUM[key];
            if (enumNum !== undefined && !seen.has(enumNum)) {
                seen.add(enumNum);
                out.push(enumNum as EnumPropName);
            }
        }
        return out;
    }

    // #endregion 4.

    // #region 5. 属性同步与应用 (state 切换 → node/component apply)

    /** 确保节点在隐藏的时候也会执行__preload（负责stateSelect的显示） */
    public updatePreLoad(ctrl: StateController) {
        if (!ctrl || ctrl.ctrlId != this.currCtrlId) {
            return;
        }
        this.__preload();
    }

    /** 更新属性 */
    public updateProp(ctrl: StateController) {
        if (!ctrl || ctrl.ctrlId != this.currCtrlId) {
            return;
        }
        this.refProp();
    }

    // ==============更具控制器更新的状态 主要代码================
    // Wave 2 T11: _isFromCtrl 标记位删除 (原本用于 setDefaultProp 期间抑制循环写;
    // setDefaultProp 已随 cc 事件 hook 一起退役, 标记位不再有意义)。
    /** 更新状态 */
    public updateState(ctrl: StateController) {
        if (!ctrl) {
            StateErrorManager.warn("updateState: 控制器为空", {
                component: "StateSelect",
                method: "updateState",
            });
            return;
        }

        StateErrorManager.debug("开始状态更新", {
            component: "StateSelect",
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

        // 🔧 第三步：构建属性更新批次
        const updateBatch: { type: EnumPropName, value: TPropValue }[] = [];
        const processedKeys = new Set<number>();

        // W6-2c2: ENUM_TO_PROPREF 36 + AMBIGUOUS 3 = 39 项内置 prop 数据存在 string propRef key 下.
        // 但 PropHandler 体系按 EnumPropName 数字派发, updateBatch 仍按 propType 走老路径.
        // 用 PROPREF_TO_ENUM 反查 string propRef → EnumPropName, 把 updateBatch 桥到老路径.
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

        StateErrorManager.debug("构建属性更新批次", {
            component: "StateSelect",
            method: "updateState",
            params: { batchSize: updateBatch.length, autoSyncEnabled: this.autoSyncEnabled },
        });

        // 🔧 第四步：批量应用UI更新
        this.batchUpdateUI(updateBatch);

        // W6-2a: 数字 key 走 batchUpdateUI 上面 EnumPropName/PropHandler, 不覆盖 propData 内层
        // string propRef key. 这里单独扫 propRef key, 走 cocos type 分发写回 (cc.Node[propKey] /
        // component[propKey] = value). 不进 updateBatch 是因为 PropHandler 体系只识别 EnumPropName.
        this.applyPropRefKeysToNode(propData, defaultData);

        // 🔧 第五步：根据同步模式恢复属性选择
        if (shouldKeepPropKey) {
            // 自动同步模式：保持当前选中的属性
            this.propKey = currentPropKey;
            StateErrorManager.debug("保持当前属性选择", {
                component: "StateSelect",
                method: "updateState",
                params: { keptPropKey: EnumPropName[currentPropKey] },
            });
        }
        else {
            // 其他模式：使用新状态的lastProp
            this.refProp();
            StateErrorManager.debug("使用状态lastProp", {
                component: "StateSelect",
                method: "updateState",
            });
        }

        StateErrorManager.info("状态更新完成", {
            component: "StateSelect",
            method: "updateState",
            params: {
                targetState: ctrl.selectedIndex,
                finalPropKey: EnumPropName[this._propKey],
                appliedUpdates: updateBatch.length,
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
        // W6-2c2: 仅 controlled props 接受 commit (双 key 读: string propRef 优先, number fallback)
        if (this.readPropByEnum(propData, type) === undefined) return;
        const value = PropHandlerManager.getValue(type, this.node);
        if (value === undefined) return;
        // W6-2c2: 写 string propRef key (写路径切 helper)
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
    private readControlledPropsFromNode(ctrl: StateController): TProp {
        const snap: TProp = {} as TProp;
        if (!ctrl) {
            return snap;
        }
        const propData = this.getPropData(ctrl.selectedIndex, ctrl.ctrlId);
        const controlledProps = (propData && propData.$$controlledProps$$) || {};
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
            } else if (typeof ctrlVal === "string") {
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
     * 不调 applyPropDataToNode / setValue: StateController 在调用本方法后会触发 updateState(State),
     * StateSelect.updateState 会把回滚后的 propData 重新应用到节点.
     *
     * 设计要点: 用 _initialSnapshot 而不是 _snapshot. _snapshot 在 commitRecordingDiff 中会被刷新
     * 成节点新值 (作为下一段 diff 起点), 不再代表"录制开始时的原值"; _initialSnapshot 拍完不变.
     *
     * TASK-002 cancelRecording 路径专用. 调完清 _initialSnapshot / _snapshot / _fullSnapshot.
     */
    public applyRecordingSnapshot(ctrl: StateController, fromState: number): void {
        if (!CC_EDITOR) return;
        if (!ctrl || ctrl.ctrlId !== this.currCtrlId) return;
        if (this._initialSnapshot == null) {
            // 录制开始时没拍 snapshot (e.g. 控制器关联尚未建立), 直接清场, no-op 回滚
            this._snapshot = null;
            this._fullSnapshot = null;
            return;
        }
        const propData = this.getPropData(fromState, ctrl.ctrlId);
        if (propData) {
            const snap = this._initialSnapshot as TPropDictionary;
            // W6-2c2: snapshot 内层仍按 EnumPropName 数字 key 存 (readControlledPropsFromNode 路径),
            // 写回 propData 时按 writePropByEnum 切到 string propRef key.
            for (const key of Object.keys(snap)) {
                const propType = Number(key);
                if (!Number.isFinite(propType) || propType === EnumPropName.Non) continue;
                this.writePropByEnum(propData, propType as EnumPropName, snap[propType]);
            }
        }
        this._snapshot = null;
        this._initialSnapshot = null;
        this._fullSnapshot = null;
        StateErrorManager.debug("撤销录制: snapshot 回滚到 ctrlData", {
            component: "StateSelect",
            method: "applyRecordingSnapshot",
            params: { fromState, ctrlId: ctrl.ctrlId },
        });
    }

    /**
     * 切 state 前 (录制中): commit diff 到 fromState.
     * 由 StateController.selectedIndex setter → updateState(StateWillChange, fromIdx) 派发。
     */
    public onStateWillChange(ctrl: StateController, fromState: number): void {
        if (!CC_EDITOR) return;
        if (!ctrl || ctrl.ctrlId !== this.currCtrlId) return;
        // 仅录制中才 diff commit
        if (!ctrl.isRecording) return;
        if (this._snapshot == null) return;
        this.commitRecordingDiff(ctrl, fromState);
    }

    /**
     * 切 state 后 (录制中): 重拍 snapshot, 作为新一段 diff 起点.
     * 由 StateController 在 updateState(State) 之后再发 (T08 wiring).
     */
    public onStateChanged(ctrl: StateController): void {
        if (!CC_EDITOR) return;
        if (!ctrl || ctrl.ctrlId !== this.currCtrlId) return;
        if (!ctrl.isRecording) return;
        this._snapshot = this.readControlledPropsFromNode(ctrl);
        StateErrorManager.debug("录制 snapshot 已重拍", {
            component: "StateSelect",
            method: "onStateChanged",
            params: { newState: ctrl.selectedIndex },
        });
    }

    /**
     * 录制开始: 拍双 snapshot.
     *   _snapshot: 仅 controlled prop, 供 commit 路径用
     *   _fullSnapshot: 所有 applicable prop, 供 stop 时检测未跟随 dirty 用
     * 由 StateController.startRecording -> updateState(RecordingStart) 派发。
     */
    public onRecordingStart(ctrl: StateController): void {
        if (!CC_EDITOR) return;
        if (!ctrl || ctrl.ctrlId !== this.currCtrlId) {
            return;
        }
        this._snapshot = this.readControlledPropsFromNode(ctrl);
        // TASK-002: 拍一份独立的不可变 snapshot 给 cancel 用 (_snapshot 在 commit 路径会被刷新)
        this._initialSnapshot = this.readControlledPropsFromNode(ctrl);
        this._fullSnapshot = this.readAllApplicablePropsFromNode();
        StateErrorManager.debug("录制双 snapshot 已拍", {
            component: "StateSelect",
            method: "onRecordingStart",
            params: {
                controlledKeys: Object.keys(this._snapshot).length,
                fullKeys: Object.keys(this._fullSnapshot).length,
            },
        });
    }

    /**
     * 录制结束: commit controlled diff + 区分 auto/manual 收尾.
     *   auto (ctrl._stopRecordingMode === "auto", 切 state 触发): 静默 commit, Editor.log 反馈
     *   manual (按钮触发): 检测未跟随 prop 是否被改, 弹窗问是否追加跟随
     * 由 StateController.stopRecording -> updateState(RecordingStop) 派发。
     */
    public onRecordingStop(ctrl: StateController): void {
        if (!CC_EDITOR) return;
        if (!ctrl || ctrl.ctrlId !== this.currCtrlId) {
            return;
        }
        const targetState = ctrl.selectedIndex;
        // final commit: diff controlled snapshot vs 当前节点, 写 ctrlData[targetState]
        const committed = this.commitRecordingDiff(ctrl, targetState);
        // 检测未跟随的 dirty (录制期间被改但没勾跟随的 applicable prop)
        const untracked = this.detectUntrackedDirty();

        const isAuto = (ctrl as any)._stopRecordingMode === "auto";
        if (isAuto) {
            // 切 state 自动 stop — 静默反馈
            if (committed.length > 0) {
                const names = committed.map(p => EnumPropName[p]).join(", ");
                this.editorLog(`[StateSelect "${this.node && this.node.name}"] 已保存 ${names} 到 state[${targetState}]`);
            }
            if (untracked.length > 0) {
                // W6-2a-fixup: untracked 是 union 数组 (EnumPropName | propRef string), 兼容显示
                const names = untracked.map(p => typeof p === "string" ? p : EnumPropName[p]).join(", ");
                this.editorWarn(`[StateSelect "${this.node && this.node.name}"] 未跟随 prop ${names} 被改但已丢弃 (切 state 自动结束录制)`);
            }
        }
        else if (untracked.length > 0) {
            // 手动 stop 且有未跟随 dirty — 弹窗
            this.promptUntrackedAfterStop(ctrl, untracked);
        }

        this._snapshot = null;
        this._fullSnapshot = null;
        // TASK-002: 同步清初始 snapshot
        this._initialSnapshot = null;
        StateErrorManager.debug("录制 snapshot 已清", {
            component: "StateSelect",
            method: "onRecordingStop",
            params: { auto: isAuto, committed: committed.length, untracked: untracked.length },
        });
    }

    /**
     * 给 StateController.startRecording 用: 扫本 StateSelect 的 controlled prop,
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
    public collectDirtyControlled(ctrl: StateController): Array<{ propType?: EnumPropName, propRef?: string, current: unknown, stored: unknown }> {
        const out: Array<{ propType?: EnumPropName, propRef?: string, current: unknown, stored: unknown }> = [];
        if (!ctrl || ctrl.ctrlId !== this.currCtrlId) return out;
        if (!this.node) return out;
        const propData = this.getPropData(ctrl.selectedIndex, ctrl.ctrlId);
        const controlledProps = (propData && propData.$$controlledProps$$) || {};
        for (const propName in controlledProps) {
            const ctrlVal = controlledProps[propName];
            if (typeof ctrlVal === "number") {
                // 老路径: 内置 EnumPropName 数字
                const propType = ctrlVal as EnumPropName;
                if (propType === EnumPropName.Non) continue;
                const current = PropHandlerManager.getValue(propType, this.node);
                if (current === undefined) continue;
                // W6-2c2: 双 key 读
                const stored = this.readPropByEnum(propData, propType);
                if (stored === undefined) continue; // 已勾跟随但 ctrlData 还没值: 不算 dirty, 不弹
                if (!PropHandlerManager.isEqual(propType, stored, current)) {
                    out.push({ propType, current, stored });
                }
            } else if (typeof ctrlVal === "string") {
                // W6-2a-fixup 新路径: 自定义 propRef 字符串
                const propRef = ctrlVal;
                const current = this.readPropFromNodeByPropRef(propRef);
                if (current === undefined) continue;
                const stored = (propData as any)[propRef];
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
     * 扫节点上所有 applicable prop (== PropHandler.getValue 不返回 undefined 的 prop).
     * 含未勾选跟随的, 供录制期间"未跟随 dirty"检测.
     *
     * W6-2a-fixup: 双轨扫 —
     *   1) 老路径 PropHandlerManager.listRegisteredPropTypes (内置 EnumPropName 数字 key)
     *   2) 新路径 listTrackableProps (自定义 @ccclass 组件 propRef 字符串 key)
     *      过滤 isEnumMappedPropRef (已被内置路径覆盖) / readonly / 系统黑名单
     *      → 用 readPropFromNodeByPropRef 读 + cloneValueByType 深拷
     *
     * _fullSnapshot 内层 key 类型变成混合: number (内置) | string (自定义 propRef).
     */
    private readAllApplicablePropsFromNode(): TProp {
        const out: TProp = {} as TProp;
        if (!this.node) return out;
        // 1) 老路径 - 内置 EnumPropName 数字 key
        // TS enum 在 ts-jest 下不保证有 reverse mapping, 不能依赖 Object.keys(EnumPropName) 拿数字 key.
        const allPropTypes = PropHandlerManager.listRegisteredPropTypes();
        for (const propType of allPropTypes) {
            if (propType === EnumPropName.Non) continue;
            const v = PropHandlerManager.getValue(propType, this.node);
            if (v !== undefined) (out as TPropDictionary)[propType] = v;
        }
        // 2) W6-2a-fixup 新路径 - 自定义 propRef 字符串 key
        let trackable: TrackableProp[] = [];
        try {
            trackable = listTrackableProps(this.node);
        }
        catch (_) { /* listTrackableProps 失败时降级仅内置 */ }
        const systemComps = new Set(StateSelect.CONTROLLER_SYSTEM_COMPS);
        for (const tp of trackable) {
            // 内置 cc.Node 已被老路径覆盖
            if (tp.compName === "cc.Node") continue;
            // state machine 自身 component 不参与
            if (systemComps.has(tp.compName)) continue;
            // 已被 EnumPropName 老路径覆盖 (e.g. cc.Label.string → EnumPropName.LabelString)
            if (isEnumMappedPropRef(tp.propRef)) continue;
            // readonly 字段无法 setValue, 不进 untracked detect 范围
            if (tp.readonly) continue;
            const cur = this.readPropFromNodeByPropRef(tp.propRef);
            if (cur === undefined) continue;
            (out as any)[tp.propRef] = cloneValueByType(cur, tp.cocosType);
        }
        return out;
    }

    /**
     * 录制期间, 哪些 applicable prop 被改了**但没勾选跟随**.
     * 用 _fullSnapshot (start 时全 prop 快照) vs 当前节点 diff, 减去 controlled 部分.
     *
     * W6-2a-fixup: schema 升级 - _fullSnapshot 现在含双 key (内置数字 + 自定义 propRef 字符串).
     *   返回 union 数组: EnumPropName 数字 (内置) | propRef 字符串 (自定义).
     *   旧调用方 (Recording.modelZ.test.ts) 仍用 toContain(EnumPropName.Opacity) 数字断言, 兼容.
     */
    private detectUntrackedDirty(): Array<EnumPropName | string> {
        const out: Array<EnumPropName | string> = [];
        if (!this._fullSnapshot) return out;
        for (const k of Object.keys(this._fullSnapshot)) {
            // 按 key 字符串格式判别: 纯数字 → 内置 EnumPropName; 含非数字 → 自定义 propRef
            const num = Number(k);
            const isNumericKey = Number.isFinite(num) && String(num) === k;
            if (isNumericKey) {
                // 老路径: 内置 EnumPropName 数字
                const propType = num as EnumPropName;
                if (propType === EnumPropName.Non) continue;
                if (this.isPropertyControlled(propType)) continue; // 已跟随 — commit 路径已处理
                const before = (this._fullSnapshot as TPropDictionary)[propType];
                const current = PropHandlerManager.getValue(propType, this.node);
                if (current === undefined) continue;
                if (!PropHandlerManager.isEqual(propType, before, current)) {
                    out.push(propType);
                }
            } else {
                // W6-2a-fixup 新路径: 自定义 propRef 字符串
                const propRef = k;
                if (this.isPropertyControlled(propRef)) continue; // 已跟随
                const before = (this._fullSnapshot as any)[propRef];
                const current = this.readPropFromNodeByPropRef(propRef);
                if (current === undefined) continue;
                const tp = this.resolveTrackableProp(propRef);
                const cocosType = tp ? tp.cocosType : undefined;
                if (!eqValueByType(before, current, cocosType)) {
                    out.push(propRef);
                }
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
    private promptUntrackedAfterStop(ctrl: StateController, untracked: Array<EnumPropName | string>): void {
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
                } else {
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
            this.editorLog(`[StateSelect "${this.node && this.node.name}"] 追加跟随 + 保存: ${names.join(", ")} 到 state[${ctrl.selectedIndex}]`);
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
            else this.editorLog(`[StateSelect "${this.node && this.node.name}"] 丢弃未跟随 prop: ${names.join(", ")}`);
        });
    }

    /**
     * 弹窗封装 — 见 StateController.showDialog 同步注释.
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
                        if (first) { cb(0); return; }
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
        } catch (_) { /* noop */ }
    }

    private editorWarn(msg: string): void {
        try {
            const Ed = (globalThis as any).Editor;
            if (Ed && typeof Ed.warn === "function") Ed.warn(msg);
        } catch (_) { /* noop */ }
    }

    /**
     * 把 (snapshot, 当前节点) 之间的差异 commit 到 ctrlData[targetState].
     *
     * 算法: 对 snapshot 中每个 prop, 读节点当前值, 用 PropHandler.isEqual 判断变化;
     *      有变化 → 写 ctrlData[targetState][prop] = current; 同时刷新 snapshot 为 current
     *      (供下一段 diff 起点)。
     */
    private commitRecordingDiff(ctrl: StateController, targetState: number): EnumPropName[] {
        const committed: EnumPropName[] = [];
        if (!this._snapshot) return committed;
        const propData = this.getPropData(targetState, ctrl.ctrlId);
        const snap = this._snapshot;
        for (const key of Object.keys(snap)) {
            // W6-2a: 双 key 分发 — 数字 key 走老 PropHandlerManager, 字符串 propRef 走新路径.
            const num = Number(key);
            if (Number.isFinite(num) && !Number.isNaN(num)) {
                // 老路径: EnumPropName 数字 key
                const propType = num;
                if (propType === EnumPropName.Non) continue;
                const currentValue = PropHandlerManager.getValue(propType as EnumPropName, this.node);
                if (currentValue === undefined) continue;
                const snapValue = (snap as TPropDictionary)[propType];
                if (!PropHandlerManager.isEqual(propType as EnumPropName, snapValue, currentValue)) {
                    // W6-2c2: 写 string propRef key (snapshot 仍按 number key 索引, 是 in-memory 临时态)
                    this.writePropByEnum(propData, propType as EnumPropName, currentValue);
                    (snap as TPropDictionary)[propType] = currentValue;
                    committed.push(propType as EnumPropName);
                    StateErrorManager.debug("录制 diff 提交 (enum)", {
                        component: "StateSelect",
                        method: "commitRecordingDiff",
                        params: { state: targetState, propType: EnumPropName[propType as EnumPropName] },
                    });
                }
            } else {
                // 新路径: propRef 字符串 key
                const propRef = key;
                const tp = this.resolveTrackableProp(propRef);
                const currentValue = this.readNodeValueByPropRef(propRef);
                if (currentValue === undefined) continue;
                const snapValue = (snap as any)[propRef];
                const cocosType = tp ? tp.cocosType : undefined;
                if (!eqValueByType(snapValue, currentValue, cocosType)) {
                    const cloned = cloneValueByType(currentValue, cocosType);
                    (propData as any)[propRef] = cloned;
                    (snap as any)[propRef] = cloned;
                    StateErrorManager.debug("录制 diff 提交 (propRef)", {
                        component: "StateSelect",
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
    private applyPropRefKeysToNode(propData: TProp, defaultData: TProp): void {
        const seen = new Set<string>();
        const apply = (data: TProp) => {
            if (!data) return;
            const keys = this.extractPropRefKeys(data);
            for (const propRef of keys) {
                if (seen.has(propRef)) continue;
                const value = (data as any)[propRef];
                if (value === undefined) continue;
                const tp = this.resolveTrackableProp(propRef);
                const cocosType = tp ? tp.cocosType : undefined;
                try {
                    this.writeNodeValueByPropRef(propRef, cloneValueByType(value, cocosType));
                    seen.add(propRef);
                } catch (e) {
                    StateErrorManager.warn("applyPropRefKeysToNode 写值失败", {
                        component: "StateSelect",
                        method: "applyPropRefKeysToNode",
                        params: { propRef, error: (e as Error).message },
                    });
                }
            }
        };
        // 先 state 数据, 再 default 兜底 (与老 updateState 默认优先级一致, seen 跳过)
        apply(propData);
        apply(defaultData);
    }

    /** 🔧 批量更新UI，使用属性处理器系统和错误处理机制 */
    private batchUpdateUI(updateBatch: { type: EnumPropName, value: TPropValue }[]) {
        // 🔧 验证节点有效性
        if (!StateErrorManager.validateNode(this.node, {
            component: "StateSelect",
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
                            { component: "StateSelect", method: "batchUpdateUI", params: { propType: type } },
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

    /**
     * 其他状态是否有存在这个属性
     * @param ctrl
     * @param prop
     */
    private isOtherHans(ctrl: StateController, prop: number) {
        const pageData = this.getPageData();
        for (let index = 0, len = ctrl.states.length; index < len; index++) {
            const propData = pageData[index];
            // W6-2c2: 双 key 读
            if (propData && this.readPropByEnum(propData, prop as EnumPropName) != void 0) {
                return true;
            }
        }
        return false;
    }

    /** 获取某个控制器的状态数据 */
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

    /**
     * 获取某个状态的属性数据
     */
    private getPropData(state?: number, ctrlId?: number): TProp {
        const pageData = this.getPageData(ctrlId);
        const targetState = state != void 0 ? state : this.ctrlState;
        if (pageData[targetState] == void 0) {
            pageData[targetState] = {} as TProp;
        }
        return pageData[targetState];
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
            component: "StateSelect",
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
                    { component: "StateSelect", method: "handleValue", params: { propType: type } },
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
                component: "StateSelect",
                method: "transPosition",
            });
            return;
        }
        // 检查parent是否具有必要的方法
        if (typeof parent.convertToNodeSpaceAR !== "function") {
            StateErrorManager.warn("parent 节点缺少 convertToNodeSpaceAR 方法", {
                component: "StateSelect",
                method: "transPosition",
            });
            return;
        }

        const pageData = this.getPageData();

        for (const state in pageData) {
            const propData = pageData[state];
            // W6-2c2: Position 走 AMBIGUOUS_ENUM_TO_PROPREF ('cc.Node.position') 整体存
            const pos = this.readPropByEnum(propData, EnumPropName.Position) as cc.Vec3;
            if (pos) {
                try {
                    // 在 2.x 中，需要手动计算坐标转换
                    const worldPos = oldParent.convertToWorldSpaceAR(pos);
                    const localPos = parent.convertToNodeSpaceAR(worldPos);
                    pos.set(localPos);
                }
                catch (error) {
                    StateErrorManager.error("坐标转换过程中发生错误", {
                        component: "StateSelect",
                        method: "transPosition",
                        params: { error: error.message },
                    });
                }
            }
        }
    }

    /** 同步属性到所有状态 */
    private syncPropToAllStatesInternal(propKey: EnumPropName) {
        const ctrl = this.getCurrCtrl();
        if (!ctrl) {
            StateErrorManager.error("同步属性失败：控制器为空", {
                component: "StateSelect",
                method: "syncPropToAllStatesInternal",
            });
            return;
        }

        StateErrorManager.debug("开始同步属性到所有状态", {
            component: "StateSelect",
            method: "syncPropToAllStatesInternal",
            params: { propType: EnumPropName[propKey], stateCount: ctrl.states.length },
        });

        // 🔧 修复：不同步Non属性
        if (propKey === EnumPropName.Non) {
            StateErrorManager.warn("不能同步Non属性", {
                component: "StateSelect",
                method: "syncPropToAllStatesInternal",
            });
            return;
        }

        const pageData = this.getPageData();
        const currentStateValue = this.handleValue(propKey); // 获取当前节点的属性值作为默认值

        if (currentStateValue === undefined) {
            StateErrorManager.error("同步失败：无法获取当前属性值", {
                component: "StateSelect",
                method: "syncPropToAllStatesInternal",
                params: { propType: EnumPropName[propKey] },
            });
            return;
        }

        // 遍历所有状态
        let syncedStates = 0;
        for (let stateIndex = 0; stateIndex < ctrl.states.length; stateIndex++) {
            if (pageData[stateIndex] == void 0) {
                pageData[stateIndex] = {};
            }
            const statePropData = pageData[stateIndex];

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
            component: "StateSelect",
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
                component: "StateSelect",
                method: "syncDeletePropFromAllStates",
            });
            return;
        }

        StateErrorManager.debug("开始同步删除属性", {
            component: "StateSelect",
            method: "syncDeletePropFromAllStates",
            params: { propType: EnumPropName[propKey], stateCount: ctrl.states.length },
        });

        // 🔧 修复：不删除Non属性
        if (propKey === EnumPropName.Non) {
            StateErrorManager.warn("不能删除Non属性", {
                component: "StateSelect",
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
            const statePropData = pageData[stateIndex];
            if (statePropData) {
                // 删除属性值 (string + number 双删)
                const hadValue = this.readPropByEnum(statePropData, propKey) !== undefined;
                if (propRef !== undefined) delete (statePropData as any)[propRef];
                delete (statePropData as TPropDictionary)[propKey];
                if (hadValue) deletedFromStates++;

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

        StateErrorManager.info("属性删除完成", {
            component: "StateSelect",
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

    // ============== 🔧 新增：简化的属性管理方法 ==============

    /** 🔧 新增：获取属性的显示名称 */
    private getPropertyDisplayName(propType: EnumPropName): string {
        const propNames = {
            [EnumPropName.Non]: "不选择",
            [EnumPropName.Active]: "显示/隐藏",
            [EnumPropName.Position]: "位置",
            [EnumPropName.Scale]: "缩放",
            [EnumPropName.Color]: "颜色",
            [EnumPropName.Size]: "尺寸",
            [EnumPropName.Euler]: "旋转",
            [EnumPropName.Anchor]: "锚点",
            [EnumPropName.Opacity]: "透明度",
            [EnumPropName.LabelString]: "文本内容",
            [EnumPropName.SpriteFrame]: "图片",
            [EnumPropName.Font]: "字体",
            [EnumPropName.LabelOutlineColor]: "描边颜色",
            [EnumPropName.SliderProgress]: "滑动条进度",
            [EnumPropName.EditboxString]: "输入框文本",
            [EnumPropName.GrayScale]: "灰度效果",
            [EnumPropName.ButtonInteractable]: "按钮交互",
            [EnumPropName.ProgressBarProgress]: "进度条进度",
            [EnumPropName.ToggleIsChecked]: "Toggle选中状态",
            [EnumPropName.RichTextString]: "富文本内容",
            [EnumPropName.ScrollViewEnabled]: "滚动视图启用",
            [EnumPropName.MaskEnabled]: "遮罩启用",
            [EnumPropName.LabelFontSize]: "文本字号",
            [EnumPropName.LabelLineHeight]: "文本行高",
            [EnumPropName.LabelSpacingX]: "文本字距",
            [EnumPropName.LabelWrapEnable]: "文本自动换行",
            [EnumPropName.SpriteFillRange]: "精灵填充范围",
            [EnumPropName.WidgetEnabled]: "Widget 启用",
            [EnumPropName.WidgetAlignMode]: "Widget 对齐模式",
            [EnumPropName.WidgetIsAlignTop]: "Widget 顶部对齐",
            [EnumPropName.WidgetIsAlignBottom]: "Widget 底部对齐",
            [EnumPropName.WidgetIsAlignLeft]: "Widget 左侧对齐",
            [EnumPropName.WidgetIsAlignRight]: "Widget 右侧对齐",
            [EnumPropName.WidgetIsAlignHorizontalCenter]: "Widget 水平居中",
            [EnumPropName.WidgetIsAlignVerticalCenter]: "Widget 垂直居中",
            [EnumPropName.WidgetTop]: "Widget Top 边距",
            [EnumPropName.WidgetBottom]: "Widget Bottom 边距",
            [EnumPropName.WidgetLeft]: "Widget Left 边距",
            [EnumPropName.WidgetRight]: "Widget Right 边距",
            [EnumPropName.WidgetHorizontalCenter]: "Widget 水平偏移",
            [EnumPropName.WidgetVerticalCenter]: "Widget 垂直偏移",
        };
        return propNames[propType] || EnumPropName[propType];
    }

    /** 🔧 新增：获取当前选中属性的提示信息 */
    private getCurrentSelectionTooltip(propType: EnumPropName, baseTooltip: string): string {
        const isSelected = this._propKey === propType;
        if (isSelected) {
            const propDisplayName = this.getPropertyDisplayName(propType);
            return baseTooltip + `\n\n🔸 当前选中：正在编辑"${propDisplayName}"的属性值`;
        }
        return baseTooltip;
    }

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
     *   - number (EnumPropName): 走老路径 PropertyControlService.isPropertyControlled (内置 prop, number key)
     *   - string (propRef): 走新路径 isPropertyControlledByPropRef (自定义 prop, string key)
     */
    public isPropertyControlled(propTypeOrRef: EnumPropName | string): boolean {
        if (typeof propTypeOrRef === "string") {
            return this.isPropertyControlledByPropRef(propTypeOrRef);
        }
        return PropertyControlService.isPropertyControlled(this.getPropData(), propTypeOrRef);
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

    /**
     * 录制按钮 (Wave 2 实装): 镜像 currCtrl.isRecording, 点击 toggle ctrl.startRecording / stopRecording.
     * 让用户在 StateSelect inspector 上也能起停录制, 与 StateController inspector 共享同一录制态。
     */
    @property({
        displayName: "🔴 录制",
        tooltip: "进入/退出录制模式. 录制中, 节点改动自动写入当前 state",
    })
    public get recordTrigger() {
        const ctrl = this.getCurrCtrl();
        return !!(ctrl && ctrl.isRecording);
    }

    public set recordTrigger(_value: boolean) {
        if (!CC_EDITOR) return;
        const ctrl = this.getCurrCtrl();
        if (!ctrl) {
            StateErrorManager.warn("recordTrigger: 未找到当前控制器", {
                component: "StateSelect",
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
     * 撤销本次录制 (TASK-002): 镜像 StateController.cancelRecordTrigger.
     * 让用户在 StateSelect inspector 上也能撤销, 与 StateController inspector 共享同一录制态。
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
        const ctrl = this.getCurrCtrl();
        if (!ctrl) return;
        if (ctrl.isRecording) {
            ctrl.cancelRecording();
        }
    }

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
        try { this.reconcileUserExcluded(); } catch { /* swallow, 兜底 */ }
        try { this.refreshExcludeEnumLists(); } catch { /* swallow */ }
        try {
            if (this.node && (Editor as any)?.Utils?.refreshSelectedInspector) {
                (Editor as any).Utils.refreshSelectedInspector("node", this.node.uuid);
            }
        } catch (e) {
            StateErrorManager.warn("refreshInspectorTrigger: Editor.Utils.refreshSelectedInspector 失败", {
                component: "StateSelect",
                method: "refreshInspectorTrigger.setter",
                params: { error: (e as Error).message },
            });
        }
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
            component: "StateSelect",
            method: "togglePropertyControl",
            params: { propType: EnumPropName[propType], propRef, enable },
        });

        if (enable) {
            // 🔧 第一步：启用属性控制
            this.addPropertyControl(propType);

            // 🔧 第二步：立即更新界面标识变量
            this._currentDisplayProp = propType;

            StateErrorManager.debug("属性控制已启用，界面标识已更新", {
                component: "StateSelect",
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

            // 🔧 第二步：如果是当前显示的属性，清空界面标识
            if (this._currentDisplayProp === propType) {
                this._currentDisplayProp = EnumPropName.Non;
            }

            StateErrorManager.debug("属性控制已禁用，界面标识已清空", {
                component: "StateSelect",
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
            component: "StateSelect",
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
            component: "StateSelect",
            method: "scanAvailableProperties",
            params: { count: availableProps.length, props: availableProps.map(p => EnumPropName[p]) },
        });
        return availableProps;
    }

    /**
     * 智能属性推断: 批量启用所有 applicable prop. TASK-003 之后 __preload 已自动接入,
     * 此方法保留作为外部工具入口 (例: panel 命令 / 脚本批量配置 / 现有 jest 测试).
     */
    public autoConfigureAllProperties(): { enabled: number; skipped: number; failed: number } {
        if (!CC_EDITOR) {
            return { enabled: 0, skipped: 0, failed: 0 };
        }

        StateErrorManager.info("开始批量启用所有可用属性", {
            component: "StateSelect",
            method: "autoConfigureAllProperties",
        });

        const result = { enabled: 0, skipped: 0, failed: 0 };
        const availableProps = this.scanAvailableProperties();

        for (const propType of availableProps) {
            // 跳过已控制的属性
            if (this.isPropertyControlled(propType)) {
                result.skipped++;
                continue;
            }

            // 启用属性控制
            try {
                this.togglePropertyControl(propType, true);
                result.enabled++;

                StateErrorManager.debug("属性已自动启用", {
                    component: "StateSelect",
                    method: "autoConfigureAllProperties",
                    params: { propType: EnumPropName[propType] },
                });
            }
            catch (error) {
                result.failed++;
                StateErrorManager.warn("属性启用失败", {
                    component: "StateSelect",
                    method: "autoConfigureAllProperties",
                    params: { propType: EnumPropName[propType], error: error.message },
                });
            }
        }

        // 刷新编辑器界面
        this.forceRefreshInspector();

        StateErrorManager.info("批量启用完成", {
            component: "StateSelect",
            method: "autoConfigureAllProperties",
            params: result,
        });

        return result;
    }

    /** 🔧 架构重构：添加属性控制（分离控制状态和数据状态） */
    private addPropertyControl(propType: EnumPropName) {
        const propData = this.getPropData();
        if (!propData) {
            StateErrorManager.warn("无法获取属性数据", {
                component: "StateSelect",
                method: "addPropertyControl",
                params: { propType: EnumPropName[propType] },
            });
            return;
        }

        const propName = EnumPropName[propType];

        // 🔧 第一步：确保新的数据结构存在
        propData.$$controlledProps$$ = propData.$$controlledProps$$ || {};
        propData.$$propertyData$$ = propData.$$propertyData$$ || {};

        // 🔧 第二步：添加到受控属性列表
        propData.$$controlledProps$$[propName] = propType;

        // W6-2c2: $$propertyData$$ 内层也切 string propRef key (与外层 propData 一致)
        const propRef = enumToPropRef(propType);
        const dataKey = propRef !== undefined ? propRef : propType;

        // 🔧 第三步：检查是否需要创建属性数据
        if ((propData.$$propertyData$$ as any)[dataKey] === undefined) {
            // 获取当前属性值
            const currentValue = this.handleValue(propType);
            if (currentValue === undefined) {
                StateErrorManager.warn("无法获取属性值，跳过数据创建", {
                    component: "StateSelect",
                    method: "addPropertyControl",
                    params: { propType: propName },
                });
                return;
            }

            // W6-2c2: 创建属性数据 (string propRef key, 删 number key)
            (propData.$$propertyData$$ as any)[dataKey] = currentValue;
            if (propRef !== undefined) {
                delete (propData.$$propertyData$$ as any)[propType];
            }

            StateErrorManager.debug("创建新的属性数据", {
                component: "StateSelect",
                method: "addPropertyControl",
                params: { propType: propName, dataKey, value: currentValue },
            });
        }

        // 🔧 第四步：兼容性处理 - 同步到旧的changedProp结构
        propData.$$changedProp$$ = propData.$$changedProp$$ || {};
        propData.$$changedProp$$[propName] = propType;

        // 🔧 第五步：自动同步到其他状态
        if (this.autoSyncEnabled) {
            this.syncPropToAllStatesInternal(propType);
        }

        // 🔧 第六步：设置为当前选中的属性
        this._propKey = propType;
        this._propValue = (propData.$$propertyData$$ as any)[dataKey];

        // 🔧 修复：调用setPropValue显示属性值字段
        this.setPropValue(propType);

        // 🔧 第七步：更新显示
        this.updateChangedProp();

        // 🔧 注意：界面标识变量(_currentDisplayProp)由togglePropertyControl统一管理

        StateErrorManager.info("属性控制已添加", {
            component: "StateSelect",
            method: "addPropertyControl",
            params: {
                propType: propName,
                hasData: (propData.$$propertyData$$ as any)[dataKey] !== undefined,
                isControlled: !!propData.$$controlledProps$$[propName],
            },
        });
    }

    /** 🔧 架构重构：移除属性控制（只影响控制状态，保留数据） */
    private removePropertyControl(propType: EnumPropName) {
        const propData = this.getPropData();
        if (!propData) {
            StateErrorManager.warn("无法获取属性数据", {
                component: "StateSelect",
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
            component: "StateSelect",
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
            component: "StateSelect",
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
                component: "StateSelect",
                method: "forceRefreshInspector",
            });
        }
        catch (error) {
            StateErrorManager.warn("刷新属性检查器失败", {
                component: "StateSelect",
                method: "forceRefreshInspector",
                params: { error: error.message },
            });
        }
    }

    /** 🔧 恢复：手动重新获取控制器 */
    public manualReloadController() {
        if (!CC_EDITOR) {
            return;
        }

        StateErrorManager.info("开始手动重新获取控制器", {
            component: "StateSelect",
            method: "manualReloadController",
            params: { currentCtrlId: this.currCtrlId },
        });

        try {
            // 🔧 第一步：重置预加载状态
            this._isPreloaded = false;

            // 🔧 第二步：清理当前状态
            this.currCtrlId = null;
            this._propKey = EnumPropName.Non;
            this._propValue = null;

            // 🔧 第三步：重新执行预加载逻辑
            this.__preload();

            // 🔧 第四步：强制刷新界面
            this.forceRefreshInspector();

            StateErrorManager.info("控制器重新获取完成", {
                component: "StateSelect",
                method: "manualReloadController",
                params: {
                    newCtrlId: this.currCtrlId,
                    success: !!this.currCtrlId,
                    propKey: this._propKey ? EnumPropName[this._propKey] : "None",
                },
            });
        }
        catch (error) {
            StateErrorManager.error("控制器重新获取失败", {
                component: "StateSelect",
                method: "manualReloadController",
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
                    component: "StateSelect",
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
                component: "StateSelect",
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
                { component: "StateSelect", method: "deletePropertyWithConfirmation" },
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
                        component: "StateSelect",
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
                        component: "StateSelect",
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
                    component: "StateSelect",
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
                component: "StateSelect",
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
                { component: "StateSelect", method: "performPropertyDeletion" },
            );
        }
    }

    // #endregion 7.
}
