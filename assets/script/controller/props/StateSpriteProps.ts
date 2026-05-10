import { EnumPropName } from "../StateEnum";
import { StateSelect } from "../StateSelect";

const { ccclass, property } = cc._decorator;

/**
 * 图片相关属性分组 - inspector 中显示为可折叠区域 (M2 拆自 StateComponentProps)
 *
 * 包含 3 个 Sprite 相关属性:
 * 1. SpriteFrame
 * 2. SpriteFillRange
 * 3. GrayScale
 */
@ccclass("StateSpriteProps")
export class StateSpriteProps {
    public owner: StateSelect = null;

    @property({
        displayName: "图片 (SpriteFrame)",
        tooltip: "Sprite 组件的图片资源",
        visible: function (this: StateSpriteProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.SpriteFrame);
        },
    })
    public get propSpriteFrame() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.SpriteFrame) : false;
    }

    public set propSpriteFrame(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.SpriteFrame, v);
    }

    @property({
        displayName: "填充范围 (SpriteFillRange)",
        tooltip: "Sprite 组件的填充范围",
        visible: function (this: StateSpriteProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.SpriteFillRange);
        },
    })
    public get propSpriteFillRange() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.SpriteFillRange) : false;
    }

    public set propSpriteFillRange(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.SpriteFillRange, v);
    }

    @property({
        displayName: "灰度效果 (GrayScale)",
        tooltip: "节点的灰度显示效果",
        visible: function (this: StateSpriteProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.GrayScale);
        },
    })
    public get propGrayScale() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.GrayScale) : false;
    }

    public set propGrayScale(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.GrayScale, v);
    }
}
