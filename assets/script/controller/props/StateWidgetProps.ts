import { EnumPropName } from "../StateEnum";
import { StateSelect } from "../StateSelect";

const { ccclass, property } = cc._decorator;
/** Widget 属性分组 - inspector 中显示为可折叠区域 */
@ccclass("StateWidgetProps")
export class StateWidgetProps {
    public owner: StateSelect = null;

    /** 内部 helper: 节点是否挂了某个 cc.Component (visible 函数共用). */
    private _hasComp(comp: any): boolean {
        return !!(this.owner && this.owner.node && this.owner.node.getComponent(comp));
    }

    @property({
        visible(this: StateWidgetProps) { return this._hasComp(cc.Widget); },
        displayName: "Widget启用 (WidgetEnabled)",
        tooltip: "Widget 组件的启用状态",
    })
    public get propWidgetEnabled() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.WidgetEnabled) : false;
    }

    public set propWidgetEnabled(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.WidgetEnabled, v);
    }

    @property({
        visible(this: StateWidgetProps) { return this._hasComp(cc.Widget); },
        displayName: "对齐模式 (WidgetAlignMode)",
        tooltip: "Widget 的对齐刷新模式",
    })
    public get propWidgetAlignMode() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.WidgetAlignMode) : false;
    }

    public set propWidgetAlignMode(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.WidgetAlignMode, v);
    }

    @property({
        visible(this: StateWidgetProps) { return this._hasComp(cc.Widget); },
        displayName: "顶部对齐 (IsAlignTop)",
        tooltip: "是否启用顶部对齐",
    })
    public get propWidgetIsAlignTop() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.WidgetIsAlignTop) : false;
    }

    public set propWidgetIsAlignTop(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.WidgetIsAlignTop, v);
    }

    @property({
        visible(this: StateWidgetProps) { return this._hasComp(cc.Widget); },
        displayName: "顶部边距 (WidgetTop)",
        tooltip: "顶部对齐的边距值",
    })
    public get propWidgetTop() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.WidgetTop) : false;
    }

    public set propWidgetTop(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.WidgetTop, v);
    }

    @property({
        visible(this: StateWidgetProps) { return this._hasComp(cc.Widget); },
        displayName: "底部对齐 (IsAlignBottom)",
        tooltip: "是否启用底部对齐",
    })
    public get propWidgetIsAlignBottom() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.WidgetIsAlignBottom) : false;
    }

    public set propWidgetIsAlignBottom(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.WidgetIsAlignBottom, v);
    }

    @property({
        visible(this: StateWidgetProps) { return this._hasComp(cc.Widget); },
        displayName: "底部边距 (WidgetBottom)",
        tooltip: "底部对齐的边距值",
    })
    public get propWidgetBottom() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.WidgetBottom) : false;
    }

    public set propWidgetBottom(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.WidgetBottom, v);
    }

    @property({
        visible(this: StateWidgetProps) { return this._hasComp(cc.Widget); },
        displayName: "左侧对齐 (IsAlignLeft)",
        tooltip: "是否启用左侧对齐",
    })
    public get propWidgetIsAlignLeft() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.WidgetIsAlignLeft) : false;
    }

    public set propWidgetIsAlignLeft(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.WidgetIsAlignLeft, v);
    }

    @property({
        visible(this: StateWidgetProps) { return this._hasComp(cc.Widget); },
        displayName: "左侧边距 (WidgetLeft)",
        tooltip: "左侧对齐的边距值",
    })
    public get propWidgetLeft() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.WidgetLeft) : false;
    }

    public set propWidgetLeft(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.WidgetLeft, v);
    }

    @property({
        visible(this: StateWidgetProps) { return this._hasComp(cc.Widget); },
        displayName: "右侧对齐 (IsAlignRight)",
        tooltip: "是否启用右侧对齐",
    })
    public get propWidgetIsAlignRight() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.WidgetIsAlignRight) : false;
    }

    public set propWidgetIsAlignRight(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.WidgetIsAlignRight, v);
    }

    @property({
        visible(this: StateWidgetProps) { return this._hasComp(cc.Widget); },
        displayName: "右侧边距 (WidgetRight)",
        tooltip: "右侧对齐的边距值",
    })
    public get propWidgetRight() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.WidgetRight) : false;
    }

    public set propWidgetRight(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.WidgetRight, v);
    }

    @property({
        visible(this: StateWidgetProps) { return this._hasComp(cc.Widget); },
        displayName: "水平居中 (IsAlignHCenter)",
        tooltip: "是否启用水平居中对齐",
    })
    public get propWidgetIsAlignHorizontalCenter() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.WidgetIsAlignHorizontalCenter) : false;
    }

    public set propWidgetIsAlignHorizontalCenter(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.WidgetIsAlignHorizontalCenter, v);
    }

    @property({
        visible(this: StateWidgetProps) { return this._hasComp(cc.Widget); },
        displayName: "水平偏移 (HCenter)",
        tooltip: "水平居中的偏移值",
    })
    public get propWidgetHorizontalCenter() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.WidgetHorizontalCenter) : false;
    }

    public set propWidgetHorizontalCenter(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.WidgetHorizontalCenter, v);
    }

    @property({
        visible(this: StateWidgetProps) { return this._hasComp(cc.Widget); },
        displayName: "垂直居中 (IsAlignVCenter)",
        tooltip: "是否启用垂直居中对齐",
    })
    public get propWidgetIsAlignVCenter() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.WidgetIsAlignVerticalCenter) : false;
    }

    public set propWidgetIsAlignVCenter(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.WidgetIsAlignVerticalCenter, v);
    }

    @property({
        visible(this: StateWidgetProps) { return this._hasComp(cc.Widget); },
        displayName: "垂直偏移 (VCenter)",
        tooltip: "垂直居中的偏移值",
    })
    public get propWidgetVerticalCenter() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.WidgetVerticalCenter) : false;
    }

    public set propWidgetVerticalCenter(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.WidgetVerticalCenter, v);
    }
}
