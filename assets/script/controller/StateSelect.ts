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
@executeInEditMode()
@disallowMultiple()
export class StateSelect extends cc.Component {
    /** root节点所有的ctrl */
    @property
    private _ctrlsMap: { [ctrlId: string]: StateController } = {};
    /** 当前选中的ctrl名称对应的ctrlId */
    @property(EnumCtrlName)
    private _currCtrlId: number = null;
    @property
    private _root: cc.Node = null;
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
    private _lastParent: cc.Node = null;
    private _parentCheckInterval: number = null;

    /** 是否重新获取 */
    @property({ tooltip: "是否重新获取ctrl" })
    get isReload() {
        return false;
    }
    private set isReload(value: boolean) {
        let itself = this;
        if (CC_EDITOR && value) {
            itself.__preload();
        }
    }
    @property({ type: EnumStateName, tooltip: "控制器当前状态" })
    get ctrlState() {
        let itself = this;
        return itself.getCurrCtrl()?.selectedIndex;
    }
    private set ctrlState(value: number) {
        let itself = this;
        if (itself.getCurrCtrl()) {
            itself.getCurrCtrl().selectedIndex = value;
        } else {
            itself.propKey = EnumPropName.Non;
        }
    }

    /** 控制器所在节点 */
    @property({ type: cc.Node, tooltip: "控制器所在节点，仅提示用" })
    get root() {
        return this._root;
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
        let itself = this;
        itself._currCtrlId = value;
        if (!value) {
            return;
        }
        itself.updateCtrlPage(itself.getCurrCtrl());
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
        let itself = this;
        if (itself.getCurrCtrl() == void 0) {
            itself._propKey = EnumPropName.Non;
            return;
        }
        itself._propKey = value;
        let propData = itself.getPropData();

        if (value !== EnumPropName.Non) {
            propData.$$lastProp$$ = value;
            let propValue = itself.setPropValue(value);
            propData[value] = propValue;

            if (propValue != void 0) {
                propData.$$changedProp$$ = propData.$$changedProp$$ || {};
                propData.$$changedProp$$[EnumPropName[value]] = value;

                // 智能同步：根据同步模式决定是否自动同步
                if (itself.syncMode === SyncMode.AutoSync) {
                    itself.syncPropToAllStatesInternal(value);
                }
            }
        }

        // 注意：当选择Non时，不存储任何数据，保持原有代码结构
        itself.updateChangedProp();
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
        let itself = this;
        itself._propValue = value;
        let propData = itself.getPropData();
        propData[itself.propKey] = value
        itself.updateState(itself.getCurrCtrl());
    }
    /** 是否删除当前属性 */
    @property({ tooltip: "是否删除当前属性" })
    get isDeleteCurr() {
        return this._isDeleteCurr;
    }
    private set isDeleteCurr(value: boolean) {
        let itself = this;
        if (!CC_EDITOR || !value) {
            return;
        }
        if (!itself.currCtrlId) {
            return;
        }
        if (itself.propKey == EnumPropName.Non) {
            return;
        }
        //删除属性
        let pageData = itself.getPageData();
        let propData = itself.getPropData();
        let propKey = itself.propKey;
        delete propData[propKey];

        let $$changedProp$$ = propData.$$changedProp$$ || {};
        let name = EnumPropName[propKey];
        delete $$changedProp$$[name];
        let isHas = itself.isOtherHans(itself.getCurrCtrl(), propKey);
        if (!isHas) {
            delete pageData.$$default$$[propKey]
        }
        itself.propKey = EnumPropName.Non;
    }

    /** 属性同步模式 */
    @property({
        type: SyncMode,
        tooltip: "属性同步模式：\n• 独立模式：每个状态属性完全独立，需手动为每个状态添加属性\n• 自动同步：添加属性时自动同步到所有状态，状态切换时保持PropKey选择（推荐）\n• 手动同步：添加属性不自动同步，但可以使用下方按钮手动同步"
    })
    syncMode: SyncMode = SyncMode.AutoSync;

