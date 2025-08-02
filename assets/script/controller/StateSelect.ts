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
import { StateController } from "./StateController";
import { EnumCtrlName, EnumPropName, EnumStateName } from "./StateEnum";
import { PropHandlerManager } from "./StatePropHandler";
import { StateErrorManager, ErrorLevel } from "./StateErrorManager";
cc.Enum(EnumCtrlName);
cc.Enum(EnumStateName);
cc.Enum(EnumPropName);

/** 属性类型 */
export type TPropValue = number | boolean | string | cc.Vec3 | cc.Vec2 | cc.Color | cc.Size | cc.Quat | cc.SpriteFrame | cc.Font | undefined;

/** 🔧 架构重构：新的属性数据结构 */
export type TProp = {
    /** 上一次选择的属性 */
    $$lastProp$$?: number

    /** 🔧 新增：受控属性列表（控制复选框状态） */
    $$controlledProps$$?: { [propName: string]: EnumPropName }

    /** 🔧 新增：已变更属性数据（实际保存的数据） */
    $$propertyData$$?: { [propType: number]: TPropValue }

    /** 🔧 兼容性：保留原有的changedProp结构（逐步迁移） */
    $$changedProp$$?: { [name: string]: EnumPropName }

    /** 🔧 兼容性：保留原有的直接属性存储（逐步迁移） */
    [key: number]: TPropValue
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
    /** root节点所有的ctrl */
    @property({ visible: false })
    private _ctrlsMap: { [ctrlId: string]: StateController } = {};

    /** 当前选中的ctrl名称对应的ctrlId */
    @property(EnumCtrlName)
    private _currCtrlId: number = null;

    @property(cc.Node)
    private _root: cc.Node = null;

    /** 控制器所在节点 */
    @property({ type: cc.Node, tooltip: "控制器所在节点，仅提示用" })
    public get root() {
        return this._root;
    }

    /** 当前状态要改变的属性 */
    @property({ type: EnumPropName })
    private _propKey: EnumPropName = null;

    /** 当前状态要改变的属性值 */
    @property
    private _propValue: TPropValue = null;

    /** 🔧 新增：界面标识变量 - 用于标明当前正在展示属性值的属性类型 */
    @property({ type: EnumPropName })
    private _currentDisplayProp: EnumPropName = EnumPropName.Non;

    @property
    private _isDeleteCurr: boolean = false;

    /** 状态数据 */
    @property
    private _ctrlData: TCtrl = {};

    /** 用于检测父节点变化 */
    private lastParent: cc.Node = null;
    private parentCheckInterval: number = null;

    //#region 控制器当前状态
    @property({ type: EnumStateName, tooltip: "控制器当前状态" })
    public get ctrlState() {
        let ctrl = this.getCurrCtrl();
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
        let ctrl = this.getCurrCtrl();
        if (!ctrl) {
            StateErrorManager.warn("ctrlState setter: 控制器为空", {
                component: "StateSelect",
                method: "ctrlState.setter",
            });
            return;
        }
        ctrl.selectedIndex = value;
    }
    //#endregion

    //#region 控制器名称
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
    //#endregion

    //#region  手动刷新检查器
    @property({
        displayName: "🔧 手动刷新检查器",
        tooltip: "强制刷新属性检查器界面，用于解决界面显示异常问题"
    })
    public get manualRefreshInspector() { return false; }
    public set manualRefreshInspector(value: boolean) {
        if (CC_EDITOR && value) {
            this.forceRefreshInspector();
        }
    }
    //#endregion

    //#region 从内存同步数据
    @property({
        displayName: "📥 从内存同步数据",
        tooltip: "从内存中获取已保存的属性数据并更新当前的属性列表显示"
    })
    public get syncFromMemory() { return false; }
    public set syncFromMemory(value: boolean) {
        if (CC_EDITOR && value) {
            this.syncDataFromMemory();
        }
    }
    //#endregion

    //#region 刷新属性列表
    @property({
        displayName: "🔄 刷新属性列表",
        tooltip: "重新检测当前节点支持的属性类型并更新复选框列表"
    })
    public get refreshPropList() { return false; }
    public set refreshPropList(value: boolean) {
        if (CC_EDITOR && value) {
            this.updateAvailableProps();
        }
    }
    //#endregion

    //#region 删除当前属性
    @property({
        displayName: "🗑️ 删除当前属性",
        tooltip: "真正删除内存中的当前属性数据（需要二次确认）"
    })
    public get deleteCurrentProperty() { return false; }
    public set deleteCurrentProperty(value: boolean) {
        if (CC_EDITOR && value) {
            this.deletePropertyWithConfirmation();
        }
    }
    //#endregion

    //#region 重新获取控制器
    /** 🔧 恢复：重新获取StateController功能 */
    @property({
        displayName: "🔄 重新获取控制器",
        tooltip: "手动获取和刷新当前StateSelect组件管理的StateController实例\n\n用途：当StateController发生变化或初始化异常时使用"
    })
    public get reloadController() { return false; }
    public set reloadController(value: boolean) {
        if (CC_EDITOR && value) {
            this.manualReloadController();
        }
    }
    //#endregion

    //#region 属性值
    @property({
        tooltip: "当前状态属性值\n\n🔸 这里显示当前选中属性的值",
        visible: true,
        displayName: "🔸 当前属性值"
    })
    public get propValue() {
        return this._propValue;
    }
    private set propValue(value: any) {
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
        let propData = this.getPropData();
        propData[this.propKey] = value;
        this.updateState(this.getCurrCtrl());
    }
    //#endregion

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
        let ctrl = this.getCurrCtrl();
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
        let propValue = this.handleValue(value);
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
        let itself = this;
        let propData = itself.getPropData();

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
        let propData = this.getPropData();
        let lastProp = propData.$$lastProp$$;

        // 🔧 修复：确保lastProp不为0（EnumPropName.Non），因为0代表"不选择"状态
        if (lastProp && lastProp > EnumPropName.Non) {
            this.propKey = lastProp;
        }
        else {
            this.propKey = EnumPropName.Non;
        }
    }


    private _isPreload = false;

    // eslint-disable-next-line @typescript-eslint/naming-convention
    protected __preload() {
        if (!CC_EDITOR) {
            return;
        }
        if (this._isPreload) {
            StateErrorManager.debug("跳过重复预加载", {
                component: "StateSelect",
                method: "__preload",
            });
            return;
        }
        this._isPreload = true;

        StateErrorManager.debug("开始StateSelect预加载", {
            component: "StateSelect",
            method: "__preload",
            params: { hasCurrentCtrl: !!this.currCtrlId },
        });

        // 🔧 第一步：初始化控制器映射
        this.updateCtrlName(this.node.parent);

        // 🔧 第二步：如果没有当前控制器，尝试自动选择第一个
        if (!this.currCtrlId) {
            let ctrlIdKeys = Object.keys(this._ctrlsMap);
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
                // @ts-ignore
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

    /** 父节点改变 */
    private parentChanged(oldParent: cc.Node) {
        this.transPosition(oldParent);
    }

    /** 节点active改变 */
    private activeChanged(node: cc.Node) {
        this.setDefaultPorp(EnumPropName.Active);
    }

    /** 节点位置改变 */
    private positionChanged() {
        this.setDefaultPorp(EnumPropName.Position);
    }

    /** 节点旋转改变 */
    private rotationChanged() {
        this.setDefaultPorp(EnumPropName.Euler);
    }

    /** 节点缩放改变 */
    private scaleChanged() {
        this.setDefaultPorp(EnumPropName.Scale);
    }

    /** 节点大小改变 */
    private sizeChanged(size: cc.Size) {
        this.setDefaultPorp(EnumPropName.Size);
    }

    /** 锚点改变 */
    private anchorChanged(anchor: cc.Vec2) {
        this.setDefaultPorp(EnumPropName.Anchor);
    }

    /** 颜色改变 */
    private colorChanged(color: cc.Color) {
        this.setDefaultPorp(EnumPropName.Color);
    }

    /** 图片改变 */
    private spriteFrameChanged(sprite: cc.Sprite) {
        this.setDefaultPorp(EnumPropName.SpriteFrame);
    }

    /** 检查父节点是否变化 */
    private checkParentChanged() {
        // 安全检查：确保节点仍然有效
        if (!this.node || !this.node.isValid) {
            return;
        }

        let currentParent = this.node.parent;

        if (this.lastParent !== currentParent) {
            let oldParent = this.lastParent;
            this.lastParent = currentParent;

            // 新增：检查控制器承接
            this.handleControllerTransition(oldParent, currentParent);

            // 只有当有Position属性被控制时才需要转换坐标
            let pageData = this.getPageData();
            let hasPositionControl = false;
            for (let state in pageData) {
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
        let oldCtrls = oldParent ? this.getCtrls(oldParent) : [];
        let oldCtrl = oldCtrls.find(ctrl => ctrl.ctrlId === this.currCtrlId);

        // 获取新控制器
        let newCtrls = newParent ? this.getCtrls(newParent) : [];
        let newCtrl = this.selectBestController(newCtrls, oldCtrl);

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
            let oldCtrlData = this._ctrlData[oldCtrl.ctrlId];

            if (oldCtrlData) {
                // 2. 将数据迁移到新控制器
                // 需要根据新控制器的状态数量调整数据结构
                let transferredData = this.adaptDataToNewController(oldCtrlData, newCtrl);
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
    private adaptDataToNewController(oldData: any, newCtrl: StateController): any {
        let newData: any = {};

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
    private deepCloneStateData(data: any): any {
        // 🔧 快速退出：处理非对象类型
        if (!data || typeof data !== "object") {
            return data;
        }

        // 🔧 优化：预检查对象属性数量，空对象直接返回
        let keys = Object.keys(data);
        if (keys.length === 0) {
            return {};
        }

        let cloned: any = {};

        for (let i = 0, len = keys.length; i < len; i++) {
            let key = keys[i];
            let value = data[key];

            // 🔧 快速处理：基本类型直接复制
            if (!value || typeof value !== "object") {
                cloned[key] = value;
                continue;
            }
            let constructor = value.constructor;
            if (constructor === cc.Vec3) {
                // 🔧 Vec3: 直接使用现有值创建新对象
                cloned[key] = cc.v3(value.x, value.y, value.z);
            }
            else if (constructor === cc.Vec2) {
                // 🔧 Vec2: 直接使用现有值创建新对象
                cloned[key] = cc.v2(value.x, value.y);
            }
            else if (constructor === cc.Color) {
                // 🔧 Color: 直接使用RGBA值创建新对象
                cloned[key] = cc.color(value.r, value.g, value.b, value.a);
            }
            else if (constructor === cc.Size) {
                // 🔧 Size: 直接使用宽高值创建新对象
                cloned[key] = cc.size(value.width, value.height);
            }
            else if (value instanceof cc.Asset) {
                // 🔧 Asset对象：直接保留引用（SpriteFrame、Font等）
                cloned[key] = value;
            }
            else {
                // 🔧 其他对象：浅拷贝（如$$changedProp$$等元数据对象）
                cloned[key] = { ...value };
            }
        }

        return cloned;
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
            let oldStatesCount = oldCtrl.states.length;
            let matchingCtrl = newCtrls.find(ctrl => ctrl.states.length === oldStatesCount);
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

        let ctrls = this.getCtrls(node);
        let arr = ctrls.map((val, i) => {
            if (this._ctrlsMap[val.ctrlId] == void 0) {
                this._ctrlsMap[val.ctrlId] = val;
            }
            return { name: val.ctrlName, value: val.ctrlId };
        });
        // @ts-ignore
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
        let ctrls = node.getComponents(StateController);
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

    /** 更新状态数量 */
    public updateCtrlPage(ctrl: StateController, deleteIndex?: number) {
        let itself = this;
        if (!CC_EDITOR) {
            return;
        }

        if (!ctrl || ctrl.ctrlId != itself.currCtrlId) {
            return;
        }

        if (deleteIndex != void 0 && deleteIndex != -1) {
            itself.handleStateDelete(ctrl, deleteIndex);
        }

        // 🔧 更新状态枚举列表
        itself.updateStateEnumList(ctrl);
    }

    /** 🔧 新增：处理状态删除逻辑 */
    private handleStateDelete(ctrl: StateController, deleteIndex: number) {
        StateErrorManager.debug("开始处理状态删除", {
            component: "StateSelect",
            method: "handleStateDelete",
            params: { deleteIndex: deleteIndex, ctrlId: ctrl.ctrlId },
        });

        // 🔧 严格验证删除索引
        if (deleteIndex < 0 || deleteIndex >= ctrl.states.length) {
            StateErrorManager.warn("无效的删除索引", {
                component: "StateSelect",
                method: "handleStateDelete",
                params: { deleteIndex: deleteIndex, stateCount: ctrl.states.length },
            });
            return;
        }

        let pageData = this.getPageData();
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
    private migrateStateData(pageData: any, deleteIndex: number, statesLength: number) {
        // 🔧 将删除位置后面的状态数据前移
        for (let state = deleteIndex; state < statesLength; state++) {
            let nextStateData = pageData[state + 1];
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
    private cleanupDeletedStateProps(pageData: any, ctrl: StateController, deletedStateIndex: number) {
        // 🔧 获取被删除状态的属性数据
        let deletedStateData = pageData[deletedStateIndex];
        if (!deletedStateData || typeof deletedStateData !== "object") {
            return;
        }

        // 🔧 检查每个属性是否在其他状态中还存在
        for (let prop in deletedStateData) {
            // 🔧 跳过元数据属性
            if (prop.startsWith("$$")) {
                continue;
            }

            // 🔧 检查其他状态是否还有这个属性
            let isUsedInOtherStates = this.isOtherHans(ctrl, prop);
            if (!isUsedInOtherStates) {
                // 🔧 如果其他状态都没有这个属性，从默认状态中删除
                let defaultData = pageData.$$default$$;
                if (defaultData && defaultData[prop] != void 0) {
                    delete defaultData[prop];
                }
            }
        }

        // 🔧 更新已更改属性的显示
        this.updateChangedProp();
    }

    /** 🔧 新增：更新状态枚举列表 */
    private updateStateEnumList(ctrl: StateController) {
        let itself = this;

        if (!ctrl || !ctrl.states) {
            StateErrorManager.warn("控制器或状态数据无效", {
                component: "StateSelect",
                method: "updateStateEnumList",
            });
            return;
        }

        // 🔧 生成状态枚举数组
        let enumList = ctrl.states.map((state, index) => {
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
            // @ts-ignore
            cc.Class.Attr.setClassAttr(itself, "ctrlState", "enumList", enumList);
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
            // @ts-ignore
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
        let propdata = this.getPropData();
        let arr = [];
        for (let name in propdata.$$changedProp$$) {
            arr.push(name);
        }
        this.changedProp = arr;
    }





    /** 🔧 新增：检查节点是否有对应属性的组件 */
    private checkNodeHasComponentForProp(propType: EnumPropName): boolean {
        if (!this.node || !this.node.isValid) {
            return false;
        }

        switch (propType) {
            case EnumPropName.LabelString:
            case EnumPropName.Font:
                return !!this.node.getComponent(cc.Label);
            case EnumPropName.LabelOutlineColor:
                return !!this.node.getComponent(cc.LabelOutline);
            case EnumPropName.SpriteFrame:
                return !!this.node.getComponent(cc.Sprite);
            case EnumPropName.SliderProgress:
                return !!this.node.getComponent(cc.Slider);
            case EnumPropName.EditboxString:
                return !!this.node.getComponent(cc.EditBox);
            case EnumPropName.GrayScale:
                // GrayScale是自定义组件，这里假设检查方式
                return !!this.node.getComponent("GrayScale");
            default:
                return false;
        }
    }

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
        let currentPropKey = this.propKey;
        let isAutoSync = this.autoSyncEnabled;
        let shouldKeepPropKey = isAutoSync && currentPropKey !== EnumPropName.Non;

        // 🔧 第二步：获取状态数据
        let propData = this.getPropData(ctrl.selectedIndex, ctrl.ctrlId);
        let defaultData = this.getDefaultData(ctrl.ctrlId);

        // 🔧 第三步：构建属性更新批次
        let updateBatch: { type: EnumPropName, value: TPropValue }[] = [];
        for (let key in defaultData) {
            let value = propData[key] != void 0 ? propData[key] : defaultData[key];
            updateBatch.push({ type: Number(key), value: value });
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
        for (let update of updateBatch) {
            let { type, value } = update;

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
    private isOtherHans(ctrl: StateController, prop: number | string) {
        let pageData = this.getPageData();
        for (let index = 0, len = ctrl.states.length; index < len; index++) {
            let propData = pageData[index] || {};
            // @ts-ignore
            if (propData[prop] != void 0) {
                return true;
            }
        }
        return false;
    }

    /** 获取某个控制器的状态数据 */
    private getPageData(ctrlId?: number) {
        ctrlId = ctrlId != void 0 ? ctrlId : this.currCtrlId;
        if (this._ctrlData[ctrlId] == void 0) {
            this._ctrlData[ctrlId] = {};
        }
        return this._ctrlData[ctrlId];
    }

    /** 获取某个状态的属性数据 */
    private getPropData(state?: number, ctrlId?: number) {
        let pageData = this.getPageData(ctrlId);
        state = state != void 0 ? state : this.ctrlState;
        if (pageData[state] == void 0) {
            pageData[state] = {};
        }
        return pageData[state];
    }

    /** 获取默认属性 */
    private getDefaultData(ctrlId?: number) {
        let pageData = this.getPageData(ctrlId);
        if (pageData.$$default$$ == void 0) {
            pageData.$$default$$ = {};
        }
        return pageData.$$default$$;
    }

    private setPropValue(type: EnumPropName) {
        let value = this.handleValue(type);
        if (value == void 0) {
            // @ts-ignore
            cc.Class.Attr.setClassAttr(this, "propValue", "visible", false);
            return void 0;
        }
        // @ts-ignore
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
    private setDefaultPorp(type: EnumPropName) {
        if (!CC_EDITOR) {
            return;
        }
        if (this._isFromCtrl) {
            return;// 不是编辑器改变
        }

        StateErrorManager.debug("检测到编辑器属性变化", {
            component: "StateSelect",
            method: "setDefaultPorp",
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
                    method: "setDefaultPorp",
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
                let label = this.node.getComponent(cc.Label);
                if (!label) {
                    return;
                }
                propData[EnumPropName.LabelString] = label.string;
            } break;
            case EnumPropName.Font: {
                let label = this.node.getComponent(cc.Label);
                if (!label) {
                    return;
                }
                propData[EnumPropName.Font] = label.font;
            } break;
            case EnumPropName.LabelOutlineColor: {
                let labelOutline = this.node.getComponent(cc.LabelOutline);
                if (!labelOutline) {
                    return;
                }
                (propData[EnumPropName.LabelOutlineColor] as cc.Color).set(labelOutline.color);
            } break;
            case EnumPropName.SpriteFrame: {
                let sprite = this.node.getComponent(cc.Sprite);
                if (!sprite) {
                    return;
                }
                propData[EnumPropName.SpriteFrame] = sprite.spriteFrame;
            } break;
            case EnumPropName.EditboxString: {
                let editbox = this.node.getComponent(cc.EditBox);
                if (!editbox) {
                    return;
                }
                propData[EnumPropName.EditboxString] = editbox.string;
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
                let slider = this.node.getComponent(cc.Slider);
                if (!slider) {
                    return;
                }
                propData[EnumPropName.SliderProgress] = slider.progress;
            } break;
            case EnumPropName.GrayScale: {
                StateErrorManager.error("GrayScale属性在Cocos Creator 2.x中需要通过材质实现", {
                    component: "StateSelect",
                    method: "setDefaultPorp",
                });
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

        let parent = this.node.parent;
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

        let pageData = this.getPageData();

        for (let state in pageData) {
            let propData = pageData[state];
            let pos = propData[EnumPropName.Position] as cc.Vec3;
            if (pos) {
                try {
                    // 在 2.x 中，需要手动计算坐标转换
                    let worldPos = oldParent.convertToWorldSpaceAR(pos);
                    let localPos = parent.convertToNodeSpaceAR(worldPos);
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
        let ctrl = this.getCurrCtrl();
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

        let pageData = this.getPageData();
        let currentStateValue = this.handleValue(propKey); // 获取当前节点的属性值作为默认值

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
            let statePropData = pageData[stateIndex];

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
        let defaultData = this.getDefaultData();
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
        let ctrl = this.getCurrCtrl();
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

        let pageData = this.getPageData();
        let name = EnumPropName[propKey];
        let deletedFromStates = 0;

        // 遍历所有状态，删除指定属性
        for (let stateIndex = 0; stateIndex < ctrl.states.length; stateIndex++) {
            let statePropData = pageData[stateIndex];
            if (statePropData) {
                // 删除属性值
                if (statePropData[propKey] !== undefined) {
                    delete statePropData[propKey];
                    deletedFromStates++;
                }

                // 删除changedProp记录
                let $$changedProp$$ = statePropData.$$changedProp$$ || {};
                delete $$changedProp$$[name];

                // 如果删除的是当前状态的lastProp，重置为Non
                if (statePropData.$$lastProp$$ === propKey) {
                    statePropData.$$lastProp$$ = EnumPropName.Non;
                }
            }
        }

        // 删除默认状态的属性
        let defaultData = this.getDefaultData();
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
    //#region 属性复选框
    /** 🔧 新增：可用属性复选框 - Active */
    @property({
        displayName: "☑️ 显示/隐藏 (Active)",
        tooltip: "控制节点的显示和隐藏状态\n\n� 提示：当前选中的属性会在属性值字段中显示",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.Active) && this._currentDisplayProp !== EnumPropName.Active;
        }
    })
    public get propActive() {
        return this.isPropertyControlled(EnumPropName.Active);
    }
    public set propActive(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.Active, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - Active (选中状态) */
    @property({
        displayName: "🔸 显示/隐藏 (Active) [当前选中]",
        tooltip: "控制节点的显示和隐藏状态\n\n🔸 当前正在编辑此属性的值",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.Active) && this._currentDisplayProp === EnumPropName.Active;
        }
    })
    public get propActiveSelected() {
        return this.isPropertyControlled(EnumPropName.Active);
    }
    public set propActiveSelected(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.Active, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - Position */
    @property({
        displayName: "☑️ 位置 (Position)",
        tooltip: "节点在父节点中的相对位置",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.Position) && this._currentDisplayProp !== EnumPropName.Position;
        }
    })
    public get propPosition() {
        return this.isPropertyControlled(EnumPropName.Position);
    }
    public set propPosition(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.Position, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - Position (选中状态) */
    @property({
        displayName: "🔸 位置 (Position) [当前选中]",
        tooltip: "节点在父节点中的相对位置\n\n🔸 当前正在编辑此属性的值",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.Position) && this._currentDisplayProp === EnumPropName.Position;
        }
    })
    public get propPositionSelected() {
        return this.isPropertyControlled(EnumPropName.Position);
    }
    public set propPositionSelected(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.Position, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - Scale */
    @property({
        displayName: "☑️ 缩放 (Scale)",
        tooltip: "节点的缩放比例",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.Scale) && this._currentDisplayProp !== EnumPropName.Scale;
        }
    })
    public get propScale() {
        return this.isPropertyControlled(EnumPropName.Scale);
    }
    public set propScale(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.Scale, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - Scale (选中状态) */
    @property({
        displayName: "🔸 缩放 (Scale) [当前选中]",
        tooltip: "节点的缩放比例\n\n🔸 当前正在编辑此属性的值",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.Scale) && this._currentDisplayProp === EnumPropName.Scale;
        }
    })
    public get propScaleSelected() {
        return this.isPropertyControlled(EnumPropName.Scale);
    }
    public set propScaleSelected(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.Scale, value);
        }
    }


    /** 🔧 新增：可用属性复选框 - Color */
    @property({
        displayName: "☑️ 颜色 (Color)",
        tooltip: "节点的颜色",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.Color) && this._currentDisplayProp !== EnumPropName.Color;
        }
    })
    public get propColor() {
        return this.isPropertyControlled(EnumPropName.Color);
    }
    public set propColor(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.Color, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - Color (选中状态) */
    @property({
        displayName: "🔸 颜色 (Color) [当前选中]",
        tooltip: "节点的颜色\n\n🔸 当前正在编辑此属性的值",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.Color) && this._currentDisplayProp === EnumPropName.Color;
        }
    })
    public get propColorSelected() {
        return this.isPropertyControlled(EnumPropName.Color);
    }
    public set propColorSelected(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.Color, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - Size */
    @property({
        displayName: "☑️ 尺寸 (Size)",
        tooltip: "节点的宽度和高度",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.Size) && this._currentDisplayProp !== EnumPropName.Size;
        }
    })
    public get propSize() {
        return this.isPropertyControlled(EnumPropName.Size);
    }
    public set propSize(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.Size, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - Size (选中状态) */

    @property({
        displayName: "🔸 尺寸 (Size) [当前选中]",
        tooltip: "节点的宽度和高度\n\n🔸 当前正在编辑此属性的值",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.Size) && this._currentDisplayProp === EnumPropName.Size;
        }
    })
    public get propSizeSelected() {
        return this.isPropertyControlled(EnumPropName.Size);
    }
    public set propSizeSelected(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.Size, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - Euler */
    @property({
        displayName: "☑️ 旋转 (Euler)",
        tooltip: "节点的欧拉角旋转",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.Euler) && this._currentDisplayProp !== EnumPropName.Euler;
        }
    })
    public get propEuler() {
        return this.isPropertyControlled(EnumPropName.Euler);
    }
    public set propEuler(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.Euler, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - Euler (选中状态) */
    @property({
        displayName: "🔸 旋转 (Euler) [当前选中]",
        tooltip: "节点的欧拉角旋转\n\n🔸 当前正在编辑此属性的值",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.Euler) && this._currentDisplayProp === EnumPropName.Euler;
        }
    })
    public get propEulerSelected() {
        return this.isPropertyControlled(EnumPropName.Euler);
    }
    public set propEulerSelected(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.Euler, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - Anchor */
    @property({
        displayName: "☑️ 锚点 (Anchor)",
        tooltip: "节点的锚点位置",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.Anchor) && this._currentDisplayProp !== EnumPropName.Anchor;
        }
    })
    public get propAnchor() {
        return this.isPropertyControlled(EnumPropName.Anchor);
    }
    public set propAnchor(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.Anchor, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - Anchor (选中状态) */
    @property({
        displayName: "🔸 锚点 (Anchor) [当前选中]",
        tooltip: "节点的锚点位置\n\n🔸 当前正在编辑此属性的值",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.Anchor) && this._currentDisplayProp === EnumPropName.Anchor;
        }
    })
    public get propAnchorSelected() {
        return this.isPropertyControlled(EnumPropName.Anchor);
    }
    public set propAnchorSelected(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.Anchor, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - Opacity */
    @property({
        displayName: "☑️ 透明度 (Opacity)",
        tooltip: "节点的透明度",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.Opacity) && this._currentDisplayProp !== EnumPropName.Opacity;
        }
    })
    public get propOpacity() {
        return this.isPropertyControlled(EnumPropName.Opacity);
    }
    public set propOpacity(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.Opacity, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - Opacity (选中状态) */
    @property({
        displayName: "🔸 透明度 (Opacity) [当前选中]",
        tooltip: "节点的透明度\n\n🔸 当前正在编辑此属性的值",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.Opacity) && this._currentDisplayProp === EnumPropName.Opacity;
        }
    })
    public get propOpacitySelected() {
        return this.isPropertyControlled(EnumPropName.Opacity);
    }
    public set propOpacitySelected(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.Opacity, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - LabelString */
    @property({
        displayName: "☑️ 文本内容 (LabelString)",
        tooltip: "Label组件的文本内容",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.LabelString) && this._currentDisplayProp !== EnumPropName.LabelString;
        }
    })
    public get propLabelString() {
        return this.isPropertyControlled(EnumPropName.LabelString);
    }
    public set propLabelString(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.LabelString, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - LabelString (选中状态) */
    @property({
        displayName: "🔸 文本内容 (LabelString) [当前选中]",
        tooltip: "Label组件的文本内容\n\n🔸 当前正在编辑此属性的值",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.LabelString) && this._currentDisplayProp === EnumPropName.LabelString;
        }
    })
    public get propLabelStringSelected() {
        return this.isPropertyControlled(EnumPropName.LabelString);
    }
    public set propLabelStringSelected(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.LabelString, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - SpriteFrame */
    @property({
        displayName: "☑️ 图片 (SpriteFrame)",
        tooltip: "Sprite组件的图片资源",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.SpriteFrame) && this._currentDisplayProp !== EnumPropName.SpriteFrame;
        }
    })
    public get propSpriteFrame() {
        return this.isPropertyControlled(EnumPropName.SpriteFrame);
    }
    public set propSpriteFrame(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.SpriteFrame, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - SpriteFrame (选中状态) */

    @property({
        displayName: "🔸 图片 (SpriteFrame) [当前选中]",
        tooltip: "Sprite组件的图片资源\n\n🔸 当前正在编辑此属性的值",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.SpriteFrame) && this._currentDisplayProp === EnumPropName.SpriteFrame;
        }
    })
    public get propSpriteFrameSelected() {
        return this.isPropertyControlled(EnumPropName.SpriteFrame);
    }
    public set propSpriteFrameSelected(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.SpriteFrame, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - Font */
    @property({
        displayName: "☑️ 字体 (Font)",
        tooltip: "Label组件的字体资源",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.Font) && this._currentDisplayProp !== EnumPropName.Font;
        }
    })
    public get propFont() {
        return this.isPropertyControlled(EnumPropName.Font);
    }
    public set propFont(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.Font, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - Font (选中状态) */

    @property({
        displayName: "🔸 字体 (Font) [当前选中]",
        tooltip: "Label组件的字体资源\n\n🔸 当前正在编辑此属性的值",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.Font) && this._currentDisplayProp === EnumPropName.Font;
        }
    })
    public get propFontSelected() {
        return this.isPropertyControlled(EnumPropName.Font);
    }
    public set propFontSelected(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.Font, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - LabelOutlineColor */
    @property({
        displayName: "☑️ 描边颜色 (LabelOutlineColor)",
        tooltip: "Label描边组件的颜色",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.LabelOutlineColor) && this._currentDisplayProp !== EnumPropName.LabelOutlineColor;
        }
    })
    public get propLabelOutlineColor() {
        return this.isPropertyControlled(EnumPropName.LabelOutlineColor);
    }
    public set propLabelOutlineColor(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.LabelOutlineColor, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - LabelOutlineColor (选中状态) */

    @property({
        displayName: "🔸 描边颜色 (LabelOutlineColor) [当前选中]",
        tooltip: "Label描边组件的颜色\n\n🔸 当前正在编辑此属性的值",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.LabelOutlineColor) && this._currentDisplayProp === EnumPropName.LabelOutlineColor;
        }
    })
    public get propLabelOutlineColorSelected() {
        return this.isPropertyControlled(EnumPropName.LabelOutlineColor);
    }
    public set propLabelOutlineColorSelected(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.LabelOutlineColor, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - SliderProgress */
    @property({
        displayName: "☑️ 滑动条进度 (SliderProgress)",
        tooltip: "Slider组件的进度值",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.SliderProgress) && this._currentDisplayProp !== EnumPropName.SliderProgress;
        }
    })
    public get propSliderProgress() {
        return this.isPropertyControlled(EnumPropName.SliderProgress);
    }
    public set propSliderProgress(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.SliderProgress, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - SliderProgress (选中状态) */
    @property({
        displayName: "🔸 滑动条进度 (SliderProgress) [当前选中]",
        tooltip: "Slider组件的进度值\n\n🔸 当前正在编辑此属性的值",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.SliderProgress) && this._currentDisplayProp === EnumPropName.SliderProgress;
        }
    })
    public get propSliderProgressSelected() {
        return this.isPropertyControlled(EnumPropName.SliderProgress);
    }
    public set propSliderProgressSelected(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.SliderProgress, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - EditboxString */
    @property({
        displayName: "☑️ 输入框文本 (EditboxString)",
        tooltip: "EditBox组件的文本内容",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.EditboxString) && this._currentDisplayProp !== EnumPropName.EditboxString;
        }
    })
    public get propEditboxString() {
        return this.isPropertyControlled(EnumPropName.EditboxString);
    }
    public set propEditboxString(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.EditboxString, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - EditboxString (选中状态) */
    @property({
        displayName: "🔸 输入框文本 (EditboxString) [当前选中]",
        tooltip: "EditBox组件的文本内容\n\n🔸 当前正在编辑此属性的值",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.EditboxString) && this._currentDisplayProp === EnumPropName.EditboxString;
        }
    })
    public get propEditboxStringSelected() {
        return this.isPropertyControlled(EnumPropName.EditboxString);
    }
    public set propEditboxStringSelected(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.EditboxString, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - GrayScale */
    @property({
        displayName: "☑️ 灰度效果 (GrayScale)",
        tooltip: "灰度材质效果",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.GrayScale) && this._currentDisplayProp !== EnumPropName.GrayScale;
        }
    })
    public get propGrayScale() {
        return this.isPropertyControlled(EnumPropName.GrayScale);
    }
    public set propGrayScale(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.GrayScale, value);
        }
    }

    /** 🔧 新增：可用属性复选框 - GrayScale (选中状态) */
    @property({
        displayName: "🔸 灰度效果 (GrayScale) [当前选中]",
        tooltip: "灰度材质效果\n\n🔸 当前正在编辑此属性的值",
        visible: function () {
            return this.isPropertyAvailable(EnumPropName.GrayScale) && this._currentDisplayProp === EnumPropName.GrayScale;
        }
    })
    public get propGrayScaleSelected() {
        return this.isPropertyControlled(EnumPropName.GrayScale);
    }
    public set propGrayScaleSelected(value: boolean) {
        if (CC_EDITOR) {
            this.togglePropertyControl(EnumPropName.GrayScale, value);
        }
    }

    //#endregion

    // ============== 🔧 新增：简化的属性管理方法 ==============

    /** 🔧 新增：获取属性的显示名称 */
    private getPropertyDisplayName(propType: EnumPropName): string {
        const propNames = {
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
            [EnumPropName.GrayScale]: "灰度效果"
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

    /** 🔧 检查属性是否可用（节点是否支持该属性类型） */
    private isPropertyAvailable(propType: EnumPropName): boolean {
        if (!this.node || !this.node.isValid) {
            return false;
        }

        // 节点基础属性总是可用
        const nodeBasicProps = [
            EnumPropName.Active,
            EnumPropName.Position,
            EnumPropName.Scale,
            EnumPropName.Color,
            EnumPropName.Size,
            EnumPropName.Euler,
            EnumPropName.Anchor,
            EnumPropName.Opacity
        ];

        if (nodeBasicProps.includes(propType)) {
            return true;
        }

        // 检查组件依赖的属性
        return this.checkNodeHasComponentForProp(propType);
    }

    /** 🔧 架构重构：检查属性是否已被控制（使用新的controlledProps结构） */
    private isPropertyControlled(propType: EnumPropName): boolean {
        const propData = this.getPropData();
        if (!propData) {
            return false;
        }

        // 🔧 优先使用新的controlledProps结构
        const controlledProps = propData.$$controlledProps$$ || {};
        const propName = EnumPropName[propType];

        if (controlledProps[propName] !== undefined) {
            return true;
        }

        // 🔧 兼容性：检查旧的changedProp结构
        const changedProp = propData.$$changedProp$$ || {};
        return !!changedProp[propName];
    }

    /** 🔧 切换属性控制状态 */
    private togglePropertyControl(propType: EnumPropName, enable: boolean) {
        if (!CC_EDITOR) {
            return;
        }

        StateErrorManager.debug("切换属性控制状态", {
            component: "StateSelect",
            method: "togglePropertyControl",
            params: { propType: EnumPropName[propType], enable }
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
                    currentDisplayProp: EnumPropName[this._currentDisplayProp]
                }
            });
        } else {
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
                    currentDisplayProp: EnumPropName[this._currentDisplayProp]
                }
            });
        }
    }

    /** 🔧 架构重构：添加属性控制（分离控制状态和数据状态） */
    private addPropertyControl(propType: EnumPropName) {
        const propData = this.getPropData();
        if (!propData) {
            StateErrorManager.warn("无法获取属性数据", {
                component: "StateSelect",
                method: "addPropertyControl",
                params: { propType: EnumPropName[propType] }
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
                    params: { propType: propName }
                });
                return;
            }

            // 创建属性数据
            propData.$$propertyData$$[propType] = currentValue;

            StateErrorManager.debug("创建新的属性数据", {
                component: "StateSelect",
                method: "addPropertyControl",
                params: { propType: propName, value: currentValue }
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
                isControlled: !!propData.$$controlledProps$$[propName]
            }
        });
    }

    /** 🔧 架构重构：移除属性控制（只影响控制状态，保留数据） */
    private removePropertyControl(propType: EnumPropName) {
        const propData = this.getPropData();
        if (!propData) {
            StateErrorManager.warn("无法获取属性数据", {
                component: "StateSelect",
                method: "removePropertyControl",
                params: { propType: EnumPropName[propType] }
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
                controlRemoved: !propData.$$controlledProps$$ || !propData.$$controlledProps$$[propName]
            }
        });
    }

    /** 🔧 更新可用属性列表（刷新按钮调用） */
    private updateAvailableProps() {
        if (!CC_EDITOR) {
            return;
        }

        StateErrorManager.info("刷新属性列表", {
            component: "StateSelect",
            method: "updateAvailableProps"
        });

        // 强制刷新编辑器界面（简化实现）
        // 在Cocos Creator 2.x中，属性面板会自动刷新
    }

    /** 🔧 恢复：强制刷新属性检查器 */
    private forceRefreshInspector() {
        if (!CC_EDITOR) {
            return;
        }

        try {
            // 尝试多种刷新方式
            if (typeof Editor !== 'undefined' && Editor.Utils && Editor.Utils.refreshSelectedInspector) {
                // @ts-ignore
                Editor.Utils.refreshSelectedInspector("node", this.node.uuid);
                StateErrorManager.info("属性检查器已刷新（方式1）", {
                    component: "StateSelect",
                    method: "forceRefreshInspector",
                });
            } else if ((cc as any).engine && (cc as any).engine.repaintInEditMode) {
                (cc as any).engine.repaintInEditMode();
                StateErrorManager.info("属性检查器已刷新（方式2）", {
                    component: "StateSelect",
                    method: "forceRefreshInspector",
                });
            } else {
                // 备用方案：触发属性变化
                this.node.emit('inspector-refresh');
                StateErrorManager.info("属性检查器已刷新（方式3）", {
                    component: "StateSelect",
                    method: "forceRefreshInspector",
                });
            }
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
    private manualReloadController() {
        if (!CC_EDITOR) {
            return;
        }

        StateErrorManager.info("开始手动重新获取控制器", {
            component: "StateSelect",
            method: "manualReloadController",
            params: { currentCtrlId: this.currCtrlId }
        });

        try {
            // 🔧 第一步：重置预加载状态
            this._isPreload = false;

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
                    propKey: this._propKey ? EnumPropName[this._propKey] : "None"
                }
            });

        } catch (error) {
            StateErrorManager.error("控制器重新获取失败", {
                component: "StateSelect",
                method: "manualReloadController",
                params: { error: error.message }
            });
        }
    }

    /** 🔧 修复：从内存同步数据（包含复选框状态更新） */
    private syncDataFromMemory() {
        if (!CC_EDITOR) {
            return;
        }

        StateErrorManager.info("开始从内存同步数据", {
            component: "StateSelect",
            method: "syncDataFromMemory"
        });

        try {
            // 获取当前状态的属性数据
            const propData = this.getPropData();
            if (!propData) {
                StateErrorManager.warn("无法获取属性数据", {
                    component: "StateSelect",
                    method: "syncDataFromMemory"
                });
                return;
            }

            Editor.log("propData: ", propData);

            // 🔧 架构重构：处理新的数据结构
            // 确保新的数据结构存在
            propData.$$controlledProps$$ = propData.$$controlledProps$$ || {};
            propData.$$propertyData$$ = propData.$$propertyData$$ || {};
            propData.$$changedProp$$ = propData.$$changedProp$$ || {};

            const controlledProps = propData.$$controlledProps$$;
            const propertyData = propData.$$propertyData$$;
            const changedProp = propData.$$changedProp$$;

            // 🔧 第一步：迁移旧数据到新结构
            const migratedProps: string[] = [];
            for (const key in propData) {
                // 跳过特殊键
                if (key.startsWith('$$')) {
                    continue;
                }

                // 检查是否为有效的属性类型数字键
                const propType = parseInt(key);
                if (!isNaN(propType) && propType in EnumPropName && propType !== EnumPropName.Non) {
                    const propName = EnumPropName[propType];
                    const propValue = propData[propType];

                    // 迁移到新的propertyData结构
                    if (propertyData[propType] === undefined && propValue !== undefined) {
                        propertyData[propType] = propValue;
                        migratedProps.push(propName);

                        StateErrorManager.debug("迁移属性数据到新结构", {
                            component: "StateSelect",
                            method: "syncDataFromMemory",
                            params: { propName, propType, propValue }
                        });
                    }
                }
            }

            // 🔧 第二步：重建受控属性列表
            const rebuiltControlProps: string[] = [];

            // 从propertyData重建controlledProps
            for (const propType in propertyData) {
                const propTypeNum = parseInt(propType);
                if (!isNaN(propTypeNum) && propTypeNum in EnumPropName && propTypeNum !== EnumPropName.Non) {
                    const propName = EnumPropName[propTypeNum];

                    if (!controlledProps[propName]) {
                        controlledProps[propName] = propTypeNum;
                        rebuiltControlProps.push(propName);
                    }
                }
            }

            // 从旧的changedProp重建controlledProps（兼容性）
            for (const propName in changedProp) {
                const propType = changedProp[propName];
                if (!controlledProps[propName]) {
                    controlledProps[propName] = propType;
                    rebuiltControlProps.push(propName);
                }
            }

            // 🔧 第三步：同步controlledProps到changedProp（兼容性）
            for (const propName in controlledProps) {
                const propType = controlledProps[propName];
                changedProp[propName] = propType;
            }

            Editor.log("迁移的属性数据:", migratedProps);
            Editor.log("重建的受控属性:", rebuiltControlProps);
            Editor.log("最终的controlledProps:", controlledProps);
            Editor.log("最终的propertyData:", propertyData);

            // 🔧 修复：更新changedProp显示
            this.updateChangedProp();

            // 🔧 新增：强制刷新属性检查器以更新复选框状态
            // 在Cocos Creator中，属性复选框的状态是通过getter方法动态计算的
            // 调用forceRefreshInspector来触发界面重新渲染
            this.forceRefreshInspector();

            // 🔧 修复：如果有上次选择的属性，恢复选择并更新界面标识
            const lastProp = propData.$$lastProp$$;
            if (lastProp && lastProp !== EnumPropName.Non) {
                this._propKey = lastProp;
                this._propValue = propData[lastProp];

                // 🔧 关键：同时更新界面标识变量
                this._currentDisplayProp = lastProp;

                // 🔧 修复：显示属性值字段
                this.setPropValue(lastProp);

                StateErrorManager.debug("恢复上次选择的属性", {
                    component: "StateSelect",
                    method: "syncDataFromMemory",
                    params: {
                        lastProp: EnumPropName[lastProp],
                        currentDisplayProp: EnumPropName[this._currentDisplayProp]
                    }
                });
            } else {
                // 🔧 如果没有上次选择的属性，清空界面标识
                this._currentDisplayProp = EnumPropName.Non;

                // 🔧 修复：隐藏属性值字段
                this.setPropValue(EnumPropName.Non);
            }

            // 🔧 新增：统计同步的属性信息
            const syncedProps = Object.keys(changedProp);

            StateErrorManager.info("数据同步完成", {
                component: "StateSelect",
                method: "syncDataFromMemory",
                params: {
                    changedPropCount: syncedProps.length,
                    syncedProps: syncedProps,
                    currentPropKey: this._propKey ? EnumPropName[this._propKey] : "None"
                }
            });

            // 🔧 新增：延迟再次刷新，确保界面完全更新
            setTimeout(() => {
                if (CC_EDITOR) {
                    this.forceRefreshInspector();
                    StateErrorManager.debug("延迟刷新完成", {
                        component: "StateSelect",
                        method: "syncDataFromMemory"
                    });
                }
            }, 100);

        } catch (error) {
            StateErrorManager.error("数据同步失败", {
                component: "StateSelect",
                method: "syncDataFromMemory",
                params: { error: error.message }
            });
        }
    }

    /** 🔧 修复：删除属性（带确认对话框，修复序列化问题） */
    private deletePropertyWithConfirmation() {
        if (!CC_EDITOR) {
            return;
        }

        // 检查是否有选中的属性
        if (this._propKey === EnumPropName.Non || !this._propKey) {
            StateErrorManager.userFriendlyError(
                "没有选中的属性",
                "请先选择要删除的属性",
                { component: "StateSelect", method: "deletePropertyWithConfirmation" }
            );
            return;
        }

        // 🔧 修复：保存当前属性值，避免在回调中使用this引用
        const currentPropKey = this._propKey;
        const propName = EnumPropName[currentPropKey];

        // 🔧 优化：简化Editor.Dialog调用，静默降级处理
        const useEditorDialog = () => {
            try {
                if (typeof Editor !== 'undefined' && Editor.Dialog && Editor.Dialog.messageBox) {
                    // 🔧 修复：使用简化的参数，避免传递复杂对象
                    const dialogOptions = {
                        type: 'warning',
                        title: '确认删除属性',
                        message: `确定要删除属性 "${propName}" 吗？\n\n此操作将：\n• 从所有状态中删除该属性数据\n• 删除默认属性值\n• 无法撤销`,
                        buttons: ['取消', '确认删除'],
                        defaultId: 0,
                        cancelId: 0
                    };

                    // 🔧 修复：使用箭头函数并捕获局部变量，避免this引用
                    const handleResponse = (response: number) => {
                        if (response === 1) { // 确认删除
                            this.performPropertyDeletion(currentPropKey);
                        }
                    };

                    // @ts-ignore
                    Editor.Dialog.messageBox(dialogOptions, handleResponse);
                    return true;
                }
                return false;
            } catch (error) {
                // 🔧 优化：静默处理Editor.Dialog失败，不显示错误日志
                // 只在开发模式下记录调试信息
                if (CC_DEV) {
                    StateErrorManager.debug("Editor.Dialog不可用，降级到confirm对话框", {
                        component: "StateSelect",
                        method: "deletePropertyWithConfirmation",
                        params: {
                            reason: error.message,
                            propName: propName
                        }
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
            } catch (error) {
                // 🔧 优化：confirm对话框失败是极少见的情况，静默处理
                if (CC_DEV) {
                    StateErrorManager.debug("确认对话框调用失败", {
                        component: "StateSelect",
                        method: "deletePropertyWithConfirmation",
                        params: {
                            reason: error.message,
                            propName: propName
                        }
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
                    params: { propName: propName }
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
                    deletedFromAllStates: true
                }
            });

        } catch (error) {
            StateErrorManager.userFriendlyError(
                "属性删除失败",
                `删除属性 "${propName}" 时发生错误：${error.message}`,
                { component: "StateSelect", method: "performPropertyDeletion" }
            );
        }
    }
}
