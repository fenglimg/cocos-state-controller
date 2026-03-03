import { EnumPropName } from "../../Controller/StateEnum";
import { StateSelect } from "../../Controller/StateSelect";

const { ccclass, property } = cc._decorator;
/** 节点基础属性分组 - inspector 中显示为可折叠区域 */
@ccclass("StateNodeProps")
export class StateNodeProps {
    public owner: StateSelect = null;

    @property({ displayName: "显示/隐藏 (Active)", tooltip: "控制节点的显示和隐藏状态" })
    public get propActive() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.Active) : false;
    }

    public set propActive(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.Active, v);
    }

    @property({ displayName: "位置 (Position)", tooltip: "节点的位置属性" })
    public get propPosition() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.Position) : false;
    }

    public set propPosition(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.Position, v);
    }

    @property({ displayName: "缩放 (Scale)", tooltip: "节点的缩放属性" })
    public get propScale() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.Scale) : false;
    }

    public set propScale(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.Scale, v);
    }

    @property({ displayName: "颜色 (Color)", tooltip: "节点的颜色属性" })
    public get propColor() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.Color) : false;
    }

    public set propColor(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.Color, v);
    }

    @property({ displayName: "尺寸 (Size)", tooltip: "节点的宽高尺寸" })
    public get propSize() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.Size) : false;
    }

    public set propSize(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.Size, v);
    }

    @property({ displayName: "旋转 (Euler)", tooltip: "节点的旋转角度" })
    public get propEuler() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.Euler) : false;
    }

    public set propEuler(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.Euler, v);
    }

    @property({ displayName: "锚点 (Anchor)", tooltip: "节点的锚点位置" })
    public get propAnchor() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.Anchor) : false;
    }

    public set propAnchor(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.Anchor, v);
    }

    @property({ displayName: "透明度 (Opacity)", tooltip: "节点的透明度" })
    public get propOpacity() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.Opacity) : false;
    }

    public set propOpacity(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.Opacity, v);
    }
}