    /** 同步当前属性到所有状态 */
    @property({
        tooltip: "点击将当前选中的属性同步到所有未设置该属性的状态\n注意：不会覆盖已有属性值"
    })
    get syncCurrentProp() {
        return false;
    }
    private set syncCurrentProp(value: boolean) {
        let itself = this;
        if (!CC_EDITOR || !value) {
            return;
        }

        // 🔧 使用新的错误处理机制
        if (!itself.currCtrlId) {
            StateErrorManager.userFriendlyError(
                '请先选择一个状态控制器',
                '在同步属性之前需要先选择要操作的控制器',
                { component: 'StateSelect', method: 'syncCurrentProp' }
            );
            return;
        }

        if (!StateErrorManager.validatePropType(itself.propKey, {
            component: 'StateSelect',
            method: 'syncCurrentProp'
        }) || itself.propKey == EnumPropName.Non) {
            StateErrorManager.userFriendlyError(
                '请先选择要同步的属性',
                '需要先选择一个有效的属性类型才能进行同步操作',
                { component: 'StateSelect', method: 'syncCurrentProp' }
            );
            return;
        }

        itself.syncPropToAllStatesInternal(itself.propKey);
    }

    /** 已经改变的属性 */
    @property({ type: cc.String, readonly: true, tooltip: "已经改变的属性" })
    changedProp: string[] = [];

    /** 刷新上次选中属性 */
    private refProp() {
        let itself = this;
        let propData = itself.getPropData();
        let lastProp = propData.$$lastProp$$;

        // 🔧 修复：确保lastProp不为0（EnumPropName.Non），因为0代表"不选择"状态
        if (lastProp && lastProp > EnumPropName.Non) {
            itself.propKey = lastProp;
        } else {
            itself.propKey = EnumPropName.Non;
        }
    }

    _isPreload = false;

    protected __preload() {
        if (!CC_EDITOR) {
            return;
        }
        let itself = this;
        if (itself._isPreload) {
            return;
        }
        itself._isPreload = true;
        itself.updateCtrlName(itself.node.parent);
        itself.updateCtrlPage(itself.getCurrCtrl());
        if (!itself.currCtrlId) {
            let ctrlIdKeys = Object.keys(itself._ctrlsMap);
            if (ctrlIdKeys.length) {
                itself.currCtrlId = Number(ctrlIdKeys[0]);
                itself.refProp();
            } else {
                //@ts-ignore
                itself._onPreDestroy();
            }
        } else {
            itself.refProp();
        }
    }
    protected onLoad() {
        let itself = this;
        if (!CC_EDITOR) {
            return;
        }

        //  记录初始父节点
        itself._lastParent = itself.node.parent;
        // 2.x没有父节点变化监听，需要定时检测
        itself._parentCheckInterval = setInterval(() => {
            itself.checkParentChanged();
        }, 1000);

        itself.node.on('active-in-hierarchy-changed', itself._activeChanged, itself);
        itself.node.on('position-changed', itself._positionChanged, itself);
        itself.node.on('rotation-changed', itself._rotationChanged, itself);
        itself.node.on('scale-changed', itself._scaleChanged, itself);
        itself.node.on('size-changed', itself._sizeChanged, itself);
        itself.node.on('anchor-changed', itself._anchorChanged, itself);
        itself.node.on('color-changed', itself._colorChanged, itself);
        itself.node.on('spriteframe-changed', itself._spriteFrameChanged, itself);
    }

    protected onDestroy() {
        let itself = this;
        // 清理父节点检测定时器
        if (itself._parentCheckInterval) {
            clearInterval(itself._parentCheckInterval);
            itself._parentCheckInterval = null;
        }

        if (itself.node && itself.node.isValid) {
            itself.node.off('active-in-hierarchy-changed', itself._activeChanged, itself);
            itself.node.off('position-changed', itself._positionChanged, itself);
            itself.node.off('rotation-changed', itself._rotationChanged, itself);
            itself.node.off('scale-changed', itself._scaleChanged, itself);
            itself.node.off('size-changed', itself._sizeChanged, itself);
            itself.node.off('anchor-changed', itself._anchorChanged, itself);
            itself.node.off('color-changed', itself._colorChanged, itself);
            itself.node.off('spriteframe-changed', itself._spriteFrameChanged, itself);
        }
    }

    /** 检查父节点是否变化 */
    private checkParentChanged() {
        let itself = this;

        // 安全检查：确保节点仍然有效
        if (!itself.node || !itself.node.isValid) {
            return;
        }

        let currentParent = itself.node.parent;

        if (itself._lastParent !== currentParent) {
            let oldParent = itself._lastParent;
            itself._lastParent = currentParent;

            // 新增：检查控制器承接
            itself.handleControllerTransition(oldParent, currentParent);

            // 只有当有Position属性被控制时才需要转换坐标
            let pageData = itself.getPageData();
            let hasPositionControl = false;
            for (let state in pageData) {
                if (pageData[state] && pageData[state][EnumPropName.Position] !== undefined) {
                    hasPositionControl = true;
                    break;
                }
            }

            if (hasPositionControl) {
                itself._parentChanged(oldParent);
            }
        }
    }

