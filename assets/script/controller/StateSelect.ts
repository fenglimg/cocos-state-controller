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
type TPropValue = number | boolean | string | cc.Vec3 | cc.Vec2 | cc.Color | cc.Size | cc.Quat | cc.SpriteFrame | cc.Font;
type TProp = {
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
    // /** 当前选中的状态 */
    // @property(EnumStateName)
    // private _currState: number = null;
    @property
    private _root: cc.Node = null;
    /** 当前状态要改变的属性 */
    @property({ type: EnumPropName })
    private _propKey: EnumPropName = null;
    /** 当前状态要改变的属性值 */
    @property
    private _propValue: any = null;
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
        propData.$$lastProp$$ = value;
        let propValue = itself.setPropValue(value)
        propData[value] = propValue;
        if (propValue != void 0 && value != EnumPropName.Non) {
            propData.$$changedProp$$ = propData.$$changedProp$$ || {};
            propData.$$changedProp$$[EnumPropName[value]] = value;

            // 智能同步：根据同步模式决定是否自动同步
            if (itself.syncMode === SyncMode.AutoSync) {
                itself.syncPropToAllStatesInternal(value);
            }
        }
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
        tooltip: "属性同步模式：\n• 独立模式：每个状态属性完全独立，需手动为每个状态添加属性\n• 自动同步：添加属性时自动同步到所有状态（推荐）\n• 手动同步：添加属性不自动同步，但可以使用下方按钮手动同步"
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
        if (!itself.currCtrlId || itself.propKey == EnumPropName.Non) {
            console.warn("请先选择控制器和属性");
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
        if (lastProp) {
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
        cc.log("StateSelect onLoad")
        let itself = this;
        if (!CC_EDITOR) {
            return;
        }

        // // 记录初始父节点
        itself._lastParent = itself.node.parent;

        // // 启动父节点变化检测定时器
        itself._parentCheckInterval = setInterval(() => {
            itself.checkParentChanged();
        }, 200);

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
    }
    //==============一些监听、设置默认属性=================

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
                cc.log('父节点变化检测:', '→', '- 执行坐标转换');
                itself._parentChanged(oldParent);
            } else {
                cc.log('父节点变化检测:', '→', '- 无需坐标转换');
            }
        }
    }

    /** 父节点改变 */
    private _parentChanged(oldParent: cc.Node) {
        let itself = this;
        itself.transPosition(oldParent);
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
        cc.log("StateSelect updatePreLoad")
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
        let propData = itself.getPropData(ctrl.selectedIndex, ctrl._ctrlId);
        let defaultData = itself.getDefaultData(ctrl._ctrlId);
        for (let key in defaultData) {
            let value = propData[key] == void 0 ? defaultData[key] : propData[key];
            itself.updateUI(Number(key), value)
        }
        itself._isFromCtrl = false;
    }
    updateUI(type: EnumPropName, value: TPropValue) {
        let itself = this;
        switch (type) {
            case EnumPropName.Non: {
                return;
            }
            case EnumPropName.Active: {
                itself.node.active = value as boolean;
            } break;
            case EnumPropName.Position: {
                itself.node.position = value as cc.Vec3;
            } break;
            case EnumPropName.Label: {
                let label = itself.node.getComponent(cc.Label);
                if (label) {
                    label.string = value as string;
                }
            } break;
            case EnumPropName.Font: {
                let label = itself.node.getComponent(cc.Label);
                if (label) {
                    label.font = value as cc.Font;
                }
            } break;
            case EnumPropName.LabelOutline: {
                let labelOutline = itself.node.getComponent(cc.LabelOutline);
                if (labelOutline) {
                    labelOutline.color = value as cc.Color;
                }
            } break;
            case EnumPropName.SpriteFrame: {
                let sprite = itself.node.getComponent(cc.Sprite);
                if (sprite) {
                    sprite.spriteFrame = value as cc.SpriteFrame;
                }
            } break;
            case EnumPropName.Euler: {
                itself.node.eulerAngles = value as cc.Vec3;
            } break;
            case EnumPropName.Scale: {
                itself.node.scale = value as number;
            } break;
            case EnumPropName.Anchor: {
                itself.node.setAnchorPoint(value as cc.Vec2);
            } break;
            case EnumPropName.Size: {
                itself.node.setContentSize(value as cc.Size);
            } break;
            case EnumPropName.Color: {
                itself.node.color = value as cc.Color;
            } break;
            case EnumPropName.Opacity: {
                itself.node.opacity = value as number;
            } break;
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
    /** 获取缓存的属性值 */
    private getPropValue(type: EnumPropName) {
        let itself = this;
        let propData = itself.getPropData();
        let value = propData[type];
        return value;
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

    //解析并返回属性值
    private handleValue(type: EnumPropName) {
        let itself = this;
        let value: TPropValue;
        switch (type) {
            case EnumPropName.Non: {
                value = void 0;
            } break;
            case EnumPropName.Active: {
                value = itself.getActive();
            } break;
            case EnumPropName.Position: {
                value = itself.getPosition();
            } break;
            case EnumPropName.Euler: {
                value = itself.getEuler();
            } break;
            case EnumPropName.Scale: {
                value = itself.getScale();
            } break;
            case EnumPropName.Anchor: {
                value = itself.getAnchor();
            } break;
            case EnumPropName.Size: {
                value = itself.getSize();
            } break;
            case EnumPropName.Color: {
                value = itself.getColor();
            } break;
            case EnumPropName.Opacity: {
                value = itself.getOpacity();
            } break;
            case EnumPropName.GrayScale: {
                value = itself.getGrayScale();
            } break;
            case EnumPropName.Label: {
                value = itself.getLabel();
            } break;
            case EnumPropName.Font: {
                value = itself.getFont();
            } break;
            case EnumPropName.LabelOutline: {
                value = itself.getLabelOutline();
            } break;
            case EnumPropName.SpriteFrame: {
                value = itself.getSpriteFrame();
            } break;
        }
        return value;
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
            case EnumPropName.Label: {
                let label = itself.node.getComponent(cc.Label);
                if (!label) {
                    return;
                }
                getPropData[EnumPropName.Label] = label.string;
            } break;
            case EnumPropName.Font: {
                let label = itself.node.getComponent(cc.Label);
                if (!label) {
                    return;
                }
                getPropData[EnumPropName.Font] = label.font;
            } break;
            case EnumPropName.LabelOutline: {
                let labelOutline = itself.node.getComponent(cc.LabelOutline);
                if (!labelOutline) {
                    return;
                }
                (getPropData[EnumPropName.LabelOutline] as cc.Color).set(labelOutline.color);
            } break;
            case EnumPropName.SpriteFrame: {
                let sprite = itself.node.getComponent(cc.Sprite);
                if (!sprite) {
                    return;
                }
                getPropData[EnumPropName.SpriteFrame] = sprite.spriteFrame;
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
            case EnumPropName.GrayScale: {
                let sprite = itself.node.getComponent(cc.Sprite);
                if (!sprite) {
                    return;
                }
                // 在 2.x 中，灰度设置需要使用材质
                getPropData[EnumPropName.GrayScale] = false; // 暂时设为 false
            } break;
        }
        if (type == itself.propKey) {
            let propData = itself.getPropData();
            itself._propValue = propData[itself.propKey];
        }
    }

    /** 显示隐藏 */
    private getActive() {
        let itself = this;
        let value = itself.getPropValue(EnumPropName.Active) as boolean;
        if (value == void 0) {
            value = itself.node.active;
            let defaultData = itself.getDefaultData();
            if (defaultData[EnumPropName.Active] == void 0) {
                defaultData[EnumPropName.Active] = value;
            }
        }
        return value;
    }
    /** 获取位置 */
    private getPosition() {
        let itself = this;
        let value = itself.getPropValue(EnumPropName.Position) as cc.Vec3;
        if (value == void 0) {
            value = itself.node.position;
            let defaultData = itself.getDefaultData();
            if (defaultData[EnumPropName.Position] == void 0) {
                defaultData[EnumPropName.Position] = itself.node.position;
            }
        }
        return value;
    }
    /** 旋转、欧拉角 */
    private getEuler() {
        let itself = this;
        let value = itself.getPropValue(EnumPropName.Euler) as cc.Vec3;
        if (value == void 0) {
            value = cc.v3(itself.node.eulerAngles);
            let defaultData = itself.getDefaultData();
            if (defaultData[EnumPropName.Euler] == void 0) {
                defaultData[EnumPropName.Euler] = cc.v3(itself.node.eulerAngles);
            }
        }
        return value;
    }
    /** 缩放 */
    private getScale() {
        let itself = this;
        console.log('getScale: ', itself.node.scale);
        let value = itself.getPropValue(EnumPropName.Scale) as number;
        if (value == void 0) {
            value = itself.node.scale;
            let defaultData = itself.getDefaultData();
            if (defaultData[EnumPropName.Scale] == void 0) {
                defaultData[EnumPropName.Scale] = itself.node.scale;
            }
        }
        return value;
    }
    /** 锚点 */
    private getAnchor() {
        let itself = this;
        let value = itself.getPropValue(EnumPropName.Anchor) as cc.Vec2;
        if (value == void 0) {
            value = cc.v2(itself.node.anchorX, itself.node.anchorY);
            let defaultData = itself.getDefaultData();
            if (defaultData[EnumPropName.Anchor] == void 0) {
                defaultData[EnumPropName.Anchor] = cc.v2(itself.node.anchorX, itself.node.anchorY);
            }
        }
        return value;
    }
    /** 宽高 */
    private getSize() {
        let itself = this;
        let value = itself.getPropValue(EnumPropName.Size) as cc.Size;
        if (value == void 0) {
            value = itself.node.getContentSize();
            let defaultData = itself.getDefaultData();
            if (defaultData[EnumPropName.Size] == void 0) {
                defaultData[EnumPropName.Size] = itself.node.getContentSize();
            }
        }
        return value;
    }
    /** 颜色 */
    private getColor() {
        let itself = this;
        let value = itself.getPropValue(EnumPropName.Color) as cc.Color;
        if (value == void 0) {
            value = itself.node.color;
            let defaultData = itself.getDefaultData();
            if (defaultData[EnumPropName.Color] == void 0) {
                defaultData[EnumPropName.Color] = itself.node.color;
            }
        }
        return value;
    }
    /** 透明度 */
    private getOpacity() {
        let itself = this;
        let value = itself.getPropValue(EnumPropName.Opacity) as number;
        if (value == void 0) {
            value = itself.node.opacity;
            let defaultData = itself.getDefaultData();
            if (defaultData[EnumPropName.Opacity] == void 0) {
                defaultData[EnumPropName.Opacity] = value;
            }
        }
        return value;
    }
    /** 灰度 */
    private getGrayScale() {
        let itself = this;
        let value = itself.getPropValue(EnumPropName.GrayScale) as boolean;
        if (value == void 0) {
            let sprite = itself.node.getComponent(cc.Sprite);
            if (!sprite) {
                return void 0;
            }
            // 在 2.x 中，灰度需要通过材质实现，这里暂时返回 false
            value = false;
            let defaultData = itself.getDefaultData();
            if (defaultData[EnumPropName.GrayScale] == void 0) {
                defaultData[EnumPropName.GrayScale] = value;
            }
        }
        return value;
    }
    /** 文本 */
    private getLabel() {
        let itself = this;
        let value = itself.getPropValue(EnumPropName.Label) as string;
        if (value == void 0) {
            let label = itself.node.getComponent(cc.Label);
            if (!label) {
                return void 0;
            }
            value = label.string;
            let defaultData = itself.getDefaultData();
            if (defaultData[EnumPropName.Label] == void 0) {
                defaultData[EnumPropName.Label] = value;
            }
        }
        return value;
    }
    /** 字体 */
    private getFont() {
        let itself = this;
        let value = itself.getPropValue(EnumPropName.Font) as cc.Font;
        if (value == void 0) {
            let label = itself.node.getComponent(cc.Label);
            if (!label) {
                return void 0;
            }
            value = label.font;
            let defaultData = itself.getDefaultData();
            if (defaultData[EnumPropName.Font] == void 0) {
                defaultData[EnumPropName.Font] = value;
            }
        }
        return value;
    }
    /** 文本描边 */
    private getLabelOutline() {
        let itself = this;
        let value = itself.getPropValue(EnumPropName.LabelOutline) as cc.Color;
        if (value == void 0) {
            let labelOutline = itself.node.getComponent(cc.LabelOutline);
            if (!labelOutline) {
                return void 0;
            }
            value = labelOutline.color;
            let defaultData = itself.getDefaultData();
            if (defaultData[EnumPropName.LabelOutline] == void 0) {
                defaultData[EnumPropName.LabelOutline] = value;
            }
        }
        return value;
    }
    /** 图片 */
    private getSpriteFrame() {
        let itself = this;
        let value = itself.getPropValue(EnumPropName.SpriteFrame) as cc.SpriteFrame;
        if (value == void 0) {
            let sprite = itself.node.getComponent(cc.Sprite);
            if (!sprite) {
                return void 0;
            }
            value = sprite.spriteFrame;
            let defaultData = itself.getDefaultData();
            if (defaultData[EnumPropName.SpriteFrame] == void 0) {
                defaultData[EnumPropName.SpriteFrame] = value;
            }
        }
        return value;
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