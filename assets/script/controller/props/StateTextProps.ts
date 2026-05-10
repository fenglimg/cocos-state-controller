import { EnumPropName } from "../StateEnum";
import { StateSelect } from "../StateSelect";

const { ccclass, property } = cc._decorator;

/**
 * 文本相关属性分组 - inspector 中显示为可折叠区域 (M2 拆自 StateComponentProps)
 *
 * 包含 8 个 Label / RichText / Font / LabelOutline 属性:
 * 1. LabelString
 * 2. LabelFontSize
 * 3. LabelLineHeight
 * 4. LabelSpacingX
 * 5. LabelWrapEnable
 * 6. Font
 * 7. LabelOutlineColor
 * 8. RichTextString
 */
@ccclass("StateTextProps")
export class StateTextProps {
    public owner: StateSelect = null;

    @property({
        displayName: "文本内容 (LabelString)",
        tooltip: "Label 组件的文本内容",
        visible: function (this: StateTextProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.LabelString);
        },
    })
    public get propLabelString() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.LabelString) : false;
    }

    public set propLabelString(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.LabelString, v);
    }

    @property({
        displayName: "文本字号 (LabelFontSize)",
        tooltip: "Label 组件的字体大小",
        visible: function (this: StateTextProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.LabelFontSize);
        },
    })
    public get propLabelFontSize() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.LabelFontSize) : false;
    }

    public set propLabelFontSize(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.LabelFontSize, v);
    }

    @property({
        displayName: "文本行高 (LabelLineHeight)",
        tooltip: "Label 组件的行高",
        visible: function (this: StateTextProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.LabelLineHeight);
        },
    })
    public get propLabelLineHeight() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.LabelLineHeight) : false;
    }

    public set propLabelLineHeight(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.LabelLineHeight, v);
    }

    @property({
        displayName: "文本字距 (LabelSpacingX)",
        tooltip: "Label 组件的字符间距",
        visible: function (this: StateTextProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.LabelSpacingX);
        },
    })
    public get propLabelSpacingX() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.LabelSpacingX) : false;
    }

    public set propLabelSpacingX(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.LabelSpacingX, v);
    }

    @property({
        displayName: "文本换行 (LabelWrapEnable)",
        tooltip: "Label 组件的自动换行开关",
        visible: function (this: StateTextProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.LabelWrapEnable);
        },
    })
    public get propLabelWrapEnable() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.LabelWrapEnable) : false;
    }

    public set propLabelWrapEnable(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.LabelWrapEnable, v);
    }

    @property({
        displayName: "字体 (Font)",
        tooltip: "Label 组件的字体资源",
        visible: function (this: StateTextProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.Font);
        },
    })
    public get propFont() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.Font) : false;
    }

    public set propFont(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.Font, v);
    }

    @property({
        displayName: "描边颜色 (LabelOutlineColor)",
        tooltip: "Label 描边组件的颜色",
        visible: function (this: StateTextProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.LabelOutlineColor);
        },
    })
    public get propLabelOutlineColor() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.LabelOutlineColor) : false;
    }

    public set propLabelOutlineColor(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.LabelOutlineColor, v);
    }

    @property({
        displayName: "富文本内容 (RichTextString)",
        tooltip: "RichText 组件的文本内容",
        visible: function (this: StateTextProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.RichTextString);
        },
    })
    public get propRichTextString() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.RichTextString) : false;
    }

    public set propRichTextString(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.RichTextString, v);
    }
}