    /** 父节点改变 */
    private _parentChanged(oldParent: cc.Node) {
        let itself = this;
        itself.transPosition(oldParent);
    }

    /** 处理控制器承接 */
    private handleControllerTransition(oldParent: cc.Node, newParent: cc.Node) {
        let itself = this;

        // 获取旧控制器
        let oldCtrls = oldParent ? itself.getCtrls(oldParent) : [];
        let oldCtrl = oldCtrls.find(ctrl => ctrl._ctrlId === itself.currCtrlId);

        // 获取新控制器
        let newCtrls = newParent ? itself.getCtrls(newParent) : [];
        let newCtrl = itself.selectBestController(newCtrls, oldCtrl);

        // 如果新旧都有控制器且不同，执行数据承接
        if (oldCtrl && newCtrl && oldCtrl._ctrlId !== newCtrl._ctrlId) {
            // 1. 备份当前状态数据
            let oldCtrlData = itself._ctrlData[oldCtrl._ctrlId];

            if (oldCtrlData) {
                // 2. 将数据迁移到新控制器
                // 需要根据新控制器的状态数量调整数据结构
                let transferredData = itself.adaptDataToNewController(oldCtrlData, newCtrl);
                itself._ctrlData[newCtrl._ctrlId] = transferredData;

                // 3. 清理旧控制器数据
                delete itself._ctrlData[oldCtrl._ctrlId];

                // 4. 更新控制器映射和当前控制器ID
                itself.updateCtrlName(newParent);
                itself._currCtrlId = newCtrl._ctrlId;

                // 5. 更新界面
                itself.updateCtrlPage(newCtrl);
                itself.refProp();

                cc.log('✅ 控制器承接完成:', `数据已从 ${oldCtrl.ctrlName} 迁移到 ${newCtrl.ctrlName}`);
            }
        } else if (newCtrl && !oldCtrl) {
            // 从无控制器环境移动到有控制器环境
            cc.log('🆕 绑定到新控制器:', newCtrl.ctrlName);
            itself.updateCtrlName(newParent);
            if (!itself.currCtrlId) {
                itself._currCtrlId = newCtrl._ctrlId;
                itself.updateCtrlPage(newCtrl);
                itself.refProp();
            }
        } else if (oldCtrl && !newCtrl) {
            // 从有控制器环境移动到无控制器环境
            // 保留数据但清除当前绑定
            itself._currCtrlId = null;
            itself._propKey = EnumPropName.Non;
        }
    }

    /** 适配数据到新控制器 */
    private adaptDataToNewController(oldData: any, newCtrl: StateController): any {
        let itself = this;
        let newData: any = {};

        // 复制默认数据
        if (oldData.$$default$$) {
            newData.$$default$$ = itself.deepCloneStateData(oldData.$$default$$);
        }

        // 根据新控制器的状态数量适配状态数据
        for (let stateIndex = 0; stateIndex < newCtrl.states.length; stateIndex++) {
            if (oldData[stateIndex]) {
                // 如果旧数据有对应状态，直接复制
                newData[stateIndex] = itself.deepCloneStateData(oldData[stateIndex]);
            } else if (newData.$$default$$) {
                // 如果旧数据没有对应状态，使用默认数据创建新状态
                newData[stateIndex] = itself.deepCloneStateData(newData.$$default$$);
                // 清除新状态的lastProp，让用户重新选择
                delete newData[stateIndex].$$lastProp$$;
            }
        }

        return newData;
    }

    /** 🚀 优化后的深度克隆状态数据方法 */
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
    /** 节点active改变 */
    private _activeChanged(node: cc.Node) {
        let itself = this;
        itself.setDefaultPorp(EnumPropName.Active);
    }
    /** 节点位置改变 */
    private _positionChanged() {
        let itself = this;
        itself.setDefaultPorp(EnumPropName.Position);
    }
    /** 节点旋转改变 */
    private _rotationChanged() {
        let itself = this;
        itself.setDefaultPorp(EnumPropName.Euler);
    }
    /** 节点缩放改变 */
    private _scaleChanged() {
        let itself = this;
        itself.setDefaultPorp(EnumPropName.Scale);
    }
    /** 节点大小改变 */
    private _sizeChanged(size: cc.Size) {
        let itself = this;
        itself.setDefaultPorp(EnumPropName.Size);
    }
    /** 锚点改变 */
    private _anchorChanged(anchor: cc.Vec2) {
        let itself = this;
        itself.setDefaultPorp(EnumPropName.Anchor);
    }
    /** 颜色改变 */
    private _colorChanged(color: cc.Color) {
        let itself = this;
        itself.setDefaultPorp(EnumPropName.Color);
    }
    /** 图片改变 */
    private _spriteFrameChanged(sprite: cc.Sprite) {
        let itself = this;
        itself.setDefaultPorp(EnumPropName.SpriteFrame);
    }

