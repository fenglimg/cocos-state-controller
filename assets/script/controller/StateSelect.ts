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

const { ccclass, property, menu, executeInEditMode, disallowMultiple } = cc._decorator;
import { StateController } from './StateController';
import { EnumCtrlName, EnumPropName, EnumStateName } from './StateEnum';
import { PropHandlerManager } from './StatePropHandler';
import { StateErrorManager, ErrorLevel } from './StateErrorManager';
cc.Enum(EnumCtrlName);
cc.Enum(EnumStateName);
cc.Enum(EnumPropName);

/** 属性同步模式 */
enum SyncMode {
    /** 独立模式：每个状态属性完全独立 */
    Independent = 0,
    /** 自动同步：添加属性时自动同步到所有状态 */
    AutoSync = 1,
    /** 手动同步：需要手动点击同步按钮 */
    ManualSync = 2
}
cc.Enum(SyncMode);

/** 属性类型 */
export type TPropValue = number | boolean | string | cc.Vec3 | cc.Vec2 | cc.Color | cc.Size | cc.Quat | cc.SpriteFrame | cc.Font | undefined;

export type TProp = {
    /** 上一次选择的属性 */
    $$lastProp$$?: number;
    /** 已经改变的属性 */
    $$changedProp$$?: { [name: string]: EnumPropName };
    [key: number]: TPropValue,
}

type TPage = {
    /** 上次选择的状态 */
    // $$lastState$$?: number,
    /** 默认状态属性 */
    $$default$$?: TProp;
    [state: number]: TProp
}

type TCtrl = {
    [stateId: string]: TPage;
}

