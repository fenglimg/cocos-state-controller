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
import { StateToolsProps } from "./props/StateToolsProps";
import { StateWidgetProps } from "./props/StateWidgetProps";
import { StateController } from "./StateController";
import { EnumCtrlName, EnumPropName, EnumStateName } from "./StateEnum";
import { StateErrorManager } from "./StateErrorManager";
import { PropHandlerManager } from "./StatePropHandler";
import { PropertyControlService } from "./StatePropertyControlService";

cc.Enum(EnumCtrlName);
cc.Enum(EnumStateName);
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

    /** 当前选中的ctrl名称对应的ctrlId */
    @property(EnumCtrlName)
    private _currCtrlId: number = null;

    @property(cc.Node)
    private _root: cc.Node = null;

    /** 控制器所在节点 */
    @property({ type: cc.Node, tooltip: "控制器所在节点，仅提示用", readonly: true })
    public get root() {
        return this._root;
    }

    /** 当前状态要改变的属性 */
    @property({ type: EnumPropName })
    private _propKey: EnumPropName = EnumPropName.Non;

    /** 当前状态要改变的属性值 */
    @property
    private _propValue: TPropValue = null;

    /** 🔧 新增：界面标识变量 - 用于标明当前正在展示属性值的属性类型 */
    @property({ type: EnumPropName })
    private _currentDisplayProp: EnumPropName = EnumPropName.Non;

    @property
    private _isDeleteCurr: boolean = false;

    // #endregion

    /** 工具按钮 - inspector 中显示为可折叠分组 */
    @property({
        type: StateToolsProps,
        displayName: "工具",
        tooltip: "工具按钮（刷新、同步、删除等）",
        editorOnly: true,
        serializable: false,
    })
    public toolsProps = new StateToolsProps();

    // #region 属性值
    // 注: getter @property 不要加 editorOnly / serializable: false,
    // 因为 cc 引擎里 getter 本身就不会参与序列化, 加了 cc 会报多余警告。
    @property({
        tooltip: "当前状态属性值\n\n🔸 这里显示当前选中属性的值",
        visible: true,
        displayName: "🔸 当前属性值",
    })
    public get propValue() {
        return this._propValue;
    }

    private set propValue(value: TPropValue) {
        if (!CC_EDITOR) {
            return;
        }
        StateErrorManager.debug("设置属性值", {
            component: "StateSelect",
            method: "propValue.setter",
            params: {
                propKey: EnumPropName[this.propKey],
                valueType: typeof value,
                oldValue: this._propValue,
            },
        });

        this._propValue = value;
        const propData = this.getPropData();
        propData[this.propKey] = value;
        this.updateState(this.getCurrCtrl());
    }

    /** 节点基础属性 - inspector 中显示为可折叠分组 */
    @property({
        type: StateNodeProps,
        displayName: "节点属性",
        tooltip: "节点基础属性（Active, Position, Scale, Color, Size, Euler, Anchor, Opacity）",
        editorOnly: true,
        serializable: false,
    })
    public nodeProps = new StateNodeProps();

    /** 组件属性 - inspector 中显示为可折叠分组 */
    @property({
        type: StateComponentProps,
        displayName: "组件属性",
        tooltip: "组件相关属性（Label, Sprite, Button, Toggle 等）",
        editorOnly: true,
        serializable: false,
    })
    public componentProps = new StateComponentProps();

    /** Widget属性 - inspector 中显示为可折叠分组 */
    @property({
        type: StateWidgetProps,
        displayName: "Widget属性",
        tooltip: "Widget 布局相关属性",
        editorOnly: true,
        serializable: false,
    })
    public widgetProps = new StateWidgetProps();

    /** 状态数据 */
    @property
    private _ctrlData: TCtrl = {};

    /** 用于检测父节点变化 */
    private lastParent: cc.Node = null;
    private parentCheckInterval: ReturnType<typeof setInterval> = null;

    // #region 控制器当前状态
    @property({ type: EnumStateName, tooltip: "控制器当前状态" })
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
    @property({ type: EnumCtrlName, displayName: "Ctrl Name", tooltip: "选择的控制器" })
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

        // 🔧 设置属性值
        propData[propKey] = propValue;

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

        // 初始化嵌套 CCClass 的 owner 引用
        this.nodeProps.owner = this;
        this.componentProps.owner = this;
        this.widgetProps.owner = this;
        this.toolsProps.owner = this;

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

        StateErrorManager.info("StateSelect预加载完成", {
            component: "StateSelect",
            method: "__preload",
            params: { finalCtrlId: this.currCtrlId, propKey: EnumPropName[this._propKey] },
        });
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

        this.node.on("active-in-hierarchy-changed", this.activeChanged, this);
        this.node.on("position-changed", this.positionChanged, this);
        this.node.on("rotation-changed", this.rotationChanged, this);
        this.node.on("scale-changed", this.scaleChanged, this);
        this.node.on("size-changed", this.sizeChanged, this);
        this.node.on("anchor-changed", this.anchorChanged, this);
        this.node.on("color-changed", this.colorChanged, this);
        this.node.on("spriteframe-changed", this.spriteFrameChanged, this);
    }

    protected onDestroy() {
        // 清理父节点检测定时器
        if (this.parentCheckInterval) {
            clearInterval(this.parentCheckInterval);
            this.parentCheckInterval = null;
        }

        // IMPL-001.6: 销毁时通知控制器缓存失效
        this.notifyControllerCacheDirty();

        if (this.node && this.node.isValid) {
            this.node.off("active-in-hierarchy-changed", this.activeChanged, this);
            this.node.off("position-changed", this.positionChanged, this);
            this.node.off("rotation-changed", this.rotationChanged, this);
            this.node.off("scale-changed", this.scaleChanged, this);
            this.node.off("size-changed", this.sizeChanged, this);
            this.node.off("anchor-changed", this.anchorChanged, this);
            this.node.off("color-changed", this.colorChanged, this);
            this.node.off("spriteframe-changed", this.spriteFrameChanged, this);
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

    /** 节点active改变 */
    private activeChanged(_node: cc.Node) {
        this.setDefaultProp(EnumPropName.Active);
    }

    /** 节点位置改变 */
    private positionChanged() {
        this.setDefaultProp(EnumPropName.Position);
    }

    /** 节点旋转改变 */
    private rotationChanged() {
        this.setDefaultProp(EnumPropName.Euler);
    }

    /** 节点缩放改变 */
    private scaleChanged() {
        this.setDefaultProp(EnumPropName.Scale);
    }

    /** 节点大小改变 */
    private sizeChanged(_size: cc.Size) {
        this.setDefaultProp(EnumPropName.Size);
    }

    /** 锚点改变 */
    private anchorChanged(_anchor: cc.Vec2) {
        this.setDefaultProp(EnumPropName.Anchor);
    }

    /** 颜色改变 */
    private colorChanged(_color: cc.Color) {
        this.setDefaultProp(EnumPropName.Color);
    }

    /** 图片改变 */
    private spriteFrameChanged(_sprite: cc.Sprite) {
        this.setDefaultProp(EnumPropName.SpriteFrame);
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
    private _isFromCtrl: boolean = false;
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
                isFromCtrl: this._isFromCtrl,
                currentPropKey: EnumPropName[this.propKey],
            },
        });

        this._isFromCtrl = true;

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

        const defaultKeys = this.extractNumericPropKeys(defaultData);
        for (const key of defaultKeys) {
            const propType = key as EnumPropName;
            const value = propData[propType] != void 0 ? propData[propType] : defaultData[propType];
            if (value == void 0) {
                continue;
            }
            updateBatch.push({ type: propType, value });
            processedKeys.add(propType);
        }

        const stateKeys = this.extractNumericPropKeys(propData);
        for (const key of stateKeys) {
            if (processedKeys.has(key)) {
                continue;
            }
            const propType = key as EnumPropName;
            const value = propData[propType];
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

        this._isFromCtrl = false;

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
            if (propData && propData[prop] != void 0) {
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
            // @ts-expect-error cc.Class.Attr.setClassAttr is not typed
            cc.Class.Attr.setClassAttr(this, "propValue", "visible", false);
            return void 0;
        }
        // @ts-expect-error cc.Class.Attr.setClassAttr is not typed
        cc.Class.Attr.setClassAttr(this, "propValue", "visible", true);
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

    /** 编辑器改变、改变对于状态属性（最开始是说改变默认属性） */
    private setDefaultProp(type: EnumPropName) {
        if (!CC_EDITOR) {
            return;
        }
        if (this._isFromCtrl) {
            return;// 不是编辑器改变
        }

        StateErrorManager.debug("检测到编辑器属性变化", {
            component: "StateSelect",
            method: "setDefaultProp",
            params: { propType: EnumPropName[type] },
        });

        let propData = this.getPropData();

        // 🔧 新增：先尝试自动添加属性到changed_prop（如果未被控制）
        if (propData[type] == void 0) {
            // 属性未被控制，尝试自动添加
            // this.autoAddPropToChangedProp(type);

            // 重新获取propData，因为autoAddPropToChangedProp可能已经添加了属性
            propData = this.getPropData();

            // 如果仍然未被控制，则跳过更新
            if (propData[type] == void 0) {
                StateErrorManager.debug("属性未被控制且无法自动添加，跳过更新", {
                    component: "StateSelect",
                    method: "setDefaultProp",
                    params: { propType: EnumPropName[type] },
                });
                return;
            }
        }

        // else {
        //     // 🔧 属性已被控制，仅设置PropKey
        //     this.autoAddPropToChangedProp(type);
        // }
        switch (type) {
            case EnumPropName.Non: {
                return;
            }
            case EnumPropName.Active: {
                propData[EnumPropName.Active] = this.node.active;
            } break;
            case EnumPropName.Position: {
                (propData[EnumPropName.Position] as cc.Vec3).set(this.node.position);
            } break;
            case EnumPropName.LabelString: {
                const label = this.node.getComponent(cc.Label);
                if (!label) {
                    return;
                }
                propData[EnumPropName.LabelString] = label.string;
            } break;
            case EnumPropName.LabelFontSize: {
                const label = this.node.getComponent(cc.Label);
                if (!label) {
                    return;
                }
                propData[EnumPropName.LabelFontSize] = label.fontSize;
            } break;
            case EnumPropName.LabelLineHeight: {
                const label = this.node.getComponent(cc.Label);
                if (!label) {
                    return;
                }
                propData[EnumPropName.LabelLineHeight] = label.lineHeight;
            } break;
            case EnumPropName.LabelSpacingX: {
                const label = this.node.getComponent(cc.Label);
                if (!label) {
                    return;
                }
                propData[EnumPropName.LabelSpacingX] = label.spacingX;
            } break;
            case EnumPropName.LabelWrapEnable: {
                const label = this.node.getComponent(cc.Label);
                if (!label) {
                    return;
                }
                propData[EnumPropName.LabelWrapEnable] = label.enableWrapText;
            } break;
            case EnumPropName.Font: {
                const label = this.node.getComponent(cc.Label);
                if (!label) {
                    return;
                }
                propData[EnumPropName.Font] = label.font;
            } break;
            case EnumPropName.LabelOutlineColor: {
                const labelOutline = this.node.getComponent(cc.LabelOutline);
                if (!labelOutline) {
                    return;
                }
                (propData[EnumPropName.LabelOutlineColor] as cc.Color).set(labelOutline.color);
            } break;
            case EnumPropName.SpriteFrame: {
                const sprite = this.node.getComponent(cc.Sprite);
                if (!sprite) {
                    return;
                }
                propData[EnumPropName.SpriteFrame] = sprite.spriteFrame;
            } break;
            case EnumPropName.SpriteFillRange: {
                const sprite = this.node.getComponent(cc.Sprite);
                if (!sprite) {
                    return;
                }
                propData[EnumPropName.SpriteFillRange] = sprite.fillRange;
            } break;
            case EnumPropName.WidgetEnabled: {
                const widget = this.node.getComponent(cc.Widget);
                if (!widget) {
                    return;
                }
                propData[EnumPropName.WidgetEnabled] = widget.enabled;
            } break;
            case EnumPropName.WidgetAlignMode: {
                const widget = this.node.getComponent(cc.Widget);
                if (!widget) {
                    return;
                }
                propData[EnumPropName.WidgetAlignMode] = widget.alignMode;
            } break;
            case EnumPropName.WidgetIsAlignTop: {
                const widget = this.node.getComponent(cc.Widget);
                if (!widget) {
                    return;
                }
                propData[EnumPropName.WidgetIsAlignTop] = widget.isAlignTop;
            } break;
            case EnumPropName.WidgetIsAlignBottom: {
                const widget = this.node.getComponent(cc.Widget);
                if (!widget) {
                    return;
                }
                propData[EnumPropName.WidgetIsAlignBottom] = widget.isAlignBottom;
            } break;
            case EnumPropName.WidgetIsAlignLeft: {
                const widget = this.node.getComponent(cc.Widget);
                if (!widget) {
                    return;
                }
                propData[EnumPropName.WidgetIsAlignLeft] = widget.isAlignLeft;
            } break;
            case EnumPropName.WidgetIsAlignRight: {
                const widget = this.node.getComponent(cc.Widget);
                if (!widget) {
                    return;
                }
                propData[EnumPropName.WidgetIsAlignRight] = widget.isAlignRight;
            } break;
            case EnumPropName.WidgetIsAlignHorizontalCenter: {
                const widget = this.node.getComponent(cc.Widget);
                if (!widget) {
                    return;
                }
                propData[EnumPropName.WidgetIsAlignHorizontalCenter] = widget.isAlignHorizontalCenter;
            } break;
            case EnumPropName.WidgetIsAlignVerticalCenter: {
                const widget = this.node.getComponent(cc.Widget);
                if (!widget) {
                    return;
                }
                propData[EnumPropName.WidgetIsAlignVerticalCenter] = widget.isAlignVerticalCenter;
            } break;
            case EnumPropName.WidgetTop: {
                const widget = this.node.getComponent(cc.Widget);
                if (!widget) {
                    return;
                }
                propData[EnumPropName.WidgetTop] = widget.top;
            } break;
            case EnumPropName.WidgetBottom: {
                const widget = this.node.getComponent(cc.Widget);
                if (!widget) {
                    return;
                }
                propData[EnumPropName.WidgetBottom] = widget.bottom;
            } break;
            case EnumPropName.WidgetLeft: {
                const widget = this.node.getComponent(cc.Widget);
                if (!widget) {
                    return;
                }
                propData[EnumPropName.WidgetLeft] = widget.left;
            } break;
            case EnumPropName.WidgetRight: {
                const widget = this.node.getComponent(cc.Widget);
                if (!widget) {
                    return;
                }
                propData[EnumPropName.WidgetRight] = widget.right;
            } break;
            case EnumPropName.WidgetHorizontalCenter: {
                const widget = this.node.getComponent(cc.Widget);
                if (!widget) {
                    return;
                }
                propData[EnumPropName.WidgetHorizontalCenter] = widget.horizontalCenter;
            } break;
            case EnumPropName.WidgetVerticalCenter: {
                const widget = this.node.getComponent(cc.Widget);
                if (!widget) {
                    return;
                }
                propData[EnumPropName.WidgetVerticalCenter] = widget.verticalCenter;
            } break;
            case EnumPropName.EditboxString: {
                const editbox = this.node.getComponent(cc.EditBox);
                if (!editbox) {
                    return;
                }
                propData[EnumPropName.EditboxString] = editbox.string;
            } break;
            case EnumPropName.RichTextString: {
                const richText = this.node.getComponent(cc.RichText);
                if (!richText) {
                    return;
                }
                propData[EnumPropName.RichTextString] = richText.string;
            } break;
            case EnumPropName.Euler: {
                (propData[EnumPropName.Euler] as cc.Vec3).set(this.node.eulerAngles);
            } break;
            case EnumPropName.Scale: {
                propData[EnumPropName.Scale] = this.node.scale;
            } break;
            case EnumPropName.Anchor: {
                propData[EnumPropName.Anchor] = cc.v2(this.node.anchorX, this.node.anchorY);
            } break;
            case EnumPropName.Size: {
                propData[EnumPropName.Size] = this.node.getContentSize();
            } break;
            case EnumPropName.Color: {
                propData[EnumPropName.Color] = this.node.color;
            } break;
            case EnumPropName.Opacity: {
                propData[EnumPropName.Opacity] = this.node.opacity;
            } break;
            case EnumPropName.SliderProgress: {
                const slider = this.node.getComponent(cc.Slider);
                if (!slider) {
                    return;
                }
                propData[EnumPropName.SliderProgress] = slider.progress;
            } break;
            case EnumPropName.ProgressBarProgress: {
                const progressBar = this.node.getComponent(cc.ProgressBar);
                if (!progressBar) {
                    return;
                }
                propData[EnumPropName.ProgressBarProgress] = progressBar.progress;
            } break;
            case EnumPropName.GrayScale: {
                StateErrorManager.error("GrayScale属性在Cocos Creator 2.x中需要通过材质实现", {
                    component: "StateSelect",
                    method: "setDefaultProp",
                });
            } break;
            case EnumPropName.ButtonInteractable: {
                const button = this.node.getComponent(cc.Button);
                if (!button) {
                    return;
                }
                propData[EnumPropName.ButtonInteractable] = button.interactable;
            } break;
            case EnumPropName.ToggleIsChecked: {
                const toggle = this.node.getComponent(cc.Toggle);
                if (!toggle) {
                    return;
                }
                propData[EnumPropName.ToggleIsChecked] = toggle.isChecked;
            } break;
            case EnumPropName.ScrollViewEnabled: {
                const scrollView = this.node.getComponent(cc.ScrollView);
                if (!scrollView) {
                    return;
                }
                propData[EnumPropName.ScrollViewEnabled] = scrollView.enabled;
            } break;
            case EnumPropName.MaskEnabled: {
                const mask = this.node.getComponent(cc.Mask);
                if (!mask) {
                    return;
                }
                propData[EnumPropName.MaskEnabled] = mask.enabled;
            } break;
        }

        if (type == this.propKey) {
            this._propValue = propData[this.propKey];
        }
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
            const pos = propData[EnumPropName.Position] as cc.Vec3;
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

            // 如果该状态还没有这个属性，则添加（使用当前节点的值）
            if (statePropData[propKey] == void 0) {
                statePropData[propKey] = currentStateValue;
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
        if (defaultData[propKey] == void 0) {
            defaultData[propKey] = currentStateValue;
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

        // 遍历所有状态，删除指定属性
        for (let stateIndex = 0; stateIndex < ctrl.states.length; stateIndex++) {
            const statePropData = pageData[stateIndex];
            if (statePropData) {
                // 删除属性值
                if (statePropData[propKey] !== undefined) {
                    delete statePropData[propKey];
                    deletedFromStates++;
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

        // 删除默认状态的属性
        const defaultData = this.getDefaultData();
        delete defaultData[propKey];

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

    /** 🔧 检查属性是否已被控制（使用新的controlledProps结构） */
    public isPropertyControlled(propType: EnumPropName): boolean {
        return PropertyControlService.isPropertyControlled(this.getPropData(), propType);
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
            const value = propData[propType];
            if (value === undefined) {
                continue;
            }
            const label = EnumPropName[propType]; // 用 enum 反向查表得到大写英文 name
            result.push(`${label}: ${this.formatPropValue(value)}`);
        }
        return result;
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

    /** 🔧 切换属性控制状态 */
    public togglePropertyControl(propType: EnumPropName, enable: boolean) {
        if (!CC_EDITOR) {
            return;
        }

        StateErrorManager.debug("切换属性控制状态", {
            component: "StateSelect",
            method: "togglePropertyControl",
            params: { propType: EnumPropName[propType], enable },
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
                    currentDisplayProp: EnumPropName[this._currentDisplayProp],
                },
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
                    currentDisplayProp: EnumPropName[this._currentDisplayProp],
                },
            });
        }

        // 嵌套 CCClass 的 setter 触发后，inspector 只刷新子对象区域
        // 需要强制刷新整个 inspector 以使 propValue 可见性变更生效
        // this.forceRefreshInspector();
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

    /** 🔧 智能属性推断：一键配置所有可用属性 */
    public autoConfigureAllProperties(): { enabled: number; skipped: number; failed: number } {
        if (!CC_EDITOR) {
            return { enabled: 0, skipped: 0, failed: 0 };
        }

        StateErrorManager.info("开始一键配置所有可用属性", {
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

        StateErrorManager.info("一键配置完成", {
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

        // 🔧 第三步：检查是否需要创建属性数据
        if (propData.$$propertyData$$[propType] === undefined) {
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

            // 创建属性数据
            propData.$$propertyData$$[propType] = currentValue;

            StateErrorManager.debug("创建新的属性数据", {
                component: "StateSelect",
                method: "addPropertyControl",
                params: { propType: propName, value: currentValue },
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
        this._propValue = propData.$$propertyData$$[propType];

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
                hasData: propData.$$propertyData$$[propType] !== undefined,
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
     *   - $$lastProp$$ 恢复 _propKey / _currentDisplayProp / propValue 显示
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

            // 恢复 lastProp 选中状态 + propValue 显示
            const lastProp = propData.$$lastProp$$;
            if (lastProp !== undefined && lastProp !== EnumPropName.Non) {
                this._propKey = lastProp;
                this._propValue = propData[lastProp];
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
            // 🔧 第一步：从当前状态删除所有相关数据
            const propData = this.getPropData();
            if (propData) {
                // 删除受控属性列表中的条目
                if (propData.$$controlledProps$$) {
                    delete propData.$$controlledProps$$[propName];
                }

                // 删除属性数据
                if (propData.$$propertyData$$) {
                    delete propData.$$propertyData$$[propType];
                }

                // 兼容性：删除旧结构中的数据
                if (propData.$$changedProp$$) {
                    delete propData.$$changedProp$$[propName];
                }
                delete propData[propType]; // 删除直接存储的属性
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
                    delete pageData.$$default$$.$$propertyData$$[propType];
                }
                // 兼容性：删除旧结构中的数据
                if (pageData.$$default$$.$$changedProp$$) {
                    delete pageData.$$default$$.$$changedProp$$[propName];
                }
                delete pageData.$$default$$[propType];
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