    //=============一些界面的显示==============
    /** 更新控制器 */
    updateCtrlName(node: cc.Node) {
        if (!CC_EDITOR) {
            return;
        }
        let itself = this;
        let ctrls = itself.getCtrls(node);
        let arr = ctrls.map((val, i) => {
            if (itself._ctrlsMap[val._ctrlId] == void 0) {
                itself._ctrlsMap[val._ctrlId] = val;
            }
            return { name: val.ctrlName, value: val._ctrlId }
        })
        //@ts-ignore
        cc.Class.Attr.setClassAttr(itself, "currCtrlId", "enumList", arr);
    }
    /** 获取所有的Ctrl */
    private getCtrls(node: cc.Node): StateController[] {
        if (!node || !CC_EDITOR) {
            return [];
        }
        let ctrls = node.getComponents(StateController);
        if (ctrls.length) {
            this._root = node;
            return ctrls;
        }
        return this.getCtrls(node.parent);
    }
    /** 更新状态数量 */
    updateCtrlPage(ctrl: StateController, deleteIndex?: number) {
        let itself = this;
        if (!ctrl || ctrl._ctrlId != itself.currCtrlId) {
            return;
        }
        if (deleteIndex != void 0 && deleteIndex != -1) {
            //被删的index，更新数据,一次只能删一个
            let pageData = itself.getPageData();
            for (let state = deleteIndex; state <= ctrl.states.length - 1; state++) {
                let next = pageData[state + 1];
                if (next) {
                    pageData[state] = next;
                }
            }
            let deleteProp = pageData[ctrl.states.length];
            delete pageData[ctrl.states.length]
            setTimeout(() => {
                for (let prop in deleteProp) {//这里要删除改变的属性
                    let isHas = itself.isOtherHans(ctrl, prop);
                    if (!isHas) {
                        delete pageData.$$default$$[prop];
                        itself.updateChangedProp();
                    }
                }
            })
        }
        let arr = ctrl.states.map((val, i) => {
            return { name: val.name, value: i }
        })
        //@ts-ignore
        cc.Class.Attr.setClassAttr(itself, "ctrlState", "enumList", arr);
    }
    /** 控制器被删除 */
    updateDelete(ctrl: StateController) {
        if (!CC_EDITOR) {
            return;
        }
        let itself = this;
        delete itself._ctrlData[ctrl._ctrlId];
        if (itself.currCtrlId == ctrl._ctrlId) {
            //@ts-ignore
            itself._onPreDestroy();
        } else {
            setTimeout(() => {
                itself.updateCtrlName(ctrl.node)
            });
        }
    }
    /** 已经改变的属性 */
    updateChangedProp() {
        let itself = this;
        let propdata = itself.getPropData();
        let arr = [];
        for (let name in propdata.$$changedProp$$) {
            arr.push(name);
        }
        itself.changedProp = arr;
    }
    /** 确保节点在隐藏的时候也会执行__preload（负责stateSelect的显示） */
    updatePreLoad(ctrl: StateController) {
        let itself = this;
        if (!ctrl || ctrl._ctrlId != itself.currCtrlId) {
            return;
        }
        itself.__preload();
    }
    updateProp(ctrl: StateController) {
        let itself = this;
        if (!ctrl || ctrl._ctrlId != itself.currCtrlId) {
            return;
        }
        itself.refProp();
    }