@ccclass('StateSelect')
@menu('State/StateSelect')
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
    get root() {
        return this._root;
    }

    /** 当前状态要改变的属性 */
    @property({ type: EnumPropName })
    private _propKey: EnumPropName = null;
    /** 当前状态要改变的属性值 */
    @property
    private _propValue: TPropValue = null;
    @property
    private _isDeleteCurr: boolean = false;

    /** 状态数据 */
    @property
    private _ctrlData: TCtrl = {};

    /** 用于检测父节点变化 */
    private lastParent: cc.Node = null;
    private parentCheckInterval: number = null;

    @property({ type: EnumStateName, tooltip: "控制器当前状态" })
    get ctrlState() {
        let ctrl = this.getCurrCtrl();
        if (!ctrl) {
            StateErrorManager.warn("ctrlState getter: 控制器为空", {
                component: 'StateSelect',
                method: 'ctrlState.getter'
            });
            return 0;
        }
        return ctrl.selectedIndex;
    }
    private set ctrlState(value: number) {
        let ctrl = this.getCurrCtrl();
        if (!ctrl) {
            StateErrorManager.warn("ctrlState setter: 控制器为空", {
                component: 'StateSelect',
                method: 'ctrlState.setter'
            });
            return;
        }
        ctrl.selectedIndex = value;
    }

    /** 控制器名称 */
    @property({ type: EnumCtrlName, displayName: "ctrlName", tooltip: "选择的控制器" })
    get currCtrlId() {
        return this._currCtrlId;
    }
    private set currCtrlId(value: number) {
        if (!CC_EDITOR) {
            return;
        }
        if (!value) {
            StateErrorManager.warn("currCtrlId setter: value is null", {
                component: 'StateSelect',
                method: 'currCtrlId.setter'
            });
            this._currCtrlId = null;
            return;
        }
        this._currCtrlId = value;
        this.updateCtrlPage(this.getCurrCtrl());
    }

    /** 属性列表 */
    @property({ type: EnumPropName, tooltip: "属性选择列表" })
    get propKey() {
        return this._propKey;
    }
    private set propKey(value: EnumPropName) {
        if (!CC_EDITOR) {
            return;
        }

        StateErrorManager.debug("开始设置属性键", {
            component: 'StateSelect',
            method: 'propKey.setter',
            params: { oldPropKey: EnumPropName[this._propKey], newPropKey: EnumPropName[value] }
        });

        // 🔧 第一步：验证控制器有效性
        let ctrl = this.getCurrCtrl();
        if (!ctrl) {
            StateErrorManager.warn("propKey setter: 控制器为空", {
                component: 'StateSelect',
                method: 'propKey.setter'
            });
            return;
        }

        // 🔧 第二步：处理属性设置逻辑
        if (value === EnumPropName.Non) {
            this._propKey = EnumPropName.Non;
            this.setPropValue(EnumPropName.Non);
            StateErrorManager.debug("设置属性为Non", {
                component: 'StateSelect',
                method: 'propKey.setter'
            });
        } else {
            this.handleValidPropSelection(value);
        }

        // 🔧 第三步：更新UI显示
        this.updateChangedProp();

        StateErrorManager.info("属性键设置完成", {
            component: 'StateSelect',
            method: 'propKey.setter',
            params: { finalPropKey: EnumPropName[this._propKey] }
        });
    }

    /** 🔧 新增：处理有效属性选择 */
    private handleValidPropSelection(value: EnumPropName) {
        let propValue = this.handleValue(value);
        if (propValue === undefined) {
            StateErrorManager.warn("无法获取属性值", {
                component: 'StateSelect',
                method: 'handleValidPropSelection',
                params: { propType: EnumPropName[value] }
            });
            // 🔧 如果无法获取属性值，保持当前状态不变
            return;
        }

        // 🔧 第二步：设置属性状态（确保属性值有效后再设置）
        this._propKey = value;
        this.setPropValue(value); // 显示属性值字段

        // 🔧 第三步：更新数据结构
        this.updatePropData(value, propValue);

        // 🔧 第四步：处理自动同步（如果启用）
        if (this.syncMode === SyncMode.AutoSync) {
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

    /** 属性值 */
    @property({ tooltip: "当前状态属性值" })
    get propValue() {
        return this._propValue;
    }
    private set propValue(value: any) {
        if (!CC_EDITOR) {
            return;
        }

        StateErrorManager.debug("设置属性值", {
            component: 'StateSelect',
            method: 'propValue.setter',
            params: {
                propKey: EnumPropName[this.propKey],
                valueType: typeof value,
                oldValue: this._propValue
            }
        });

        this._propValue = value;
        let propData = this.getPropData();
        propData[this.propKey] = value
        this.updateState(this.getCurrCtrl());
    }

    /** 已经改变的属性 */
    @property({ type: cc.String, readonly: true, tooltip: "已经改变的属性" })
    changedProp: string[] = [];

    /** 刷新上次选中属性 */
    private refProp() {
        let propData = this.getPropData();
        let lastProp = propData.$$lastProp$$;

        // 🔧 修复：确保lastProp不为0（EnumPropName.Non），因为0代表"不选择"状态
        if (lastProp && lastProp > EnumPropName.Non) {
            this.propKey = lastProp;
        } else {
            this.propKey = EnumPropName.Non;
        }
    }

    _isPreload = false;
    protected __preload() {
        if (!CC_EDITOR) {
            return;
        }
        if (this._isPreload) {
            StateErrorManager.debug("跳过重复预加载", {
                component: 'StateSelect',
                method: '__preload'
            });
            return;
        }
        this._isPreload = true;

        StateErrorManager.debug("开始StateSelect预加载", {
            component: 'StateSelect',
            method: '__preload',
            params: { hasCurrentCtrl: !!this.currCtrlId }
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
                    component: 'StateSelect',
                    method: '__preload',
                    params: { selectedCtrlId: this.currCtrlId, availableControllers: ctrlIdKeys.length }
                });
                this.updateCtrlPage(this.getCurrCtrl());
                this.refProp();
            } else {
                // 没有找到控制器，清理状态
                StateErrorManager.warn("未找到可用的控制器", {
                    component: 'StateSelect',
                    method: '__preload'
                });
                //@ts-ignore
                this._onPreDestroy();
            }
        } else {
            // 已有当前控制器，更新页面并恢复属性选择
            StateErrorManager.debug("使用现有控制器", {
                component: 'StateSelect',
                method: '__preload',
                params: { currentCtrlId: this.currCtrlId }
            });
            this.updateCtrlPage(this.getCurrCtrl());
            this.refProp();
        }

        StateErrorManager.info("StateSelect预加载完成", {
            component: 'StateSelect',
            method: '__preload',
            params: { finalCtrlId: this.currCtrlId, propKey: EnumPropName[this._propKey] }
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

        this.node.on('active-in-hierarchy-changed', this.activeChanged, this);
        this.node.on('position-changed', this.positionChanged, this);
        this.node.on('rotation-changed', this.rotationChanged, this);
        this.node.on('scale-changed', this.scaleChanged, this);
        this.node.on('size-changed', this.sizeChanged, this);
        this.node.on('anchor-changed', this.anchorChanged, this);
        this.node.on('color-changed', this.colorChanged, this);
        this.node.on('spriteframe-changed', this.spriteFrameChanged, this);
    }

    protected onDestroy() {
        // 清理父节点检测定时器
        if (this.parentCheckInterval) {
            clearInterval(this.parentCheckInterval);
            this.parentCheckInterval = null;
        }

        if (this.node && this.node.isValid) {
            this.node.off('active-in-hierarchy-changed', this.activeChanged, this);
            this.node.off('position-changed', this.positionChanged, this);
            this.node.off('rotation-changed', this.rotationChanged, this);
            this.node.off('scale-changed', this.scaleChanged, this);
            this.node.off('size-changed', this.sizeChanged, this);
            this.node.off('anchor-changed', this.anchorChanged, this);
            this.node.off('color-changed', this.colorChanged, this);
            this.node.off('spriteframe-changed', this.spriteFrameChanged, this);
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
            component: 'StateSelect',
            method: 'handleControllerTransition',
            params: {
                hasOldParent: !!oldParent,
                hasNewParent: !!newParent,
                currentCtrlId: this.currCtrlId
            }
        });

        // 获取旧控制器
        let oldCtrls = oldParent ? this.getCtrls(oldParent) : [];
        let oldCtrl = oldCtrls.find(ctrl => ctrl.ctrlId === this.currCtrlId);

        // 获取新控制器
        let newCtrls = newParent ? this.getCtrls(newParent) : [];
        let newCtrl = this.selectBestController(newCtrls, oldCtrl);

        StateErrorManager.debug("控制器分析结果", {
            component: 'StateSelect',
            method: 'handleControllerTransition',
            params: {
                oldCtrlsCount: oldCtrls.length,
                newCtrlsCount: newCtrls.length,
                hasOldCtrl: !!oldCtrl,
                hasNewCtrl: !!newCtrl,
                oldCtrlName: oldCtrl?.ctrlName,
                newCtrlName: newCtrl?.ctrlName
            }
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

                StateErrorManager.info('控制器承接完成', {
                    component: 'StateSelect',
                    method: 'handleControllerTransition',
                    params: { fromController: oldCtrl.ctrlName, toController: newCtrl.ctrlName }
                });
            }
        } else if (newCtrl && !oldCtrl) {
            // 从无控制器环境移动到有控制器环境
            StateErrorManager.info('绑定到新控制器', {
                component: 'StateSelect',
                method: 'handleControllerTransition',
                params: { newController: newCtrl.ctrlName }
            });
            this.updateCtrlName(newParent);
            if (!this.currCtrlId) {
                this._currCtrlId = newCtrl.ctrlId;
                this.updateCtrlPage(newCtrl);
                this.refProp();
            }
        } else if (oldCtrl && !newCtrl) {
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
            } else if (newData.$$default$$) {
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
        if (!data || typeof data !== 'object') {
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
            if (!value || typeof value !== 'object') {
                cloned[key] = value;
                continue;
            }
            let constructor = value.constructor;
            if (constructor === cc.Vec3) {
                // 🔧 Vec3: 直接使用现有值创建新对象
                cloned[key] = cc.v3(value.x, value.y, value.z);
            } else if (constructor === cc.Vec2) {
                // 🔧 Vec2: 直接使用现有值创建新对象
                cloned[key] = cc.v2(value.x, value.y);
            } else if (constructor === cc.Color) {
                // 🔧 Color: 直接使用RGBA值创建新对象
                cloned[key] = cc.color(value.r, value.g, value.b, value.a);
            } else if (constructor === cc.Size) {
                // 🔧 Size: 直接使用宽高值创建新对象
                cloned[key] = cc.size(value.width, value.height);
            } else if (value instanceof cc.Asset) {
                // 🔧 Asset对象：直接保留引用（SpriteFrame、Font等）
                cloned[key] = value;
            } else {
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
    updateCtrlName(node: cc.Node) {
        if (!CC_EDITOR) {
            return;
        }
        if (!node || !node.isValid) {
            StateErrorManager.debug("updateCtrlName: 节点无效", {
                component: 'StateSelect',
                method: 'updateCtrlName',
                params: { hasNode: !!node, isValid: node?.isValid }
            });
            return;
        }

        StateErrorManager.debug("开始更新控制器名称", {
            component: 'StateSelect',
            method: 'updateCtrlName',
            params: { nodeName: node.name }
        });

        let ctrls = this.getCtrls(node);
        let arr = ctrls.map((val, i) => {
            if (this._ctrlsMap[val.ctrlId] == void 0) {
                this._ctrlsMap[val.ctrlId] = val;
            }
            return { name: val.ctrlName, value: val.ctrlId }
        })
        //@ts-ignore
        cc.Class.Attr.setClassAttr(this, "currCtrlId", "enumList", arr);

        StateErrorManager.info("控制器名称更新完成", {
            component: 'StateSelect',
            method: 'updateCtrlName',
            params: { controllersFound: ctrls.length, mappedControllers: Object.keys(this._ctrlsMap).length }
        });
    }

    /** 获取所有的Ctrl */
    private getCtrls(node: cc.Node): StateController[] {
        if (!node || !CC_EDITOR) {
            if (!node) {
                StateErrorManager.debug("getCtrls: 节点为空", {
                    component: 'StateSelect',
                    method: 'getCtrls'
                });
            }
            return [];
        }
        let ctrls = node.getComponents(StateController);
        if (ctrls.length) {
            this._root = node;
            StateErrorManager.debug("找到控制器", {
                component: 'StateSelect',
                method: 'getCtrls',
                params: { ctrlCount: ctrls.length, nodeName: node.name }
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
            component: 'StateSelect',
            method: 'handleStateDelete',
            params: { deleteIndex: deleteIndex, ctrlId: ctrl.ctrlId }
        });

        // 🔧 严格验证删除索引
        if (deleteIndex < 0 || deleteIndex >= ctrl.states.length) {
            StateErrorManager.warn("无效的删除索引", {
                component: 'StateSelect',
                method: 'handleStateDelete',
                params: { deleteIndex: deleteIndex, stateCount: ctrl.states.length }
            });
            return;
        }

        let pageData = this.getPageData();
        if (!pageData) {
            StateErrorManager.warn("页面数据为空", {
                component: 'StateSelect',
                method: 'handleStateDelete'
            });
            return;
        }

        // 🔧 执行数据迁移：将后面的状态数据前移
        this.migrateStateData(pageData, deleteIndex, ctrl.states.length);

        // 🔧 同步处理属性清理
        this.cleanupDeletedStateProps(pageData, ctrl, ctrl.states.length);

        StateErrorManager.info("状态删除处理完成", {
            component: 'StateSelect',
            method: 'handleStateDelete',
            params: { deletedIndex: deleteIndex, remainingStates: ctrl.states.length }
        });
    }

    /** 🔧 新增：迁移状态数据 */
    private migrateStateData(pageData: any, deleteIndex: number, statesLength: number) {

        // 🔧 将删除位置后面的状态数据前移
        for (let state = deleteIndex; state < statesLength; state++) {
            let nextStateData = pageData[state + 1];
            if (nextStateData != void 0) {
                pageData[state] = nextStateData;
            } else {
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
        if (!deletedStateData || typeof deletedStateData !== 'object') {
            return;
        }

        // 🔧 检查每个属性是否在其他状态中还存在
        for (let prop in deletedStateData) {
            // 🔧 跳过元数据属性
            if (prop.startsWith('$$')) {
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
                component: 'StateSelect',
                method: 'updateStateEnumList'
            });
            return;
        }

        // 🔧 生成状态枚举数组
        let enumList = ctrl.states.map((state, index) => {
            if (!state || typeof state.name !== 'string') {
                StateErrorManager.warn("状态数据无效", {
                    component: 'StateSelect',
                    method: 'updateStateEnumList',
                    params: { stateIndex: index }
                });
                return { name: `状态${index}`, value: index };
            }
            return { name: state.name, value: index };
        });

        // 🔧 更新编辑器属性枚举列表
        try {
            //@ts-ignore
            cc.Class.Attr.setClassAttr(itself, "ctrlState", "enumList", enumList);
        } catch (error) {
            StateErrorManager.warn("更新状态枚举列表失败", {
                component: 'StateSelect',
                method: 'updateStateEnumList',
                params: { error: error.message }
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
            //@ts-ignore
            this._onPreDestroy();
        } else {
            setTimeout(() => {
                this.updateCtrlName(ctrl.node)
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

    //==============更具控制器更新的状态 主要代码================
    private _isFromCtrl: boolean = false;
    /** 更新状态 */
    public updateState(ctrl: StateController) {
        if (!ctrl) {
            StateErrorManager.warn("updateState: 控制器为空", {
                component: 'StateSelect',
                method: 'updateState'
            });
            return;
        }

        StateErrorManager.debug("开始状态更新", {
            component: 'StateSelect',
            method: 'updateState',
            params: {
                ctrlId: ctrl.ctrlId,
                selectedIndex: ctrl.selectedIndex,
                isFromCtrl: this._isFromCtrl,
                currentPropKey: EnumPropName[this.propKey]
            }
        });

        this._isFromCtrl = true;

        // 🔧 第一步：保存当前属性选择状态
        let currentPropKey = this.propKey;
        let isAutoSync = this.syncMode === SyncMode.AutoSync;
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
            component: 'StateSelect',
            method: 'updateState',
            params: { batchSize: updateBatch.length, syncMode: SyncMode[this.syncMode] }
        });

        // 🔧 第四步：批量应用UI更新
        this.batchUpdateUI(updateBatch);

        // 🔧 第五步：根据同步模式恢复属性选择
        if (shouldKeepPropKey) {
            // 自动同步模式：保持当前选中的属性
            this.propKey = currentPropKey;
            StateErrorManager.debug("保持当前属性选择", {
                component: 'StateSelect',
                method: 'updateState',
                params: { keptPropKey: EnumPropName[currentPropKey] }
            });
        } else {
            // 其他模式：使用新状态的lastProp
            this.refProp();
            StateErrorManager.debug("使用状态lastProp", {
                component: 'StateSelect',
                method: 'updateState'
            });
        }

        this._isFromCtrl = false;

        StateErrorManager.info("状态更新完成", {
            component: 'StateSelect',
            method: 'updateState',
            params: {
                targetState: ctrl.selectedIndex,
                finalPropKey: EnumPropName[this._propKey],
                appliedUpdates: updateBatch.length
            }
        });
    }

    /** 🔧 批量更新UI，使用属性处理器系统和错误处理机制 */
    private batchUpdateUI(updateBatch: { type: EnumPropName, value: TPropValue }[]) {
        // 🔧 验证节点有效性
        if (!StateErrorManager.validateNode(this.node, {
            component: 'StateSelect',
            method: 'batchUpdateUI',
            params: { batchSize: updateBatch.length }
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
                    } else {
                        StateErrorManager.warn(
                            `属性类型 ${EnumPropName[type]} 尚未迁移到属性处理器系统`,
                            { component: 'StateSelect', method: 'batchUpdateUI', params: { propType: type } }
                        );
                    }
                },
                undefined,
                `设置属性值失败: ${EnumPropName[type]}`
            );
        }
    }

    private getCurrCtrl() {
        return this._ctrlsMap[this.currCtrlId]
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
            //@ts-ignore
            cc.Class.Attr.setClassAttr(this, "propValue", "visible", false);
            return void 0;
        }
        //@ts-ignore
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
            component: 'StateSelect',
            method: 'handleValue',
            params: { propType: EnumPropName[type] }
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
                    { component: 'StateSelect', method: 'handleValue', params: { propType: type } }
                );
                return undefined;
            },
            undefined,
            `获取属性值失败: ${EnumPropName[type]}`
        );
    }

    /** 编辑器改变、改变对于状态属性（最开始是说改变默认属性） */
    private setDefaultPorp(type: EnumPropName) {
        if (!CC_EDITOR) {
            return;
        }
        if (this._isFromCtrl) {
            return;//不是编辑器改变
        }

        StateErrorManager.debug("检测到编辑器属性变化", {
            component: 'StateSelect',
            method: 'setDefaultPorp',
            params: { propType: EnumPropName[type] }
        });

        let propData = this.getPropData();
        if (propData[type] == void 0) {
            StateErrorManager.debug("属性未被控制，跳过更新", {
                component: 'StateSelect',
                method: 'setDefaultPorp',
                params: { propType: EnumPropName[type] }
            });
            return;//没有改变这个属性   
        }
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
            case EnumPropName.Label_String: {
                let label = this.node.getComponent(cc.Label);
                if (!label) {
                    return;
                }
                propData[EnumPropName.Label_String] = label.string;
            } break;
            case EnumPropName.Font: {
                let label = this.node.getComponent(cc.Label);
                if (!label) {
                    return;
                }
                propData[EnumPropName.Font] = label.font;
            } break;
            case EnumPropName.LabelOutline_Color: {
                let labelOutline = this.node.getComponent(cc.LabelOutline);
                if (!labelOutline) {
                    return;
                }
                (propData[EnumPropName.LabelOutline_Color] as cc.Color).set(labelOutline.color);
            } break;
            case EnumPropName.SpriteFrame: {
                let sprite = this.node.getComponent(cc.Sprite);
                if (!sprite) {
                    return;
                }
                propData[EnumPropName.SpriteFrame] = sprite.spriteFrame;
            } break;
            case EnumPropName.Editbox_String: {
                let editbox = this.node.getComponent(cc.EditBox);
                if (!editbox) {
                    return;
                }
                propData[EnumPropName.Editbox_String] = editbox.string;
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
            case EnumPropName.Slider_Progress: {
                let slider = this.node.getComponent(cc.Slider);
                if (!slider) {
                    return;
                }
                propData[EnumPropName.Slider_Progress] = slider.progress;
            } break;
            case EnumPropName.GrayScale: {
                StateErrorManager.error('GrayScale属性在Cocos Creator 2.x中需要通过材质实现', {
                    component: 'StateSelect',
                    method: 'setDefaultPorp'
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
        if (!oldParent.isValid || typeof oldParent.convertToWorldSpaceAR !== 'function') {
            StateErrorManager.warn('oldParent 节点无效或已销毁', {
                component: 'StateSelect',
                method: 'transPosition'
            });
            return;
        }
        // 检查parent是否具有必要的方法
        if (typeof parent.convertToNodeSpaceAR !== 'function') {
            StateErrorManager.warn('parent 节点缺少 convertToNodeSpaceAR 方法', {
                component: 'StateSelect',
                method: 'transPosition'
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
                } catch (error) {
                    StateErrorManager.error('坐标转换过程中发生错误', {
                        component: 'StateSelect',
                        method: 'transPosition',
                        params: { error: error.message }
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
                component: 'StateSelect',
                method: 'syncPropToAllStatesInternal'
            });
            return;
        }

        StateErrorManager.debug("开始同步属性到所有状态", {
            component: 'StateSelect',
            method: 'syncPropToAllStatesInternal',
            params: { propType: EnumPropName[propKey], stateCount: ctrl.states.length }
        });

        // 🔧 修复：不同步Non属性
        if (propKey === EnumPropName.Non) {
            StateErrorManager.warn("不能同步Non属性", {
                component: 'StateSelect',
                method: 'syncPropToAllStatesInternal'
            });
            return;
        }

        let pageData = this.getPageData();
        let currentStateValue = this.handleValue(propKey); // 获取当前节点的属性值作为默认值

        if (currentStateValue === undefined) {
            StateErrorManager.error("同步失败：无法获取当前属性值", {
                component: 'StateSelect',
                method: 'syncPropToAllStatesInternal',
                params: { propType: EnumPropName[propKey] }
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
            component: 'StateSelect',
            method: 'syncPropToAllStatesInternal',
            params: {
                propType: EnumPropName[propKey],
                syncedStates: syncedStates,
                totalStates: ctrl.states.length
            }
        });
        this.updateChangedProp();
    }

    /** 🔧 同步删除所有状态的指定属性 */
    private syncDeletePropFromAllStates(propKey: EnumPropName) {
        let ctrl = this.getCurrCtrl();
        if (!ctrl) {
            StateErrorManager.error("删除属性失败：控制器为空", {
                component: 'StateSelect',
                method: 'syncDeletePropFromAllStates'
            });
            return;
        }

        StateErrorManager.debug("开始同步删除属性", {
            component: 'StateSelect',
            method: 'syncDeletePropFromAllStates',
            params: { propType: EnumPropName[propKey], stateCount: ctrl.states.length }
        });

        // 🔧 修复：不删除Non属性
        if (propKey === EnumPropName.Non) {
            StateErrorManager.warn("不能删除Non属性", {
                component: 'StateSelect',
                method: 'syncDeletePropFromAllStates'
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
            component: 'StateSelect',
            method: 'syncDeletePropFromAllStates',
            params: {
                propType: name,
                deletedFromStates: deletedFromStates,
                totalStates: ctrl.states.length
            }
        });
        this.updateChangedProp();
    }

    /** 属性同步模式 */
    @property({
        type: SyncMode,
        tooltip: "属性同步模式：\n• 独立模式：每个状态属性完全独立，需手动为每个状态添加属性\n• 自动同步：添加属性时自动同步到所有状态，状态切换时保持PropKey选择（推荐）\n• 手动同步：添加属性不自动同步，但可以使用下方按钮手动同步",
        displayName: "属性同步模式"
    })
    syncMode: SyncMode = SyncMode.AutoSync;

    /** 同步当前属性到所有状态 */
    @property({
        tooltip: "点击将当前选中的属性同步到所有未设置该属性的状态\n注意：不会覆盖已有属性值",
        displayName: "同步当前属性到所有状态"
    })
    get syncCurrentProp() {
        return false;
    }
    private set syncCurrentProp(value: boolean) {
        if (!CC_EDITOR || !value) {
            return;
        }

        // 🔧 使用新的错误处理机制
        if (!this.currCtrlId) {
            StateErrorManager.userFriendlyError(
                '请先选择一个状态控制器',
                '在同步属性之前需要先选择要操作的控制器',
                { component: 'StateSelect', method: 'syncCurrentProp' }
            );
            return;
        }

        if (!StateErrorManager.validatePropType(this.propKey, {
            component: 'StateSelect',
            method: 'syncCurrentProp'
        }) || this.propKey == EnumPropName.Non) {
            StateErrorManager.userFriendlyError(
                '请先选择要同步的属性',
                '需要先选择一个有效的属性类型才能进行同步操作',
                { component: 'StateSelect', method: 'syncCurrentProp' }
            );
            return;
        }

        this.syncPropToAllStatesInternal(this.propKey);
    }

    /** 是否重新获取 */
    @property({ tooltip: "是否重新获取ctrl", displayName: "是否重新获取控制器" })
    get isReload() {
        return false;
    }
    private set isReload(value: boolean) {
        if (CC_EDITOR && value) {
            this.__preload();
        }
    }

    @property({
        displayName: "手动刷新",
        tooltip: "点击刷新属性检查器",
    })
    get manualRefreshTrigger() {
        return false;
    }
    set manualRefreshTrigger(value: boolean) {
        if (value && CC_EDITOR) {
            this.forceRefreshInspector();
        }
    }
    /** 🔧 新增：强制刷新属性检查器 */
    private forceRefreshInspector() {
        if (!CC_EDITOR) {
            return;
        }

        try {
            Editor.Utils.refreshSelectedInspector('node', this.node.uuid);
            StateErrorManager.info("属性检查器已刷新", {
                component: 'StateSelect',
                method: 'forceRefreshInspector'
            });
        } catch (error) {
            StateErrorManager.warn("刷新属性检查器失败", {
                component: 'StateSelect',
                method: 'forceRefreshInspector',
                params: { error: error.message }
            });
        }
    }

    /** 是否删除当前属性 */
    @property({ displayName: "是否删除当前属性" })
    get isDeleteCurr() {
        return this._isDeleteCurr;
    }
    private set isDeleteCurr(value: boolean) {
        if (!CC_EDITOR || !value) {
            return;
        }
        if (!this.currCtrlId) {
            return;
        }
        if (this.propKey == EnumPropName.Non) {
            return;
        }
        //删除属性
        let pageData = this.getPageData();
        let propData = this.getPropData();
        let propKey = this.propKey;

        // 🔧 自动同步模式：删除属性时同步删除其他状态的该属性
        if (this.syncMode === SyncMode.AutoSync) {
            this.syncDeletePropFromAllStates(propKey);
        } else {
            // 非自动同步模式：只删除当前状态的属性
            delete propData[propKey];

            let $$changedProp$$ = propData.$$changedProp$$ || {};
            let name = EnumPropName[propKey];
            delete $$changedProp$$[name];

            // 检查其他状态是否还有这个属性，如果没有则删除默认属性
            let isHas = this.isOtherHans(this.getCurrCtrl(), propKey);
            if (!isHas) {
                delete pageData.$$default$$[propKey]
            }
        }

        this.propKey = EnumPropName.Non;

    }
}