    //==============更具控制器更新的状态 主要代码================
    private _isFromCtrl: boolean = false;
    /** 更新状态 */
    updateState(ctrl: StateController) {
        let itself = this;
        if (!ctrl) {
            return;
        }
        itself._isFromCtrl = true;

        // 保存当前选中的属性，用于状态切换后的PropKey保持
        let currentPropKey = itself.propKey;
        let isAutoSync = itself.syncMode === SyncMode.AutoSync;
        let shouldKeepPropKey = isAutoSync && currentPropKey !== EnumPropName.Non;

        let propData = itself.getPropData(ctrl.selectedIndex, ctrl._ctrlId);
        let defaultData = itself.getDefaultData(ctrl._ctrlId);

        let updateBatch: { type: EnumPropName, value: TPropValue }[] = [];

        for (let key in defaultData) {
            let value = propData[key] == void 0 ? defaultData[key] : propData[key];
            updateBatch.push({ type: Number(key), value: value });
        }

        // 一次性批量应用所有属性更新
        itself.batchUpdateUI(updateBatch);

        // 在自动同步模式下保持PropKey选择
        if (shouldKeepPropKey) {
            // 直接设置PropKey为当前选中的属性，无论新状态是否有这个属性
            // 如果新状态没有这个属性，setter会自动添加
            itself.propKey = currentPropKey;
        } else {
            // 非自动同步模式：使用新状态的lastProp
            itself.refProp();
        }

        itself._isFromCtrl = false;
    }

    /** 🔧 优化：批量更新UI，使用属性处理器系统和错误处理机制 */
    private batchUpdateUI(updateBatch: { type: EnumPropName, value: TPropValue }[]) {
        let itself = this;

        // 🔧 验证节点有效性
        if (!StateErrorManager.validateNode(itself.node, {
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
                        handler.setValue(itself.node, value);
                    } else {
                        StateErrorManager.log(ErrorLevel.WARN,
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

    //=============一些计算方式，仅储存值使用=================
    private getCurrCtrl() {
        let itself = this;
        return itself._ctrlsMap[itself.currCtrlId]
    }
    /**
     * 其他状态是否有存在这个属性
     * @param ctrl 
     * @param prop 
     */
    private isOtherHans(ctrl: StateController, prop: number | string) {
        let itself = this;
        let isHas = false;
        let pageData = itself.getPageData();
        for (let index = 0, len = ctrl.states.length; index < len; index++) {
            let propData = pageData[index] || {};
            if (propData[prop] != void 0) {
                isHas = true;
                break;
            }
        }
        return isHas;
    }
    /** 获取某个控制器的状态数据 */
    private getPageData(ctrlId?: number) {
        let itself = this;
        ctrlId = ctrlId == void 0 ? itself.currCtrlId : ctrlId;
        if (itself._ctrlData[ctrlId] == void 0) {
            itself._ctrlData[ctrlId] = {};
        }
        return itself._ctrlData[ctrlId];
    }
    /** 获取某个状态的属性数据 */
    private getPropData(state?: number, ctrlId?: number) {
        let itself = this;
        let pageData = itself.getPageData(ctrlId);
        state = state == void 0 ? itself.ctrlState : state;
        if (pageData[state] == void 0) {
            pageData[state] = {};
        }
        return pageData[state];
    }
    /** 获取默认属性 */
    private getDefaultData(ctrlId?: number) {
        let itself = this;
        let pageData = itself.getPageData(ctrlId);
        if (pageData.$$default$$ == void 0) {
            pageData.$$default$$ = {};
        }
        return pageData.$$default$$;
    }

    private setPropValue(type: EnumPropName) {
        let itself = this;
        let value = itself.handleValue(type);
        if (value == void 0) {
            //@ts-ignore
            cc.Class.Attr.setClassAttr(itself, "propValue", "visible", false);
            return void 0;
        }
        //@ts-ignore
        cc.Class.Attr.setClassAttr(itself, "propValue", "visible", true);
        itself._propValue = value;
        return value;
    }

    /** 🔧 优化：解析并返回属性值，使用属性处理器系统和错误处理机制 */
    private handleValue(type: EnumPropName): TPropValue {
        let itself = this;

        if (type === EnumPropName.Non) {
            return undefined;
        }

        // 🔧 验证节点有效性
        if (!StateErrorManager.validateNode(itself.node, {
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
                    return handler.getValue(itself.node);
                }

                StateErrorManager.log(ErrorLevel.WARN,
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
        let itself = this;
        if (!CC_EDITOR) {
            return;
        }
        if (itself._isFromCtrl) {
            return;//不是编辑器改变
        }
        let getPropData = itself.getPropData();
        if (getPropData[type] == void 0) {
            return;//没有改变这个属性   
        }
        switch (type) {
            case EnumPropName.Non: {
                return;
            }
            case EnumPropName.Active: {
                getPropData[EnumPropName.Active] = itself.node.active;
            } break;
            case EnumPropName.Position: {
                (getPropData[EnumPropName.Position] as cc.Vec3).set(itself.node.position);
            } break;
            case EnumPropName.Label_String: {
                let label = itself.node.getComponent(cc.Label);
                if (!label) {
                    return;
                }
                getPropData[EnumPropName.Label_String] = label.string;
            } break;
            case EnumPropName.Font: {
                let label = itself.node.getComponent(cc.Label);
                if (!label) {
                    return;
                }
                getPropData[EnumPropName.Font] = label.font;
            } break;
            case EnumPropName.LabelOutline_Color: {
                let labelOutline = itself.node.getComponent(cc.LabelOutline);
                if (!labelOutline) {
                    return;
                }
                (getPropData[EnumPropName.LabelOutline_Color] as cc.Color).set(labelOutline.color);
            } break;
            case EnumPropName.SpriteFrame: {
                let sprite = itself.node.getComponent(cc.Sprite);
                if (!sprite) {
                    return;
                }
                getPropData[EnumPropName.SpriteFrame] = sprite.spriteFrame;
            } break;
            case EnumPropName.Editbox_String: {
                let editbox = itself.node.getComponent(cc.EditBox);
                if (!editbox) {
                    return;
                }
                getPropData[EnumPropName.Editbox_String] = editbox.string;
            } break;
            case EnumPropName.Euler: {
                (getPropData[EnumPropName.Euler] as cc.Vec3).set(itself.node.eulerAngles);
            } break;
            case EnumPropName.Scale: {
                getPropData[EnumPropName.Scale] = itself.node.scale;
            } break;
            case EnumPropName.Anchor: {
                getPropData[EnumPropName.Anchor] = cc.v2(itself.node.anchorX, itself.node.anchorY);
            } break;
            case EnumPropName.Size: {
                getPropData[EnumPropName.Size] = itself.node.getContentSize();
            } break;
            case EnumPropName.Color: {
                getPropData[EnumPropName.Color] = itself.node.color;
            } break;
            case EnumPropName.Opacity: {
                getPropData[EnumPropName.Opacity] = itself.node.opacity;
            } break;
            case EnumPropName.Slider_Progress: {
                let slider = itself.node.getComponent(cc.Slider);
                if (!slider) {
                    return;
                }
                getPropData[EnumPropName.Slider_Progress] = slider.progress;
            } break;
        }
        if (type == itself.propKey) {
            let propData = itself.getPropData();
            itself._propValue = propData[itself.propKey];
        }
    }

    /** 父节点改变，转换已经缓存的位置 */
    private transPosition(oldParent: cc.Node) {
        if (!CC_EDITOR) {
            return;
        }
        let itself = this;
        let parent = itself.node.parent;
        if (!parent || !oldParent) {
            return;
        }

        // 检查oldParent是否是有效的cc.Node对象且具有必要的方法
        if (!oldParent.isValid || typeof oldParent.convertToWorldSpaceAR !== 'function') {
            console.warn('oldParent is not a valid cc.Node or has been destroyed');
            return;
        }
        // 检查parent是否具有必要的方法
        if (typeof parent.convertToNodeSpaceAR !== 'function') {
            console.warn('parent node does not have convertToNodeSpaceAR method');
            return;
        }

        let pageData = itself.getPageData();

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
                    console.error('Error during position conversion:', error);
                }
            }
        }
    }

    /** 同步属性到所有状态 */
    private syncPropToAllStatesInternal(propKey: EnumPropName) {
        let itself = this;
        let ctrl = itself.getCurrCtrl();
        if (!ctrl) return;

        // 🔧 修复：不同步Non属性
        if (propKey === EnumPropName.Non) {
            console.warn("不能同步Non属性");
            return;
        }

        let pageData = itself.getPageData();
        let currentStateValue = itself.handleValue(propKey); // 获取当前节点的属性值作为默认值

        // 遍历所有状态
        for (let stateIndex = 0; stateIndex < ctrl.states.length; stateIndex++) {
            if (pageData[stateIndex] == void 0) {
                pageData[stateIndex] = {};
            }
            let statePropData = pageData[stateIndex];

            // 如果该状态还没有这个属性，则添加（使用当前节点的值）
            if (statePropData[propKey] == void 0) {
                statePropData[propKey] = currentStateValue;

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
        let defaultData = itself.getDefaultData();
        if (defaultData[propKey] == void 0) {
            defaultData[propKey] = currentStateValue;
        }

        console.log(`已将属性 ${EnumPropName[propKey]} 同步到所有状态`);
        itself.updateChangedProp();
    }
}

